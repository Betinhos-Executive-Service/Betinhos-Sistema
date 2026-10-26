export const DEFAULT_TRIAGE_ENDPOINT = "http://127.0.0.1:8765";

function maskSensitiveTextLegacy(value = "") {
  return String(value)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b\d{13,19}\b/g, "[DADO_FINANCEIRO]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");
}

function normalizeWhatsAppPhoneLegacy(value = "") {
  const digits = String(value).replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function messageFingerprintLegacy({ senderPhone = "", text = "", sentAt = "" } = {}) {
  const input = `${normalizeWhatsAppPhoneLegacy(senderPhone)}|${String(sentAt).trim()}|${String(text).trim().toLocaleLowerCase("pt-BR")}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wa-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function maskSensitiveText(value = "") {
  return String(value)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b\d{13,19}\b/g, "[DADO_FINANCEIRO]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");
}

function normalizeWhatsAppPhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function messageFingerprint({ senderPhone = "", text = "", sentAt = "" } = {}) {
  const input = `${normalizeWhatsAppPhone(senderPhone)}|${String(sentAt).trim()}|${String(text).trim().toLocaleLowerCase("pt-BR")}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wa-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}



export function buildTriageRequest(conversation = {}) {
  const senderPhone = normalizeWhatsAppPhone(conversation.senderPhone);
  const messages = (conversation.messages || []).slice(-8).map((message) => ({ ...message, text: maskSensitiveText(message.text).slice(0, 2000) }));
  const last = messages.at(-1) || {};
  return {
    requestId: messageFingerprint({ senderPhone, text: last.text, sentAt: last.sentAt }),
    conversationKey: senderPhone || conversation.senderName,
    senderName: conversation.senderName,
    senderPhone,
    messages,
    source: "whatsapp-web",
  };
}

export async function requestTriage(endpoint, conversation, sessionToken = "") {
  if (!endpoint) throw new Error("Configure o endpoint da IA na extensão.");
  const body = buildTriageRequest(conversation);
  const response = await fetch(endpoint.replace(/\/$/, "") + "/v1/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}`, "X-Local-Token": sessionToken } : {}) },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : payload.error?.message || payload.message || "A IA não respondeu.";
    throw new Error(detail);
  }
  return { ...body, classification: payload.data || payload };
}
