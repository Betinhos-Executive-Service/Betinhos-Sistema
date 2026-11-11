// Agrupamento de erros repetidos e redução de payload para o log em new_appmotoristaslog.
// Módulo puro (sem window nem pacote): o wrapper em appErrorLogger.ts decide quando gravar.

export type ErrorCauseKind = "rede" | "timeout" | "outro";

export type ErrorCause = { kind: ErrorCauseKind; code: string };

export type ErrorHop = { name?: string; message?: string; code?: string };

export type RepeatGroup = {
  signature: string;
  message: string;
  source: string;
  action: string;
  phase: string;
  cause: ErrorCause;
  /** Ocorrências suprimidas desde o último resumo. */
  suppressed: number;
  firstAt: number;
  lastAt: number;
};

/** Depois de 5 min sem repetir, a mesma falha volta a ser gravada por completo. */
export const REPEAT_QUIET_MS = 5 * 60 * 1000;
/** Tamanho máximo do payload serializado (new_payloadjson). */
export const MAX_PAYLOAD_CHARS = 6000;
/** Teto de grupos guardados por sessão; ao estourar, sai o mais antigo. */
const MAX_GROUPS = 200;
export const MAX_LOG_MESSAGE_CHARS = 2000;
export const MAX_LOG_STACK_CHARS = 3000;
const MAX_HOP_MESSAGE_CHARS = 500;
const MAX_HOPS = 6;

const TIMEOUT_PATTERN = /time[d\s-]*out|timeout|etimedout|aborterror|the operation was aborted/i;
const NETWORK_PATTERN = /failed to fetch|load failed|network ?error|network request failed|net::err_|err_internet|err_network|falha de rede|erro de rede/i;

export function clip(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nextHop(record: Record<string, unknown>) {
  return record.cause ?? record.error ?? record.raw;
}

/** Percorre cause/error/raw (nesta ordem) e devolve os textos e códigos encontrados. */
function walkChain(error: unknown) {
  const hops: ErrorHop[] = [];
  const details: Record<string, string | number | boolean> = {};
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; current !== undefined && current !== null && depth < MAX_HOPS * 2 && hops.length < MAX_HOPS; depth += 1) {
    if (typeof current === "string") {
      const message = clip(current, MAX_HOP_MESSAGE_CHARS);
      if (message && hops[hops.length - 1]?.message !== message) hops.push({ message });
      break;
    }
    if (!isObject(current) || seen.has(current)) break;
    seen.add(current);
    const message = typeof current.message === "string" ? clip(current.message, MAX_HOP_MESSAGE_CHARS) : "";
    const rawCode = current.errorCode ?? current.code ?? current.status;
    const code = rawCode === undefined || rawCode === null || rawCode === "" ? "" : String(rawCode);

    if (message || code) {
      const last = hops[hops.length - 1];
      if (last && last.message === message) {
        if (code && !last.code) last.code = code;
      } else {
        hops.push({
          ...(current instanceof Error && current.name ? { name: current.name } : {}),
          ...(message ? { message } : {}),
          ...(code ? { code } : {})
        });
      }
    } else if (!(current instanceof Error)) {
      // Objeto de contexto sem mensagem (ex.: entidade, id, duração): guarda só os escalares, uma vez.
      for (const [key, value] of Object.entries(current)) {
        if ((typeof value === "string" || typeof value === "number" || typeof value === "boolean") && !(key in details)) {
          details[key] = typeof value === "string" ? clip(value, 200) : value;
        }
      }
    }
    current = nextHop(current);
  }
  return { hops, details };
}

/** Cadeia de causas sem repetição: cada mensagem aparece uma vez, mais os escalares de contexto. */
export function compactErrorChain(error: unknown) {
  const { hops, details } = walkChain(error);
  return { causas: hops, ...(Object.keys(details).length ? { contexto: details } : {}) };
}

/** Classifica a causa (rede, timeout ou outra) olhando toda a cadeia de erros. */
export function classifyErrorCause(error: unknown): ErrorCause {
  const { hops } = walkChain(error);
  const text = hops.map((hop) => hop.message ?? "").join(" | ");
  const code = hops.find((hop) => hop.code)?.code ?? "";
  if (TIMEOUT_PATTERN.test(text)) return { kind: "timeout", code };
  if (NETWORK_PATTERN.test(text)) return { kind: "rede", code };
  return { kind: "outro", code };
}

