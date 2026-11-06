// Web Push sem dependências (WebCrypto): cifra aes128gcm (RFC 8291/8188) e autenticação VAPID (RFC 8292).
const encoder = new TextEncoder();

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey; subject: string };

const RECORD_SIZE = 4096;
// Só serviços de push dos navegadores: o chamador é autenticado, mas o Worker não deve ser proxy para qualquer URL.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|[\w-]+\.push\.apple\.com|[\w-]+\.push\.services\.mozilla\.com|[\w.-]+\.notify\.windows\.com)$/i;

export function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** Corpo cifrado (RFC 8291) para um aparelho; devolve o conteúdo do POST ao serviço de push. */
export async function encryptPayload(subscription: PushSubscriptionInput, plaintext: Uint8Array) {
  const uaPublic = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("Chaves da inscrição inválidas.");

  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256));

  const ikm = await hkdf(authSecret, sharedSecret, concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 marca o último (e único) registro; sem preenchimento.
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, record);
}

/** Cabeçalho Authorization VAPID (JWT ES256 válido por 12 h) para o serviço de push do endpoint. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000)) {
  const json = (value: unknown) => toBase64Url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${json({ typ: "JWT", alg: "ES256" })}.${json({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: vapid.subject })}`;
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)));
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${vapid.publicKey}`;
}

export type SendResult = { endpoint: string; status: number; gone: boolean };

export async function sendPush(subscription: PushSubscriptionInput, payload: unknown, vapid: VapidKeys, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const url = new URL(subscription.endpoint);
  if (url.protocol !== "https:" || !PUSH_HOSTS.test(url.hostname)) {
    return { endpoint: subscription.endpoint, status: 400, gone: false };
  }
  const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(payload)));
  const response = await fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high"
    },
    body
  });
  // 404/410: inscrição expirada ou revogada; o Flow apaga a linha.
  return { endpoint: subscription.endpoint, status: response.status, gone: response.status === 404 || response.status === 410 };
}
