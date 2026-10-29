// Prévia das fotos do checklist. O link de compartilhamento gravado (new_checklistveiculofoto.new_link) não serve
// como src de <img>: o flow "Consultar Arquivo OneDrive" (o mesmo do Sistema Betinhos) devolve o arquivo em base64
// e a tela monta um blob URL local.
import { DATAVERSE, retrieveMultiple } from "./dataverse";

export const FLOW_VAR_FOTOS = "new_URLFlowConsultarArquivoOneDrive";
export const MAX_BUSCAS_FOTOS = 3;
export const TEMPO_LIMITE_FOTO_MS = 45_000;
// Falha ao ler a URL do flow fica guardada por um tempo: várias miniaturas não repetem a consulta (nem o log).
export const ESPERA_FALHA_FLOW_MS = 10_000;

export type FotoParaPrevia = { link: string; nomeArquivo: string };
export type FotoCarregada = { url: string; mime: string; nome: string };
/** Carrega a foto; `pronta(link)` devolve na hora a que já chegou, para a tela não passar pelo skeleton. */
export type CarregarFoto = ((foto: FotoParaPrevia) => Promise<FotoCarregada>) & { pronta: (link: string) => FotoCarregada | undefined };

type FlowResult = { sucesso?: boolean; erro?: string; nomeArquivo?: string; mimeType?: string; conteudoBase64?: string };

const MIME_POR_EXTENSAO: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic" };

/** Valor sobrescrito da variável primeiro; sem ele, o padrão da definição. */
export async function lerVariavelAmbiente(schemaName: string) {
  const valores = await retrieveMultiple(DATAVERSE.variaveisValor, `$select=value&$filter=EnvironmentVariableDefinitionId/schemaname eq '${schemaName}'`);
  const valor = typeof valores.entities[0]?.value === "string" ? valores.entities[0].value.trim() : "";
  if (valor) return valor;
  const definicoes = await retrieveMultiple(DATAVERSE.variaveisDefinicao, `$select=defaultvalue&$filter=schemaname eq '${schemaName}'`);
  return typeof definicoes.entities[0]?.defaultvalue === "string" ? definicoes.entities[0].defaultvalue.trim() : "";
}

