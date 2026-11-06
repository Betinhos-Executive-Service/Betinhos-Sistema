import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createPublicKey, createVerify, hkdfSync } from "node:crypto";
import test from "node:test";
import { handleRequest, type Env } from "../workers/web-push/src/index.ts";
import { encryptPayload, fromBase64Url, sendPush, toBase64Url, vapidAuthorization, type VapidKeys } from "../workers/web-push/src/webpush.ts";

const hk = (ikm: Buffer, salt: Buffer, info: Buffer, length: number) => Buffer.from(hkdfSync("sha256", ikm, salt, info, length));

// Aparelho de teste com as chaves p256dh/auth que o navegador geraria.
function makeDevice() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = Buffer.from("0123456789abcdef");
  return { ecdh, auth, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: toBase64Url(ecdh.getPublicKey()), auth: toBase64Url(auth) } };
}

// Decifra o corpo como o navegador faz (RFC 8291), por outro caminho (node:crypto) que o do Worker (WebCrypto).
function decrypt(body: Uint8Array, device: ReturnType<typeof makeDevice>) {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const idLen = buf[20];
  const asPublic = buf.subarray(21, 21 + idLen);
  const secret = device.ecdh.computeSecret(asPublic);
  const ikm = hk(secret, device.auth, Buffer.concat([Buffer.from("WebPush: info\0"), device.ecdh.getPublicKey(), asPublic]), 32);
  const cek = hk(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hk(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
  const data = buf.subarray(21 + idLen);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  return { record: buf.readUInt32BE(16), plain: plain.subarray(0, plain.length - 1), delimiter: plain[plain.length - 1] };
}

async function makeVapid(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return {
    publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    subject: "mailto:teste@example.com"
  };
}

test("o corpo cifrado é decifrado pelo aparelho (RFC 8291, registro de 4096, delimitador 2)", async () => {
  const device = makeDevice();
  const message = JSON.stringify({ title: "Novo serviço", body: "Aeroporto às 14h", url: "/WebResources/x?servicoId=1" });
  const body = await encryptPayload(device.subscription, new TextEncoder().encode(message));
  const result = decrypt(body, device);
  assert.equal(result.plain.toString("utf8"), message);
  assert.equal(result.record, 4096);
  assert.equal(result.delimiter, 2);
});

test("duas cifragens da mesma mensagem diferem (sal e chave efêmera novos)", async () => {
  const device = makeDevice();
  const data = new TextEncoder().encode("oi");
  const [a, b] = await Promise.all([encryptPayload(device.subscription, data), encryptPayload(device.subscription, data)]);
  assert.notDeepEqual(a, b);
});

test("chaves de inscrição inválidas são recusadas", async () => {
  await assert.rejects(() => encryptPayload({ endpoint: "https://fcm.googleapis.com/x", p256dh: "AAAA", auth: "AAAA" }, new Uint8Array([1])), /inválidas/);
});

test("o JWT VAPID é ES256, aud é a origem do serviço e a assinatura confere com a chave pública", async () => {
  const vapid = await makeVapid();
  const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", vapid, 1_000_000);
  const [, t, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assert.equal(k, vapid.publicKey);
  const [h, c, s] = t.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { typ: "JWT", alg: "ES256" });
  assert.deepEqual(JSON.parse(Buffer.from(c, "base64url").toString()), { aud: "https://fcm.googleapis.com", exp: 1_000_000 + 43200, sub: "mailto:teste@example.com" });
  const spki = createPublicKey({ key: { kty: "EC", crv: "P-256", x: vapid.privateJwk.x!, y: vapid.privateJwk.y! }, format: "jwk" });
  assert.ok(createVerify("SHA256").update(`${h}.${c}`).verify({ key: spki, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
  assert.equal(fromBase64Url(vapid.publicKey).length, 65);
});

test("sendPush marca 404/410 como inscrição expirada e recusa host fora dos serviços de push", async () => {
  const device = makeDevice();
  const vapid = await makeVapid();
  const gone = await sendPush(device.subscription, { title: "x" }, vapid, async () => new Response(null, { status: 410 }));
  assert.deepEqual([gone.status, gone.gone], [410, true]);
  const ok = await sendPush(device.subscription, { title: "x" }, vapid, async () => new Response(null, { status: 201 }));
  assert.deepEqual([ok.status, ok.gone], [201, false]);
  const blocked = await sendPush({ ...device.subscription, endpoint: "https://evil.example.com/x" }, { title: "x" }, vapid, async () => { throw new Error("não deveria chamar"); });
  assert.equal(blocked.status, 400);
  const http = await sendPush({ ...device.subscription, endpoint: "http://fcm.googleapis.com/x" }, { title: "x" }, vapid, async () => { throw new Error("não deveria chamar"); });
  assert.equal(http.status, 400);
});

test("o Worker exige o segredo, valida o pedido e devolve o resultado por aparelho", async () => {
  const device = makeDevice();
  const vapid = await makeVapid();
  const env: Env = { SHARED_SECRET: "segredo", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(vapid.privateJwk), VAPID_SUBJECT: vapid.subject };
  const call = (init: { auth?: string; body?: unknown; method?: string; path?: string }) => handleRequest(
    new Request(`https://w.example${init.path ?? "/send"}`, { method: init.method ?? "POST", headers: init.auth ? { Authorization: init.auth } : {}, body: init.body === undefined ? undefined : JSON.stringify(init.body) }),
    env,
    async () => new Response(null, { status: 201 })
  );
  const valid = { subscriptions: [device.subscription], payload: { title: "Novo serviço", body: "x", url: "/y" } };
  assert.equal((await call({ body: valid })).status, 401);
  assert.equal((await call({ auth: "Bearer errado", body: valid })).status, 401);
  assert.equal((await call({ auth: "Bearer segredo", method: "GET" })).status, 404);
  assert.equal((await call({ auth: "Bearer segredo", body: { subscriptions: [], payload: { title: "x" } } })).status, 400);
  assert.equal((await call({ auth: "Bearer segredo", body: { ...valid, payload: { title: "x".repeat(4000) } } })).status, 413);
  const ok = await call({ auth: "Bearer segredo", body: valid });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { results: [{ endpoint: device.subscription.endpoint, status: 201, gone: false }] });
});
