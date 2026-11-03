import { cleanGuid, GUID_PATTERN, validateSignature, type SignatureStrokes } from "./comunicados.ts";
import { DATAVERSE, retrieveMultiple, updateOne } from "./dataverse.ts";
import { reportAppError } from "./appErrorLogger.ts";
import { formatDataHora } from "./termosMulta.ts";

// Treinamentos do RH (tabelas cr40f_treinamento e cr40f_treinamentoparticipacao, provisionadas pelo Sistema Betinhos).
// A publicação no shell cria uma participação por funcionário do público; o App lê as do motorista logado
// e atualiza só a própria (abertura, leitura, assinatura, quiz). Quem está fora do público não tem participação e não vê nada.
// Valores dos choices espelham apps/shell/src/pages/treinamentos/domain/treinamentos.ts.
const ESTADO_PUBLICADO = 100000001; // choice cr40f_estado "publicado", espelha o shell
const NOTA_MINIMA_PADRAO = 70;

export type Alternativa = { id: string; texto: string };
export type Pergunta = { id: string; texto: string; alternativas: Alternativa[]; corretaId: string };
export type Anexo = { nome: string; caminho: string; tamanho: number; mime: string };

export type Treinamento = {
  id: string;
  titulo: string;
  descricao: string;
  /** Marcação simples: `# título`, `- item`, `**negrito**`, parágrafos separados por linha em branco. */
  conteudo: string;
  videoUrl: string;
  anexos: Anexo[];
  exigeAssinatura: boolean;
  exigeQuiz: boolean;
  notaMinima: number;
  perguntas: Pergunta[];
  /** Prazo `AAAA-MM-DD` ou vazio. */
  validade: string;
  publicadoEm: string | null;
  editadoEm: string | null;
};

export type Participacao = {
  id: string;
  treinamentoId: string;
  abertoEm: string | null;
  confirmadoEm: string | null;
  assinadoEm: string | null;
  nomeAssinante: string;
  assinaturaJson: string;
  nota: number | null;
  aprovado: boolean | null;
  tentativas: number;
  concluidoEm: string | null;
};

/** Um treinamento como o motorista vê: o conteúdo e a participação dele. */
export type TreinamentoMotorista = { treinamento: Treinamento; participacao: Participacao };

export const isMockTreinamentos = () => ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");

// ---------------- Leitura dos registros ----------------

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value || "")) as T; } catch { return fallback; }
}

export function parsePerguntas(value: unknown): Pergunta[] {
  const raw = parseJson<{ perguntas?: unknown }>(value, {});
  if (!Array.isArray(raw.perguntas)) return [];
  return raw.perguntas.flatMap((p: Partial<Pergunta>, i: number) => {
    if (!p || typeof p.texto !== "string" || !Array.isArray(p.alternativas)) return [];
    const alternativas = p.alternativas.flatMap((a: Partial<Alternativa>, j: number) => (a && typeof a.texto === "string" && a.texto.trim() ? [{ id: String(a.id || `a${i}-${j}`), texto: a.texto }] : []));
    const corretaId = String(p.corretaId || "");
    // Sem alternativa correta reconhecível a pergunta nunca pontua e poderia travar a conclusão: fica fora do quiz.
    if (alternativas.length < 2 || !alternativas.some((a) => a.id === corretaId)) return [];
    return [{ id: String(p.id || `p${i}`), texto: p.texto, alternativas, corretaId }];
  });
}

export function parseAnexos(value: unknown): Anexo[] {
  const raw = parseJson<unknown>(value, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a: Partial<Anexo>) => (a && typeof a.nome === "string" && typeof a.caminho === "string" ? [{ nome: a.nome, caminho: a.caminho, tamanho: Number(a.tamanho) || 0, mime: String(a.mime || "") }] : []));
}

const dateOrNull = (value: unknown) => (value ? String(value) : null);

