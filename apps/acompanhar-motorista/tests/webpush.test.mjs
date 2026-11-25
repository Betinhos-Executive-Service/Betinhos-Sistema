import assert from "node:assert/strict";
import test from "node:test";
import { encryptPayload, fromBase64Url, hkdf, sendPush, toBase64Url, vapidAuthorization } from "../src/webpush.mjs";

const enc = new TextEncoder();
const concat = (...p) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

// "Aparelho" de teste: par ECDH P-256 e segredo auth de 16 bytes, como o navegador entrega no subscribe().
async function aparelho() {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, pub, auth, inscricao: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: toBase64Url(pub), auth: toBase64Url(auth) } };
}

// RFC 8291 ao contrário: o que o navegador faz ao receber.
async function decifrar(a, corpo) {
  const salt = corpo.slice(0, 16), idlen = corpo[20], asPublic = corpo.slice(21, 21 + idlen), registro = corpo.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const segredo = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, a.par.privateKey, 256));
  const ikm = await hkdf(a.auth, segredo, concat(enc.encode("WebPush: info\0"), a.pub, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const chave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, chave, registro));
  assert.equal(claro.at(-1), 2, "delimitador do último registro");
  return new TextDecoder().decode(claro.slice(0, -1));
}

async function vapid() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)));
  return { par, chaves: { publicKey, privateJwk: await crypto.subtle.exportKey("jwk", par.privateKey), subject: "mailto:teste@example.com" } };
}

test("cifra aes128gcm: o aparelho decifra o texto", async () => {
  const a = await aparelho();
  const corpo = await encryptPayload(a.inscricao, enc.encode('{"titulo":"Motorista chegando"}'));
  assert.equal(new DataView(corpo.buffer).getUint32(16), 4096);
  assert.equal(await decifrar(a, corpo), '{"titulo":"Motorista chegando"}');
});

test("inscrição com chaves de tamanho errado é recusada", async () => {
  const a = await aparelho();
  await assert.rejects(encryptPayload({ ...a.inscricao, auth: toBase64Url(new Uint8Array(8)) }, enc.encode("x")), /inválidas/);
});

test("VAPID: JWT ES256 verificável, aud = origem do endpoint, exp em 12 h", async () => {
  const { par, chaves } = await vapid();
  const agora = 1_800_000_000;
  const h = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", chaves, agora);
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, chaves.publicKey);
  const [cab, carga, assinatura] = jwt.split(".");
  const corpo = JSON.parse(new TextDecoder().decode(fromBase64Url(carga)));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromBase64Url(cab))), { typ: "JWT", alg: "ES256" });
  assert.deepEqual(corpo, { aud: "https://fcm.googleapis.com", exp: agora + 12 * 3600, sub: "mailto:teste@example.com" });
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, par.publicKey, fromBase64Url(assinatura), enc.encode(`${cab}.${carga}`)));
});

test("sendPush: host fora da lista → 400 sem rede; 410 → gone; 201 → ok com cabeçalhos", async () => {
  const a = await aparelho(), { chaves } = await vapid(), pedidos = [];
  const f = (status) => async (url, init) => { pedidos.push({ url, init }); return new Response(null, { status }); };
  const fora = await sendPush({ ...a.inscricao, endpoint: "https://evil.example.com/x" }, { a: 1 }, chaves, f(201));
  assert.deepEqual(fora, { endpoint: "https://evil.example.com/x", status: 400, gone: true });
  assert.equal(pedidos.length, 0);
  assert.equal((await sendPush(a.inscricao, { a: 1 }, chaves, f(410))).gone, true);
  const ok = await sendPush(a.inscricao, { titulo: "Oi" }, chaves, f(201));
  assert.deepEqual(ok, { endpoint: a.inscricao.endpoint, status: 201, gone: false });
  const h = pedidos.at(-1).init.headers;
  assert.equal(h["Content-Encoding"], "aes128gcm");
  assert.equal(h.TTL, "3600");
  assert.equal(await decifrar(a, pedidos.at(-1).init.body), '{"titulo":"Oi"}');
});
