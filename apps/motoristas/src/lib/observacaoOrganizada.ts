// Observação organizada: ao finalizar, o texto do motorista vira tópicos (Custom API new_OrganizarObservacao)
// para ele conferir. Qualquer falha grava o texto original, sem travar a finalização.

export const NO_OBSERVATION = "Sem observação.";
export const ORGANIZE_TIMEOUT_MS = 12000;
const MAX_TOPICS = 8;
const MAX_TOPIC_LENGTH = 140;

export type ObservationReview =
  | { kind: "direct"; value: string }
  | { kind: "review"; original: string; topicos: string[] };

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

export async function prepareObservationReview(text: string, organize: OrganizeObservation, timeoutMs = ORGANIZE_TIMEOUT_MS): Promise<ObservationReview> {
  const original = text.trim();
  if (!original) return { kind: "direct", value: NO_OBSERVATION };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<string>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
    const topicos = parseOrganizeResult(await Promise.race([organize(original), timeout]));
    return topicos.length ? { kind: "review", original, topicos } : { kind: "direct", value: original };
  } catch {
    return { kind: "direct", value: original };
  } finally {
    clearTimeout(timer);
  }
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