export function mapTreinamento(row: Record<string, unknown>): Treinamento {
  const perguntas = parsePerguntas(row.cr40f_quizjson);
  return {
    id: cleanGuid(String(row.cr40f_treinamentoid ?? "")),
    titulo: String(row.cr40f_name ?? ""),
    descricao: String(row.cr40f_descricao ?? ""),
    conteudo: String(row.cr40f_conteudo ?? ""),
    videoUrl: String(row.cr40f_videourl ?? ""),
    anexos: parseAnexos(row.cr40f_anexosjson),
    exigeAssinatura: Boolean(row.cr40f_exigeassinatura),
    exigeQuiz: Boolean(row.cr40f_exigequiz) && perguntas.length > 0, // quiz sem pergunta válida não pode travar a conclusão
    notaMinima: typeof row.cr40f_notaminima === "number" ? row.cr40f_notaminima : NOTA_MINIMA_PADRAO,
    perguntas,
    validade: String(row.cr40f_validade ?? "").slice(0, 10),
    publicadoEm: dateOrNull(row.cr40f_publicadoem),
    editadoEm: dateOrNull(row.cr40f_editadoem)
  };
}

export function mapParticipacao(row: Record<string, unknown>): Participacao {
  return {
    id: cleanGuid(String(row.cr40f_treinamentoparticipacaoid ?? "")),
    treinamentoId: cleanGuid(String(row._cr40f_treinamento_value ?? "")),
    abertoEm: dateOrNull(row.cr40f_abertoem),
    confirmadoEm: dateOrNull(row.cr40f_confirmadoem),
    assinadoEm: dateOrNull(row.cr40f_assinadoem),
    nomeAssinante: String(row.cr40f_nomeassinante ?? ""),
    assinaturaJson: String(row.cr40f_assinaturajson ?? ""),
    nota: typeof row.cr40f_nota === "number" ? row.cr40f_nota : null,
    aprovado: typeof row.cr40f_aprovado === "boolean" ? row.cr40f_aprovado : null,
    tentativas: Number(row.cr40f_tentativas ?? 0),
    concluidoEm: dateOrNull(row.cr40f_concluidoem)
  };
}

// ---------------- Regras ----------------

type EtapaTreinamento = "leitura" | "assinatura" | "quiz" | "concluido";

/** Próxima coisa que o motorista precisa fazer: ler, assinar (se exigido), passar no quiz (se exigido) ou nada. */
export function proximaEtapa(item: Pick<Treinamento, "exigeAssinatura" | "exigeQuiz">, p: Participacao): EtapaTreinamento {
  if (p.concluidoEm) return "concluido";
  if (!p.confirmadoEm) return "leitura";
  if (item.exigeAssinatura && !p.assinadoEm) return "assinatura";
  if (item.exigeQuiz && !p.aprovado) return "quiz";
  return "concluido";
}

type StatusTreinamento = "novo" | "andamento" | "concluido";

export function statusTreinamento(p: Participacao): StatusTreinamento {
  if (p.concluidoEm) return "concluido";
  // confirmadoEm sem abertoEm: a gravação da abertura falhou e a leitura foi confirmada depois.
  if (p.abertoEm || p.confirmadoEm) return "andamento";
  return "novo";
}
const ORDEM_STATUS: Record<StatusTreinamento, number> = { novo: 0, andamento: 1, concluido: 2 };

export const isTreinamentoPendente = (item: TreinamentoMotorista) => !item.participacao.concluidoEm;

/** Pendentes primeiro (publicados mais recentes no topo); concluídos pelo mais recente. */
export function separarTreinamentos(items: TreinamentoMotorista[]) {
  const porData = (a: TreinamentoMotorista, b: TreinamentoMotorista, campo: (x: TreinamentoMotorista) => string | null) => String(campo(b) ?? "").localeCompare(String(campo(a) ?? ""));
  return {
    pendentes: items.filter(isTreinamentoPendente).sort((a, b) => porData(a, b, (x) => x.treinamento.publicadoEm)),
    concluidos: items.filter((item) => !isTreinamentoPendente(item)).sort((a, b) => porData(a, b, (x) => x.participacao.concluidoEm))
  };
}

export type ResultadoQuiz = { nota: number; aprovado: boolean; acertos: number; total: number };