function mimeDaFoto(nome: string, informado?: string) {
  if (informado?.trim()) return informado.trim();
  return MIME_POR_EXTENSAO[nome.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function base64ParaBlob(base64: string, mime: string) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Fila simples: a vaga de quem termina passa direto para o próximo da fila, sem nunca passar de `max`.
function limitar(max: number) {
  let ativas = 0;
  const fila: (() => void)[] = [];
  return async <T>(tarefa: () => Promise<T>): Promise<T> => {
    if (ativas >= max) await new Promise<void>((resolve) => fila.push(resolve));
    else ativas += 1;
    try {
      return await tarefa();
    } finally {
      const proxima = fila.shift();
      if (proxima) proxima();
      else ativas -= 1;
    }
  };
}

// Cache por link durante a sessão: a foto que chegou fica guardada; o erro sai do cache para a próxima tentativa.
function comCache(buscar: (foto: FotoParaPrevia) => Promise<FotoCarregada>): CarregarFoto {
  const cache = new Map<string, Promise<FotoCarregada>>();
  const prontas = new Map<string, FotoCarregada>();
  const carregar = (foto: FotoParaPrevia) => {
    let item = cache.get(foto.link);
    if (!item) {
      item = buscar(foto);
      item.then((carregada) => { prontas.set(foto.link, carregada); }, () => { cache.delete(foto.link); });
      cache.set(foto.link, item);
    }
    return item;
  };
  return Object.assign(carregar, { pronta: (link: string) => prontas.get(link) });
}

// AbortSignal.timeout rejeita com DOMException "TimeoutError" (alguns navegadores antigos usam "AbortError").
const ehTempoEsgotado = (error: unknown) => typeof error === "object" && error !== null && ["TimeoutError", "AbortError"].includes(String((error as { name?: unknown }).name));

/**
 * Busca cada foto uma vez por sessão, com até 3 buscas ao mesmo tempo e tempo limite por busca.
 * A URL do flow é lida uma vez; uma falha nessa leitura vale por alguns segundos e depois é relida.
 */
export function createFotos({
  fetch = globalThis.fetch.bind(globalThis),
  criarUrl = (blob: Blob) => URL.createObjectURL(blob),
  lerUrlFlow = () => lerVariavelAmbiente(FLOW_VAR_FOTOS),
  maxBuscas = MAX_BUSCAS_FOTOS,
  tempoLimiteMs = TEMPO_LIMITE_FOTO_MS,
  esperaFalhaFlowMs = ESPERA_FALHA_FLOW_MS,
  agora = Date.now
}: {
  fetch?: typeof globalThis.fetch;
  criarUrl?: (blob: Blob) => string;
  lerUrlFlow?: () => Promise<string>;
  maxBuscas?: number;
  tempoLimiteMs?: number;
  esperaFalhaFlowMs?: number;
  agora?: () => number;
} = {}): CarregarFoto {
  let urlFlow: Promise<string> | null = null;
  let falhaFlowAte = 0;
  const naFila = limitar(maxBuscas);

  const flow = () => {
    if (urlFlow && falhaFlowAte && agora() >= falhaFlowAte) { urlFlow = null; falhaFlowAte = 0; }
    return (urlFlow ??= lerUrlFlow().then((valor) => {
      if (!/^https:\/\//i.test(valor)) throw new Error(`A prévia das fotos não está configurada neste ambiente (falta ${FLOW_VAR_FOTOS}).`);
      return valor;
    }).catch((error: unknown) => { falhaFlowAte = agora() + esperaFalhaFlowMs; throw error; }));
  };

  return comCache(async ({ link, nomeArquivo }) => {
    const url = await flow();
    // O corpo (base64) também é lido dentro da vaga e sob o mesmo tempo limite: uma busca pendurada libera a vaga.
    const { response, result } = await naFila(async () => {
      try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link, nomeArquivo }), signal: AbortSignal.timeout(tempoLimiteMs) });
        let result: FlowResult = {};
        try { result = (await response.json()) ?? {}; } catch (error) { if (ehTempoEsgotado(error)) throw error; /* Corpo vazio. */ }
        return { response, result };
      } catch (error) {
        if (ehTempoEsgotado(error)) throw new Error("Tempo esgotado ao buscar a foto no OneDrive.");
        throw error;
      }
    });
    if (!response.ok || result.sucesso !== true || !result.conteudoBase64) throw new Error(result.erro || `O OneDrive não respondeu (HTTP ${response.status}).`);
    const nome = result.nomeArquivo?.trim() || nomeArquivo;
    const mime = mimeDaFoto(nome, result.mimeType);
    return { url: criarUrl(base64ParaBlob(result.conteudoBase64, mime)), mime, nome };
  });
}

const escaparXml = (texto: string) => texto.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Mock local (localhost): SVG em data URL, sem rede, com o mesmo cache do real. `?fotos=falha` força o erro e `?fotos=lento` segura o skeleton por 4 s.
 */
export function createFotosMock(modo = ""): CarregarFoto {
  const atraso = modo === "lento" ? 4000 : 450;
  return comCache(({ nomeArquivo }) => new Promise<FotoCarregada>((resolve, reject) => setTimeout(() => {
    if (modo === "falha") { reject(new Error("Prévia simulada indisponível.")); return; }
    const nome = nomeArquivo || "foto.jpg";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#f7f9fc"/><rect x="24" y="24" width="592" height="432" rx="12" fill="none" stroke="#c7d2e2" stroke-width="4"/><path d="M220 300l80-90 60 70 40-40 80 60z" fill="#94a3b8"/><circle cx="420" cy="170" r="28" fill="#94a3b8"/><text x="320" y="390" font-family="Segoe UI, sans-serif" font-size="28" font-weight="700" fill="#0b2d5a" text-anchor="middle">${escaparXml(nome)}</text></svg>`;
    resolve({ url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, mime: "image/svg+xml", nome });
  }, atraso)));
}
