// Observação organizada: ao finalizar, o texto do motorista vira tópicos (Custom API new_OrganizarObservacao)
// para ele conferir. Qualquer falha grava o texto original, sem travar a finalização.

export const NO_OBSERVATION = "Sem observação.";
export const ORGANIZE_TIMEOUT_MS = 12000;
const MAX_TOPICS = 8;
const MAX_TOPIC_LENGTH = 140;

// Conferência: tópicos somente leitura + texto original editável.
// summarizedFrom guarda o texto que gerou os tópicos; se o original mudou, é preciso atualizar o resumo.
export type ReviewStatus = "ready" | "updating" | "failed";
export type ReviewState = { original: string; summarizedFrom: string; topicos: string[]; status: ReviewStatus };

export type ObservationReview = { kind: "direct"; value: string } | ({ kind: "review" } & ReviewState);

export type OrganizeObservation = (text: string) => Promise<string>;

export function parseOrganizeResult(json: unknown): string[] {
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    if (!parsed?.ok || !Array.isArray(parsed.topicos)) return [];
    return parsed.topicos
      .map((topic: unknown) => String(topic ?? "").trim().slice(0, MAX_TOPIC_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_TOPICS);
  } catch {
    return [];
  }
}

export function buildOrganizedObservation(topicos: string[], original: string) {
  return `${topicos.map((topic) => `• ${topic}`).join("\n")}\n\nTexto original: ${original.trim()}`;
}

async function summarize(original: string, organize: OrganizeObservation, timeoutMs: number): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<string>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
    return parseOrganizeResult(await Promise.race([organize(original), timeout]));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareObservationReview(text: string, organize: OrganizeObservation, timeoutMs = ORGANIZE_TIMEOUT_MS): Promise<ObservationReview> {
  const original = text.trim();
  if (!original) return { kind: "direct", value: NO_OBSERVATION };
  const topicos = await summarize(original, organize, timeoutMs);
  return { kind: "review", original, summarizedFrom: original, topicos, status: topicos.length ? "ready" : "failed" };
}

export function isReviewStale(state: ReviewState) {
  return state.status !== "failed" && state.original.trim() !== state.summarizedFrom;
}

export function canFinalizeReview(state: ReviewState) {
  return state.status !== "updating" && state.original.trim() !== "" && !isReviewStale(state);
}

// Único caso sem resumo: a IA falhou; aí grava só o texto original.
export function reviewFinalValue(state: ReviewState) {
  return state.status === "failed" ? state.original.trim() : buildOrganizedObservation(state.topicos, state.original);
}

export async function refreshReview(state: ReviewState, organize: OrganizeObservation, timeoutMs = ORGANIZE_TIMEOUT_MS): Promise<ReviewState> {
  const original = state.original.trim();
  const topicos = await summarize(original, organize, timeoutMs);
  return topicos.length ? { original: state.original, summarizedFrom: original, topicos, status: "ready" } : { ...state, status: "failed" };
}

export type TopicKind = "atraso" | "espera" | "pedagio" | "combustivel" | "passageiro" | "ocorrencia" | "outros";

const TOPIC_RULES: Array<[TopicKind, RegExp]> = [
  ["atraso", /\batras/],
  ["espera", /\besper|aguard/],
  ["pedagio", /pedagio|estacionamento|estacionei|\bvaga\b/],
  ["combustivel", /combustivel|abastec|gasolina|etanol|diesel|tanque/],
  ["ocorrencia", /ocorrencia|acidente|batida|multa|pneu|policia|problema|avaria|quebr/],
  ["passageiro", /passageir|cliente|executivo/],
  ["outros", /^outros?\b/]
];

/** Tipo do tópico por palavra-chave; null quando nada casa (sem ícone). */
export function topicKind(topic: string): TopicKind | null {
  const text = topic.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return TOPIC_RULES.find(([, rule]) => rule.test(text))?.[0] ?? null;
}

// Modo local (sem Xrm): uma frase por tópico, para navegar e conferir a tela.
export async function mockOrganizeObservation(text: string) {
  const topicos = text
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}.`);
  return JSON.stringify({ ok: true, topicos, motivo: null, ms: 0, input_tokens: 0, output_tokens: 0 });
}