/** Nota em percentual inteiro (2 de 3 = 66); aprova quando iguala ou passa a nota mínima. */
export function corrigirQuiz(perguntas: Pergunta[], respostas: Record<string, string>, notaMinima: number): ResultadoQuiz {
  const total = perguntas.length;
  const acertos = perguntas.filter((p) => p.corretaId && respostas[p.id] === p.corretaId).length;
  const nota = total ? Math.floor((acertos / total) * 100) : 0;
  return { nota, aprovado: nota >= notaMinima, acertos, total };
}

export const quizCompleto = (perguntas: Pergunta[], respostas: Record<string, string>) => perguntas.every((p) => Boolean(respostas[p.id]));

type VideoTreinamento = { kind: "embed"; src: string; href: string } | { kind: "arquivo"; src: string } | { kind: "link"; href: string };

const VIDEO_ARQUIVO = /\.(mp4|m4v|webm|mov)$/i;

/** YouTube e Vimeo viram player embutido; arquivo de vídeo (.mp4 etc.) toca no player nativo; outros links https (Stream, SharePoint) abrem fora. URL inválida: null. */
export function resolverVideo(url: string): VideoTreinamento | null {
  const texto = url.trim();
  if (!texto) return null;
  let parsed: URL;
  try { parsed = new URL(texto); } catch { return null; }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/^www\.|^m\./, "");
  let youtubeId = "";
  if (host === "youtu.be") youtubeId = parsed.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const partes = parsed.pathname.split("/").filter(Boolean);
    youtubeId = partes[0] === "watch" ? parsed.searchParams.get("v") ?? "" : ["embed", "shorts", "live", "v"].includes(partes[0]) ? partes[1] ?? "" : "";
  }
  if (/^[\w-]{11}$/.test(youtubeId)) return { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`, href: texto };
  const vimeo = host === "vimeo.com" || host === "player.vimeo.com" ? /^\/(?:video\/)?(\d+)/.exec(parsed.pathname) : null;
  if (vimeo) return { kind: "embed", src: `https://player.vimeo.com/video/${vimeo[1]}`, href: texto };
  if (VIDEO_ARQUIVO.test(parsed.pathname)) return { kind: "arquivo", src: texto };
  return { kind: "link", href: texto };
}

const SP_HOST = "https://betinhos.sharepoint.com";
const SP_SITE_PATH = "/sites/BetinhosGestoInterna";

