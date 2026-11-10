// Worker que envia Web Push para o PWA do App Motoristas. Quem chama (Flow) manda as inscrições
// e o texto; o Worker só cifra, assina (VAPID) e entrega. Nada é guardado aqui.
import { sendPush, type PushSubscriptionInput, type SendResult, type VapidKeys } from "./webpush.ts";

export type Env = { SHARED_SECRET: string; VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_JWK: string; VAPID_SUBJECT: string };

const MAX_SUBSCRIPTIONS = 50;
const MAX_PAYLOAD_BYTES = 3000;

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sameSecret(received: string, expected: string) {
  const digest = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((buffer) => new Uint8Array(buffer));
  const [a, b] = await Promise.all([digest(received), digest(expected)]);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

export async function handleRequest(request: Request, env: Env, fetchImpl: typeof fetch = fetch) {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/send") return reply(404, { error: "not_found" });
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  if (!env.SHARED_SECRET || !(await sameSecret(bearer, env.SHARED_SECRET))) return reply(401, { error: "unauthorized" });

  let input: { subscriptions?: PushSubscriptionInput[]; payload?: { title?: string; body?: string; url?: string; tag?: string } };
  try { input = await request.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const subscriptions = input.subscriptions ?? [];
  const payload = input.payload;
  if (!payload?.title || subscriptions.length === 0 || subscriptions.length > MAX_SUBSCRIPTIONS) return reply(400, { error: "invalid_request" });
  if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PAYLOAD_BYTES) return reply(413, { error: "payload_too_large" });

  const vapid: VapidKeys = { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), subject: env.VAPID_SUBJECT };
  const results: SendResult[] = await Promise.all(subscriptions.map((subscription) =>
    sendPush(subscription, payload, vapid, fetchImpl).catch((): SendResult => ({ endpoint: subscription.endpoint, status: 0, gone: false }))
  ));
  return reply(200, { results });
}

export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };
