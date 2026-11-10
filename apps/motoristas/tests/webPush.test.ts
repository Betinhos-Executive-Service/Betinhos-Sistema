import assert from "node:assert/strict";
import test from "node:test";
import { buildSubscriptionRecord, resolveWebPushState, urlBase64ToUint8Array, type WebPushEnv } from "../src/lib/webPush.ts";

const base: WebPushEnv = { publicKey: "k", pwaContext: true, hasApis: true, isIos: false, standalone: true, permission: "default", subscribed: false };

test("sem chave VAPID ou fora do PWA o botão fica desligado", () => {
  assert.equal(resolveWebPushState({ ...base, publicKey: "" }), "off");
  assert.equal(resolveWebPushState({ ...base, pwaContext: false }), "off");
});

test("iPhone fora da tela inicial pede instalação antes de qualquer permissão", () => {
  assert.equal(resolveWebPushState({ ...base, isIos: true, standalone: false }), "needs-install");
  assert.equal(resolveWebPushState({ ...base, isIos: true, standalone: true }), "ready");
});

test("estados de permissão e inscrição", () => {
  assert.equal(resolveWebPushState({ ...base, hasApis: false }), "unsupported");
  assert.equal(resolveWebPushState({ ...base, permission: "denied" }), "denied");
  assert.equal(resolveWebPushState({ ...base, permission: "granted", subscribed: true }), "enabled");
  assert.equal(resolveWebPushState({ ...base, permission: "granted", subscribed: false }), "ready");
});

test("chave VAPID base64url vira bytes e a inscrição vira registro do motorista", () => {
  assert.deepEqual([...urlBase64ToUint8Array("AQID")], [1, 2, 3]);
  const keys: Record<string, ArrayBuffer> = { p256dh: new Uint8Array([251, 255]).buffer, auth: new Uint8Array([1, 2, 3]).buffer };
  const record = buildSubscriptionRecord("abc", { endpoint: "https://push.example/x", getKey: (name) => keys[name] }, "UA".repeat(200));
  assert.equal(record.new_chavep256dh, "-_8");
  assert.equal(record.new_chaveauth, "AQID");
  assert.equal(record.new_aparelho.length, 200);
  assert.equal(record["new_Funcionario@odata.bind"], "/cr40f_funcionarioses(abc)");
});