/** Link do anexo no SharePoint: o caminho vem relativo ao site ou ao servidor (`/sites/...`); links absolutos passam direto. */
export function anexoUrl(anexo: Pick<Anexo, "caminho">) {
  const caminho = anexo.caminho.trim();
  if (/^https?:\/\//i.test(caminho)) return caminho;
  const relativo = caminho.startsWith("/") ? caminho : `/${caminho}`;
  const completo = relativo.startsWith("/sites/") ? relativo : SP_SITE_PATH + relativo;
  return SP_HOST + completo.split("/").map((parte) => encodeURIComponent(parte)).join("/");
}

export const isAnexoImagem = (anexo: Pick<Anexo, "mime" | "nome">) => anexo.mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(anexo.nome);

export const isAnexoVideo = (anexo: Pick<Anexo, "mime" | "nome">) => anexo.mime.startsWith("video/") || VIDEO_ARQUIVO.test(anexo.nome);

export function formatTamanho(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export const formatData = (value: string | null) => formatDataHora(value).slice(0, 10);

/** `AAAA-MM-DD` → `dd/mm/aaaa` sem passar por Date (coluna DateOnly). */
export const formatValidade = (validade: string) => (/^\d{4}-\d{2}-\d{2}$/.test(validade) ? validade.split("-").reverse().join("/") : "");

type Bloco = { tipo: "h"; texto: string } | { tipo: "p"; texto: string } | { tipo: "ul"; itens: string[] };

/** Marcação simples do conteúdo, igual à prévia do shell. */
export function blocosDoConteudo(conteudo: string): Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  const fecharParagrafo = () => { if (paragrafo.length) { blocos.push({ tipo: "p", texto: paragrafo.join("\n") }); paragrafo = []; } };
  for (const linha of conteudo.replace(/\r\n/g, "\n").split("\n")) {
    const item = /^\s*[-*•]\s+(.*)$/.exec(linha);
    const titulo = /^\s*#{1,3}\s+(.*)$/.exec(linha);
    if (item) {
      fecharParagrafo();
      const anterior = blocos[blocos.length - 1];
      if (anterior?.tipo === "ul") anterior.itens.push(item[1]);
      else blocos.push({ tipo: "ul", itens: [item[1]] });
    } else if (titulo) {
      fecharParagrafo();
      blocos.push({ tipo: "h", texto: titulo[1] });
    } else if (!linha.trim()) fecharParagrafo();
    else paragrafo.push(linha);
  }
  fecharParagrafo();
  return blocos;
}

/** Trechos de uma linha: texto comum e `**negrito**`, na ordem. */
export function trechos(texto: string): { negrito: boolean; texto: string }[] {
  return texto.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((parte) => (/^\*\*[^*]+\*\*$/.test(parte) ? { negrito: true, texto: parte.slice(2, -2) } : { negrito: false, texto: parte }));
}

/** Cópia do que o motorista leu, gravada na conclusão. Formato combinado com o shell (v1): não mude as chaves nem a ordem. */
export function snapshotConteudo(item: Treinamento): string {
  return JSON.stringify({
    v: 1,
    titulo: item.titulo,
    descricao: item.descricao,
    conteudo: item.conteudo,
    videoUrl: item.videoUrl,
    anexos: item.anexos.map((a) => ({ nome: a.nome, tamanho: a.tamanho })),
    exigeAssinatura: item.exigeAssinatura,
    exigeQuiz: item.exigeQuiz,
    notaMinima: item.notaMinima,
    publicadoEm: item.publicadoEm,
    editadoEm: item.editadoEm
  });
}

export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------- Payloads (puros, testáveis) ----------------

type Patch = Record<string, unknown>;
type Mudanca = { patch: Patch; participacao: Participacao };

/** Marca concluído quando, depois desta mudança, não falta mais nada. */
function fecharSeCompleto(item: Treinamento, p: Participacao, patch: Patch, agora: string): Mudanca {
  if (proximaEtapa(item, p) === "concluido") {
    p = { ...p, concluidoEm: agora };
    patch = { ...patch, cr40f_concluidoem: agora };
  }
  return { patch, participacao: p };
}

/** Erro de regra com texto pensado para o motorista ler; qualquer outro erro vira a mensagem amigável da tela. */
export class ErroTreinamento extends Error {}

export function mudancaConfirmacao(item: Treinamento, p: Participacao, agora = new Date().toISOString()): Mudanca {
  if (proximaEtapa(item, p) !== "leitura") throw new ErroTreinamento("A leitura já foi confirmada.");
  return fecharSeCompleto(item, { ...p, confirmadoEm: agora }, { cr40f_confirmadoem: agora }, agora);
}

export function mudancaAssinatura(item: Treinamento, p: Participacao, strokes: SignatureStrokes, nome: string, agora = new Date().toISOString()): Mudanca {
  if (proximaEtapa(item, p) !== "assinatura") throw new ErroTreinamento("Este treinamento não está na etapa de assinatura.");
  if (!validateSignature(strokes)) throw new ErroTreinamento("Desenhe sua assinatura antes de confirmar.");
  const assinaturaJson = JSON.stringify(strokes);
  if (assinaturaJson.length > 100000) throw new ErroTreinamento("A assinatura ficou grande demais. Limpe e assine novamente.");
  const nomeAssinante = nome.trim().slice(0, 200);
  if (!nomeAssinante) throw new ErroTreinamento("Não foi possível identificar o seu nome para assinar.");
  const patch: Patch = { cr40f_assinadoem: agora, cr40f_nomeassinante: nomeAssinante, cr40f_assinaturajson: assinaturaJson };
  return fecharSeCompleto(item, { ...p, assinadoEm: agora, nomeAssinante, assinaturaJson }, patch, agora);
}

export function mudancaQuiz(item: Treinamento, p: Participacao, respostas: Record<string, string>, agora = new Date().toISOString()): Mudanca & { resultado: ResultadoQuiz } {
  if (proximaEtapa(item, p) !== "quiz") throw new ErroTreinamento("Este treinamento não está na etapa do quiz.");
  if (!quizCompleto(item.perguntas, respostas)) throw new ErroTreinamento("Responda todas as perguntas antes de enviar.");
  const resultado = corrigirQuiz(item.perguntas, respostas, item.notaMinima);
  const tentativas = p.tentativas + 1;
  // respostasjson fica só como trilha para o RH; o App não lê de volta.
  const patch: Patch = { cr40f_nota: resultado.nota, cr40f_aprovado: resultado.aprovado, cr40f_tentativas: tentativas, cr40f_respostasjson: JSON.stringify(respostas) };
  const proxima = { ...p, nota: resultado.nota, aprovado: resultado.aprovado, tentativas };
  return { ...fecharSeCompleto(item, proxima, patch, agora), resultado };
}

// ---------------- Dados ----------------

const TREINAMENTO_SELECT = "$select=cr40f_treinamentoid,cr40f_name,cr40f_descricao,cr40f_conteudo,cr40f_videourl,cr40f_anexosjson,cr40f_exigeassinatura,cr40f_exigequiz,cr40f_notaminima,cr40f_quizjson,cr40f_validade,cr40f_publicadoem,cr40f_editadoem";
const PARTICIPACAO_SELECT = "$select=cr40f_treinamentoparticipacaoid,_cr40f_treinamento_value,cr40f_abertoem,cr40f_confirmadoem,cr40f_assinadoem,cr40f_nomeassinante,cr40f_assinaturajson,cr40f_nota,cr40f_aprovado,cr40f_tentativas,cr40f_concluidoem";

const mockParam = (name: string) => new URLSearchParams(window.location.search).get(name);
const MOCK_FUNCIONARIO = "11111111-1111-4111-8111-111111111111";
const MOCK_PASTA = "/sites/BetinhosGestoInterna/Documentos Compartilhados/Treinamentos/DEV";

let mockStore: { treinamentos: Record<string, unknown>[]; participacoes: Record<string, unknown>[] } | null = null;
function getMockStore() {
  mockStore ??= {
    treinamentos: [
      {
        cr40f_treinamentoid: "a1a1a1a1-0000-4000-8000-000000000001", cr40f_name: "[Mock] Direção defensiva na Marginal",
        cr40f_descricao: "Distância segura, chuva e pontos cegos nas vias expressas de São Paulo.",
        cr40f_conteudo: "# Antes de sair\n- Confira pneus, limpadores e faróis.\n- Programe o trajeto e avise a operação sobre desvios.\n\n# Na via\nMantenha **dois segundos** de distância do carro da frente; com chuva, dobre.\nEvite trocar de faixa perto de alças de acesso.\n\n# Com passageiro a bordo\n- Acelere e freie de forma progressiva.\n- Nada de celular na mão: use o suporte e o viva-voz só se for indispensável.",
        cr40f_videourl: `https://betinhos.sharepoint.com${MOCK_PASTA}/a1/stream.aspx?id=direcao-defensiva`,
        cr40f_anexosjson: JSON.stringify([{ nome: "Guia rápido.pdf", caminho: `${MOCK_PASTA}/a1/Guia rápido.pdf`, tamanho: 245760, mime: "application/pdf" }, { nome: "Ponto cego.jpg", caminho: `${MOCK_PASTA}/a1/Ponto cego.jpg`, tamanho: 180224, mime: "image/jpeg" }, { nome: "Manobra de ré.mp4", caminho: `${MOCK_PASTA}/a1/Manobra de ré.mp4`, tamanho: 5242880, mime: "video/mp4" }]),
        cr40f_exigeassinatura: false, cr40f_exigequiz: false, cr40f_notaminima: null, cr40f_quizjson: "", cr40f_validade: "2026-12-15",
        cr40f_publicadoem: "2026-10-28T12:00:00Z"
      },
      {
        cr40f_treinamentoid: "a1a1a1a1-0000-4000-8000-000000000002", cr40f_name: "[Mock] Atendimento premium ao passageiro",
        cr40f_descricao: "Padrão Betinhos de recepção, bagagem e discrição. Exige assinatura e quiz.",
        cr40f_conteudo: "# Recepção\nEsteja na porta de desembarque **15 minutos antes**, com a placa de identificação visível.\n\n# Bagagem\n- O motorista carrega as malas; o passageiro nunca espera no meio-fio.\n- Confira o porta-malas antes de fechar.\n\n# Discrição\nNão comente outros clientes nem trajetos. Conversa só se o passageiro puxar assunto.",
        cr40f_videourl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        cr40f_anexosjson: "[]",
        cr40f_exigeassinatura: true, cr40f_exigequiz: true, cr40f_notaminima: 70,
        cr40f_quizjson: JSON.stringify({ perguntas: [
          { id: "q1", texto: "Com quanto tempo de antecedência o motorista deve estar na porta de desembarque?", alternativas: [{ id: "q1a", texto: "5 minutos" }, { id: "q1b", texto: "15 minutos" }, { id: "q1c", texto: "Na hora marcada" }], corretaId: "q1b" },
          { id: "q2", texto: "Quem carrega as malas do passageiro?", alternativas: [{ id: "q2a", texto: "O motorista" }, { id: "q2b", texto: "O passageiro" }, { id: "q2c", texto: "Depende do peso" }], corretaId: "q2a" },
          { id: "q3", texto: "O passageiro pergunta quem foi o último cliente que você levou. O que fazer?", alternativas: [{ id: "q3a", texto: "Contar, se for alguém conhecido" }, { id: "q3b", texto: "Explicar com educação que não comenta outros clientes" }, { id: "q3c", texto: "Mudar de assunto sem responder" }], corretaId: "q3b" }
        ] }),
        cr40f_validade: "", cr40f_publicadoem: "2026-10-30T09:30:00Z"
      },
      {
        cr40f_treinamentoid: "a1a1a1a1-0000-4000-8000-000000000003", cr40f_name: "[Mock] Fora do público (não deve aparecer)",
        cr40f_descricao: "Publicado para outro funcionário: sem participação do motorista local.", cr40f_conteudo: "Texto.", cr40f_videourl: "", cr40f_anexosjson: "[]",
        cr40f_exigeassinatura: false, cr40f_exigequiz: false, cr40f_notaminima: null, cr40f_quizjson: "", cr40f_validade: "",
        cr40f_publicadoem: "2026-10-30T10:00:00Z"
      }
    ],
    participacoes: [
      { cr40f_treinamentoparticipacaoid: "b2b2b2b2-0000-4000-8000-000000000001", _cr40f_treinamento_value: "a1a1a1a1-0000-4000-8000-000000000001", _cr40f_funcionario_value: MOCK_FUNCIONARIO, cr40f_tentativas: 0 },
      { cr40f_treinamentoparticipacaoid: "b2b2b2b2-0000-4000-8000-000000000002", _cr40f_treinamento_value: "a1a1a1a1-0000-4000-8000-000000000002", _cr40f_funcionario_value: MOCK_FUNCIONARIO, cr40f_tentativas: 0 },
      { cr40f_treinamentoparticipacaoid: "b2b2b2b2-0000-4000-8000-000000000003", _cr40f_treinamento_value: "a1a1a1a1-0000-4000-8000-000000000003", _cr40f_funcionario_value: "99999999-9999-4999-8999-999999999999", cr40f_tentativas: 0 }
    ]
  };
  return mockStore;
}

const mockDelay = () => new Promise((resolve) => setTimeout(resolve, 400));

/** Mapeia e avisa no log (sem incomodar o motorista) quando o RH exigiu quiz sem pergunta válida. */
function mapTreinamentos(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const treinamento = mapTreinamento(row);
    if (row.cr40f_exigequiz && !treinamento.exigeQuiz) {
      reportAppError(new Error("Treinamento exige quiz, mas o quiz não tem pergunta válida."), { source: "treinamentos", action: "mapTreinamentos", severity: "warning", notifyUser: false, detailId: treinamento.id });
    }
    return treinamento;
  });
}