export function isNetworkCause(cause: ErrorCause) {
  return cause.kind === "rede" || cause.kind === "timeout";
}

/** Mensagem gravada: causas de rede/timeout entram no texto para o dedupe do pacote não juntá-las. */
export function withCauseLabel(message: string, cause: ErrorCause) {
  return isNetworkCause(cause) ? `${message} [causa: ${cause.kind}]` : message;
}

export function buildRepeatSignature(parts: { source?: string; action?: string; phase?: string; message: string; cause: ErrorCause }) {
  const message = parts.message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "#")
    .replace(/\d{4,}/g, "#");
  return [parts.source ?? "", parts.action ?? "", parts.phase ?? "", message, parts.cause.kind, parts.cause.code].join("|").slice(0, 600);
}

/** Primeira ocorrência da sessão grava completa; as repetidas só entram na contagem do resumo. */
export function createRepeatTracker(now: () => number = () => Date.now(), quietMs = REPEAT_QUIET_MS) {
  const groups = new Map<string, RepeatGroup>();

  return {
    /** `log: true` = gravar completo. `closed` traz o resumo do grupo anterior quando a falha voltou após silêncio. */
    record(entry: { signature: string; message: string; source: string; action: string; phase: string; cause: ErrorCause }) {
      const at = now();
      const group = groups.get(entry.signature);
      if (group && at - group.lastAt <= quietMs) {
        // Intervalo do resumo = só as ocorrências suprimidas desde o último resumo gravado.
        if (group.suppressed === 0) group.firstAt = at;
        group.suppressed += 1;
        group.lastAt = at;
        return { log: false as const, closed: null };
      }
      const closed = group && group.suppressed > 0 ? { ...group } : null;
      if (!group && groups.size >= MAX_GROUPS) groups.delete(groups.keys().next().value as string);
      groups.set(entry.signature, { ...entry, suppressed: 0, firstAt: at, lastAt: at });
      return { log: true as const, closed };
    },
    /** Resumos pendentes (grupos com repetição ainda não gravada); zera a contagem. */
    drain() {
      const summaries: RepeatGroup[] = [];
      groups.forEach((group) => {
        if (group.suppressed <= 0) return;
        summaries.push({ ...group });
        group.suppressed = 0;
      });
      return summaries;
    },
    reset() {
      groups.clear();
    }
  };
}

function shrink(value: unknown, stringLimit: number, arrayLimit: number, depth = 0): unknown {
  if (typeof value === "string") return clip(value, stringLimit);
  if (Array.isArray(value)) return value.slice(0, arrayLimit).map((item) => shrink(item, stringLimit, arrayLimit, depth + 1));
  if (isObject(value)) {
    if (depth > 6) return "[MaxDepth]";
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shrink(item, stringLimit, arrayLimit, depth + 1)]));
  }
  return value;
}

function serializedLength(value: unknown) {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Reduz o payload ao limite cortando textos e listas aos poucos; no pior caso guarda só as chaves. */
export function limitPayload<T>(value: T, maxChars = MAX_PAYLOAD_CHARS): unknown {
  if (serializedLength(value) <= maxChars) return value;
  for (const [stringLimit, arrayLimit] of [[1500, 40], [500, 20], [200, 10], [80, 5]] as const) {
    const reduced = shrink(value, stringLimit, arrayLimit);
    if (serializedLength(reduced) <= maxChars) return reduced;
  }
  return { truncado: true, chaves: isObject(value) ? Object.keys(value).slice(0, 20) : [] };
}

/** Tira do contexto as chaves que só repetem um erro já presente na cadeia de causas. */
export function dropRepeatedError(payload: unknown, error: unknown) {
  if (!isObject(payload) || Array.isArray(payload)) return payload;
  const inChain = new Set<unknown>();
  for (let current: unknown = error; isObject(current) && !inChain.has(current) && inChain.size < MAX_HOPS * 2; current = nextHop(current)) inChain.add(current);
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!inChain.has(value)) copy[key] = value;
  }
  return copy;
}
