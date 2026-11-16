// Decide o que fazer com um erro de envio: só falha de rede vai para a fila; sessão expirada pede login; o resto é erro de negócio.
export type ClasseErro = "rede" | "sessao" | "negocio";

// Mesmo texto de data/dataverse/fetchWebApi.ts (não importado para a lógica rodar em Node sem o resto do cliente).
const SESSAO_EXPIRADA = "Sua sessão da Microsoft expirou. Entre de novo para continuar.";
const STATUS_REDE = new Set([408, 429, 502, 503, 504]);
const TEXTO_REDE = /failed to fetch|networkerror|network request failed|load failed|flow sem resposta|timed out|timeout|tempo esgotado|err_internet_disconnected|err_network/i;

function lerStatus(error: unknown): number {
  const registro = (error ?? {}) as { status?: unknown; errorCode?: unknown };
  const status = Number(registro.status ?? registro.errorCode);
  return Number.isFinite(status) ? status : 0;
}

function lerMensagem(error: unknown): string {
  if (typeof error === "string") return error;
  return String((error as { message?: unknown } | null | undefined)?.message ?? "");
}

function ehRede(error: unknown, profundidade = 0): boolean {
  if (!error || profundidade > 3) return false;
  const nome = (error as { name?: unknown }).name;
  if (nome === "AbortError" || nome === "TimeoutError") return true;
  if (STATUS_REDE.has(lerStatus(error))) return true;
  if (TEXTO_REDE.test(lerMensagem(error))) return true;
  return ehRede((error as { cause?: unknown }).cause, profundidade + 1);
}

export function classificarErro(error: unknown, online: boolean = typeof navigator === "undefined" || navigator.onLine !== false): ClasseErro {
  const status = lerStatus(error);
  if (status === 401 || status === 403 || lerMensagem(error) === SESSAO_EXPIRADA) return "sessao";
  if (!online || ehRede(error)) return "rede";
  return "negocio";
}