async function carregarLinhas(motoristaId: string) {
  if (isMockTreinamentos()) {
    const store = getMockStore();
    return {
      treinamentos: mockParam("mockTreinamentos") === "vazio" ? [] : mapTreinamentos(store.treinamentos),
      participacoes: store.participacoes.filter((row) => row._cr40f_funcionario_value === MOCK_FUNCIONARIO).map(mapParticipacao)
    };
  }
  const id = cleanGuid(motoristaId);
  if (!GUID_PATTERN.test(id)) throw new Error("Motorista não identificado para carregar treinamentos.");
  const [t, p] = await Promise.all([
    retrieveMultiple(DATAVERSE.treinamentos, `${TREINAMENTO_SELECT}&$filter=cr40f_estado eq ${ESTADO_PUBLICADO} and statecode eq 0&$orderby=cr40f_publicadoem desc`),
    // Filtra pelo motorista logado: quem tem leitura ampla veria a participação de todos.
    retrieveMultiple(DATAVERSE.treinamentoParticipacoes, `${PARTICIPACAO_SELECT}&$filter=_cr40f_funcionario_value eq ${id} and statecode eq 0`)
  ]);
  return {
    treinamentos: mapTreinamentos(t.entities as Record<string, unknown>[]),
    participacoes: p.entities.map((row) => mapParticipacao(row as Record<string, unknown>))
  };
}

