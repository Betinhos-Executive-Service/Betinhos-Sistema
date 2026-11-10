import { cleanGuid } from "../comunicados/comunicados.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { consultarArquivoComprovante } from "./remoto.ts";
import { retrieveMultiple, retrieveOne } from "../../data/dataverse/cliente.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";

// Detalhe de leitura de uma despesa do relatório: campos preenchidos (com nomes dos lookups) e comprovantes.
// O arquivo vem pelo "Flow - Consultar Arquivo OneDrive", o mesmo da prévia de comprovantes do Sistema Betinhos.

type Row = Record<string, unknown>;
const FV = "@OData.Community.Display.V1.FormattedValue";
const texto = (valor: unknown) => (valor == null ? "" : String(valor).trim());
const formatado = (row: Row, campo: string) => texto(row[`${campo}${FV}`]);

export type DespesaDetalhe = {
  formaPagamento: string;
  cidade: string;
  veiculo: string;
  reserva: string;
  observacao: string;
  statusFinanceiro: string;
  origem: string;
  /** ISO de criação do registro. */
  criadoEm: string;
};

export type AnexoDespesa = { id: string; nome: string; driveItemId: string; url: string };

const DETALHE_SELECT = "$select=cr40f_despesaoperacionalid,_cr40f_formapagamento_value,_cr40f_cidade_value,_cr40f_veiculo_value,_cr40f_reserva_value,cr40f_observacao,cr40f_statusfinanceiro,cr40f_origem,createdon";
const ANEXO_SELECT = "$select=cr40f_anexodespesaoperacionalid,cr40f_nome,cr40f_nomearquivo,cr40f_sharelink,cr40f_urlsharepoint,cr40f_driveitemid,cr40f_ordem";

export function mapDespesaDetalhe(row: Row): DespesaDetalhe {
  return {
    formaPagamento: formatado(row, "_cr40f_formapagamento_value"),
    cidade: formatado(row, "_cr40f_cidade_value"),
    veiculo: formatado(row, "_cr40f_veiculo_value"),
    reserva: formatado(row, "_cr40f_reserva_value"),
    observacao: texto(row.cr40f_observacao),
    statusFinanceiro: formatado(row, "cr40f_statusfinanceiro"),
    origem: formatado(row, "cr40f_origem"),
    criadoEm: texto(row.createdon)
  };
}

const httpUrl = (valor: unknown) => (/^https:\/\/\S+$/i.test(texto(valor)) ? texto(valor) : "");

/** Só anexos com arquivo localizável (id do item ou link). Link de compartilhamento primeiro; o caminho do SharePoint é reserva. */
export function mapAnexos(rows: Row[]): AnexoDespesa[] {
  return rows
    .map((row) => ({
      id: cleanGuid(texto(row.cr40f_anexodespesaoperacionalid)).toLowerCase(),
      nome: texto(row.cr40f_nomearquivo) || texto(row.cr40f_nome) || "comprovante",
      driveItemId: texto(row.cr40f_driveitemid),
      url: httpUrl(row.cr40f_sharelink) || httpUrl(row.cr40f_urlsharepoint)
    }))
    .filter((anexo) => anexo.driveItemId || anexo.url);
}

/** Comprovantes novos ficam no SharePoint do sistema; os antigos, no OneDrive do noreply (`-my.sharepoint.com`). */
const noSharePoint = (url: string) => /^https:\/\/[^/]+\.sharepoint\.com\//i.test(url) && !/^https:\/\/[^/]+-my\.sharepoint\.com\//i.test(url);

export function corpoConsultaArquivo(anexo: AnexoDespesa) {
  return anexo.driveItemId
    ? { id: anexo.driveItemId, nomeArquivo: anexo.nome, ...(noSharePoint(anexo.url) ? { origem: "sharepoint" } : {}) }
    : { link: anexo.url, nomeArquivo: anexo.nome };
}

const POR_EXTENSAO: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", pdf: "application/pdf" };

export function mimeDoArquivo(nome: string, informado?: string) {
  const mime = (informado ?? "").split(";")[0].trim().toLowerCase();
  if (mime && mime !== "application/octet-stream") return mime;
  return POR_EXTENSAO[nome.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";
}

export type ArquivoComprovante = { nome: string; mime: string; url: string };

export async function carregarDetalheDespesa(id: string): Promise<{ detalhe: DespesaDetalhe; anexos: AnexoDespesa[] }> {
  if (isMockGastosCartao()) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      detalhe: { formaPagamento: "Cartão corporativo", cidade: "São Paulo", veiculo: "TST1A11 · Corolla", reserva: "", observacao: "Comprovante do posto na Marginal.", statusFinanceiro: "Pendente", origem: "App Motoristas", criadoEm: "2026-11-05T13:20:00Z" },
      anexos: [{ id: `${id}-a1`, nome: "comprovante.jpg", driveItemId: "mock", url: "" }]
    };
  }
  const limpo = cleanGuid(id);
  const [row, anexos] = await Promise.all([
    retrieveOne(DATAVERSE.despesasOperacionais, limpo, DETALHE_SELECT),
    retrieveMultiple(DATAVERSE.anexosDespesasOperacionais, `${ANEXO_SELECT}&$filter=_cr40f_despesa_value eq ${limpo} and statecode eq 0&$orderby=cr40f_ordem asc`)
  ]);
  return { detalhe: mapDespesaDetalhe(row as Row), anexos: mapAnexos(anexos.entities as Row[]) };
}

function base64ParaBlob(base64: string, tipo: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: tipo });
}

const MOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#fcfcfb"/><text x="300" y="120" font-family="monospace" font-size="34" text-anchor="middle" fill="#001a3d">POSTO MARGINAL</text><text x="60" y="260" font-family="monospace" font-size="28" fill="#334155">GASOLINA C  42,50 L</text><text x="60" y="320" font-family="monospace" font-size="28" fill="#334155">R$ 6,13 / L</text><text x="60" y="420" font-family="monospace" font-size="36" fill="#001a3d">TOTAL  R$ 260,53</text></svg>`;

/** Baixa o arquivo pelo flow e devolve um blob URL local (quem chama revoga). Erros viram mensagem curta para o motorista. */
export async function carregarArquivoComprovante(anexo: AnexoDespesa): Promise<ArquivoComprovante> {
  if (isMockGastosCartao()) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (new URLSearchParams(window.location.search).get("mockComprovante") === "erro") throw new Error("Não foi possível carregar o comprovante.");
    return { nome: anexo.nome, mime: "image/svg+xml", url: URL.createObjectURL(new Blob([MOCK_SVG], { type: "image/svg+xml" })) };
  }
  let resposta;
  try {
    resposta = await consultarArquivoComprovante(corpoConsultaArquivo(anexo));
  } catch {
    throw new Error("Não foi possível carregar o comprovante. Tente de novo em instantes.");
  }
  if (resposta.sucesso !== true || !resposta.conteudoBase64) throw new Error(resposta.erro || "Não foi possível carregar o comprovante.");
  const nome = resposta.nomeArquivo?.trim() || anexo.nome;
  const mime = mimeDoArquivo(nome, resposta.mimeType);
  return { nome, mime, url: URL.createObjectURL(base64ParaBlob(resposta.conteudoBase64, mime)) };
}
