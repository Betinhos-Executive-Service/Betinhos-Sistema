export const DEFAULT_WAHA_ENDPOINT = "http://127.0.0.1:3000";
export const DEFAULT_WAHA_SESSION = "default";

export function normalizeWahaEndpoint(value = "") {
  try {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol)) return "";
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

export function normalizeWahaPhone(value = "") {
  const match = String(value).trim().match(/^\+?(\d{8,15})(?:@c\.us)?$/i);
  return match ? `+${match[1]}` : "";
}

export function extractWahaPhone(payload = {}) {
  return normalizeWahaPhone(payload.pn || payload.number || payload.id);
}

export function chatIdFromDomValue(value = "") {
  const match = String(value).match(/(\d+@(?:c\.us|lid))/i);
  return match?.[1] || "";
}

export async function resolveWahaPhone({ endpoint, apiKey, session = DEFAULT_WAHA_SESSION, chatId, fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  const directPhone = normalizeWahaPhone(chatId);
  if (directPhone) return directPhone;
  const base = normalizeWahaEndpoint(endpoint);
  const normalizedSession = String(session || DEFAULT_WAHA_SESSION).trim();
  if (!base || !apiKey || !normalizedSession || !String(chatId).toLowerCase().endsWith("@lid") || typeof fetchImpl !== "function") return "";

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(`${base}/api/${encodeURIComponent(normalizedSession)}/lids/${encodeURIComponent(chatId)}`, {
      headers: { Accept: "application/json", "X-Api-Key": String(apiKey) },
      signal: controller?.signal,
    });
    if (!response.ok) return "";
    return extractWahaPhone(await response.json().catch(() => ({})));
  } catch {
    return "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