/** Uma participação por treinamento; se a publicação deixou duas, fica a mais adiantada (a outra o RH limpa). */
export function participacaoPorTreinamento(participacoes: Participacao[]) {
  const avanco = (p: Participacao) => ORDEM_STATUS[statusTreinamento(p)];
  const minhas = new Map<string, Participacao>();
  for (const p of participacoes) {
    const atual = minhas.get(p.treinamentoId);
    if (!atual || avanco(p) > avanco(atual)) minhas.set(p.treinamentoId, p);
  }
  return minhas;
}

/** Treinamentos publicados que têm participação do motorista logado (a publicação no shell cria uma por funcionário do público). */
export async function listarTreinamentosMotorista(motoristaId: string): Promise<TreinamentoMotorista[]> {
  const { treinamentos, participacoes } = await carregarLinhas(motoristaId);
  const minhas = participacaoPorTreinamento(participacoes);
  return treinamentos.flatMap((treinamento) => {
    const participacao = minhas.get(treinamento.id);
    return participacao ? [{ treinamento, participacao }] : [];
  });
}

/** Registra a primeira abertura (a tela só chama quando ainda não há abertoem). */
export function abrirTreinamento(p: Participacao): Promise<Participacao> {
  const agora = new Date().toISOString();
  return aplicar({ patch: { cr40f_abertoem: agora }, participacao: { ...p, abertoEm: agora } });
}

