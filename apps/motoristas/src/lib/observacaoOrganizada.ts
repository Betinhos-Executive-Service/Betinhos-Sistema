// Observação organizada: ao finalizar, o texto do motorista vira tópicos (Custom API new_OrganizarObservacao)
// para ele conferir. Qualquer falha grava o texto original, sem travar a finalização.

export const NO_OBSERVATION = "Sem observação.";
export const ORGANIZE_TIMEOUT_MS = 12000;
const MAX_TOPICS = 8;
const MAX_TOPIC_LENGTH = 140;

// Resumo na própria tela: "from" guarda o texto que gerou o resumo; se o texto mudar, o resumo some.
export type SummaryState = { from: string; topicos: string[]; status: "ready" | "failed" };

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

export async function generateSummary(text: string, organize: OrganizeObservation, timeoutMs = ORGANIZE_TIMEOUT_MS): Promise<SummaryState> {
  const from = text.trim();
  const topicos = from ? await summarize(from, organize, timeoutMs) : [];
  return { from, topicos, status: topicos.length ? "ready" : "failed" };
}

/** Resumo válido para o texto atual; qualquer alteração depois de gerado volta à etapa "Gerar resumo". */
export function activeSummary(summary: SummaryState | null, text: string): SummaryState | null {
  return summary && summary.from !== "" && summary.from === text.trim() ? summary : null;
}

/** Com resumo: tópicos + texto original. Falha da IA ("Enviar sem resumo"): só o texto original. */
export function summaryFinalValue(summary: SummaryState) {
  return summary.status === "ready" ? buildOrganizedObservation(summary.topicos, summary.from) : summary.from;
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
