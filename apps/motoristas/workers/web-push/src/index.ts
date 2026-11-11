// Worker que envia Web Push para o PWA do App Motoristas. Quem chama (Flow) manda as inscrições
// e o texto; o Worker só cifra, assina (VAPID) e entrega. Nada é guardado aqui.
import { sendPush, toBase64Url, type PushSubscriptionInput, type SendResult, type VapidKeys } from "./webpush.ts";

export type Env = { SHARED_SECRET: string; VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_JWK: string; VAPID_SUBJECT: string; IP_STAMP_SECRET?: string };

const MAX_SUBSCRIPTIONS = 50;
const MAX_PAYLOAD_BYTES = 3000;

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

async function sameSecret(received: string, expected: string) {
  const digest = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((buffer) => new Uint8Array(buffer));
  const [a, b] = await Promise.all([digest(received), digest(expected)]);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

// Carimbo do IP: o App Motoristas pede o IP público com data e hora assinados (HMAC-SHA256 de "ip|ts"); o plugin
// dos Comunicados confere com o mesmo segredo. Só origens do Dataverse (https://*.dynamics.com) leem a resposta.
const DYNAMICS_ORIGIN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.dynamics\.com$/i;

const corsHeaders = (origin: string | null): Record<string, string> =>
  origin && DYNAMICS_ORIGIN.test(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" } : { Vary: "Origin" };

async function stampIp(request: Request, env: Env, now: Date) {
  const cors = corsHeaders(request.headers.get("Origin"));
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply(404, { error: "not_found" }, cors);
  const answer = (status: number, body: unknown) => reply(status, body, { "Cache-Control": "no-store", ...cors });
  if (!env.IP_STAMP_SECRET) return answer(503, { error: "ip_stamp_disabled" });
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  if (!ip) return answer(400, { error: "ip_unavailable" });
  const ts = now.toISOString();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.IP_STAMP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ip}|${ts}`))));
  return answer(200, { ip, ts, sig });
}

export async function handleRequest(request: Request, env: Env, fetchImpl: typeof fetch = fetch, now: Date = new Date()) {
  const path = new URL(request.url).pathname;
  if (path === "/carimbo-ip") return stampIp(request, env, now);
  if (request.method !== "POST" || path !== "/send") return reply(404, { error: "not_found" });
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