async function aplicar(mudanca: Mudanca, item?: Treinamento) {
  if (item && mudanca.patch.cr40f_concluidoem) {
    const snapshot = snapshotConteudo(item);
    mudanca = { ...mudanca, patch: { ...mudanca.patch, cr40f_conteudosnapshot: snapshot, cr40f_conteudohash: await sha256Hex(snapshot) } };
  }
  if (isMockTreinamentos()) {
    await mockDelay();
    if (mockParam("mockTreinamentoErro") === "gravar") throw new Error("Falha simulada ao gravar.");
    const row = getMockStore().participacoes.find((p) => p.cr40f_treinamentoparticipacaoid === mudanca.participacao.id);
    if (!row) throw new Error("Participação não encontrada.");
    Object.assign(row, mudanca.patch);
    return mapParticipacao(row);
  }
  await updateOne(DATAVERSE.treinamentoParticipacoes, mudanca.participacao.id, mudanca.patch);
  return mudanca.participacao;
}

export const confirmarLeitura = (item: TreinamentoMotorista) => aplicar(mudancaConfirmacao(item.treinamento, item.participacao), item.treinamento);
export const assinarTreinamento = (item: TreinamentoMotorista, strokes: SignatureStrokes, nome: string) => aplicar(mudancaAssinatura(item.treinamento, item.participacao, strokes, nome), item.treinamento);

export async function responderQuiz(item: TreinamentoMotorista, respostas: Record<string, string>) {
  const mudanca = mudancaQuiz(item.treinamento, item.participacao, respostas);
  const participacao = await aplicar(mudanca, item.treinamento);
  return { participacao, resultado: mudanca.resultado };
}
