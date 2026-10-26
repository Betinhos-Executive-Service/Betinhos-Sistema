import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LIMITE_CORPO, sha256Hex, tokenValido, tratarApi } from "../src/api.mjs";
import worker from "../src/worker.mjs";
import { emailOculto, emailValido, mascararTelefone, telefoneOculto, telefoneParaEnvio, telefoneValido } from "../public/validacao.mjs";

const TOKEN = "A".repeat(40) + "_-9"; // 43 chars base64url
const PID = "11111111-2222-3333-4444-555555555555";
const ORIGEM = "https://cadastro.betinhos.com.br";

function req(caminho, corpo, headers = {}) {
  const body = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return new Request(ORIGEM + caminho, { method: "POST", body, headers: { "Content-Type": "application/json", Origin: ORIGEM, ...headers } });
}

function flowFalso(status, corpo) {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url, corpo: JSON.parse(init.body) });
    return new Response(JSON.stringify(corpo), { status });
  };
  f.chamadas = chamadas;
  return f;
}

const env = { FLOW_URL: "https://flow.exemplo/sas" };
const chamar = (r, f, e = env) => tratarApi(r, e, new URL(r.url), f);

test("sha256Hex igual ao node:crypto, hex minúsculo", async () => {
  assert.equal(await sha256Hex(TOKEN), createHash("sha256").update(TOKEN, "utf8").digest("hex"));
});

test("tokenValido exige 43 chars base64url", () => {
  assert.ok(tokenValido(TOKEN));
  assert.ok(!tokenValido(TOKEN.slice(1)));
  assert.ok(!tokenValido(TOKEN.slice(1) + "+"));
  assert.ok(!tokenValido(null));
});

test("telefone e e-mail", () => {
  assert.ok(telefoneValido("(11) 98765-4321"));
  assert.ok(telefoneValido("+1 555 123 4567"));
  assert.ok(!telefoneValido("123456789"));
  assert.ok(!telefoneValido("1".repeat(16)));
  assert.ok(emailValido("a@b.co"));
  assert.ok(!emailValido("a@b"));
  assert.ok(!emailValido("a b@c.d"));
  assert.equal(mascararTelefone("11987654321"), "(11) 98765-4321");
  assert.equal(mascararTelefone("1133334444"), "(11) 3333-4444");
  assert.equal(mascararTelefone("+5511987654321"), "+55 (11) 98765-4321");
  assert.equal(telefoneParaEnvio("(11) 98765-4321"), "+5511987654321");
  assert.equal(telefoneParaEnvio("+1 555 123 4567"), "+15551234567");
});

test("ler ok: manda só o hash ao flow e repassa o corpo", async () => {
  const f = flowFalso(200, { passageiros: [{ id: PID, primeiroNome: "Ana", temFoto: false }] });
  const r = await chamar(req("/api/ler", { token: TOKEN }), f);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).passageiros[0].primeiroNome, "Ana");
  assert.deepEqual(f.chamadas[0].corpo, { op: "ler", hash: await sha256Hex(TOKEN) });
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});

test("ler repassa a foto atual (base64 grande) sem filtrar", async () => {
  const foto = { mimeType: "image/jpeg", base64: "A".repeat(3 * 1024 * 1024) };
  const f = flowFalso(200, { passageiros: [{ id: PID, primeiroNome: "Ana", temFoto: true, foto }] });
  const r = await chamar(req("/api/ler", { token: TOKEN }), f);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).passageiros[0].foto, foto);
});

test("410 do flow é repassado sem detalhes internos", async () => {
  const f = flowFalso(410, { error: { message: "segredo interno" } });
  const r = await chamar(req("/api/ler", { token: TOKEN }), f);
  assert.equal(r.status, 410);
  assert.deepEqual(await r.json(), { erro: "expirado" });
});

test("status inesperado do flow vira 500", async () => {
  const r = await chamar(req("/api/ler", { token: TOKEN }), flowFalso(502, {}));
  assert.equal(r.status, 500);
});

test("token inválido: 400 sem chamar o flow", async () => {
  const f = flowFalso(200, {});
  const r = await chamar(req("/api/ler", { token: "curto" }), f);
  assert.equal(r.status, 400);
  assert.equal(f.chamadas.length, 0);
});

test("corpo acima de 4 MB: 413 sem chamar o flow", async () => {
  const f = flowFalso(200, {});
  const grande = JSON.stringify({ token: TOKEN, passageiroId: PID, fotoBase64: "A".repeat(LIMITE_CORPO) });
  const r = await chamar(req("/api/salvar", grande), f);
  assert.equal(r.status, 413);
  assert.equal(f.chamadas.length, 0);
});

test("salvar: envia só campos preenchidos e exige ao menos um", async () => {
  const f = flowFalso(200, { ok: true });
  const r = await chamar(req("/api/salvar", { token: TOKEN, passageiroId: PID, email: "a@b.co", telefone: "" }), f);
  assert.equal(r.status, 200);
  assert.deepEqual(f.chamadas[0].corpo, { op: "salvar", hash: await sha256Hex(TOKEN), passageiroId: PID, email: "a@b.co" });
  const vazio = await chamar(req("/api/salvar", { token: TOKEN, passageiroId: PID }), f);
  assert.equal(vazio.status, 400);
  const emailRuim = await chamar(req("/api/salvar", { token: TOKEN, passageiroId: PID, email: "x" }), f);
  assert.equal(emailRuim.status, 400);
  assert.equal(f.chamadas.length, 1);
});

test("origem diferente e GET são recusados", async () => {
  const f = flowFalso(200, {});
  assert.equal((await chamar(req("/api/ler", { token: TOKEN }, { Origin: "https://evil.example" }), f)).status, 403);
  const get = new Request(ORIGEM + "/api/ler");
  assert.equal((await chamar(get, f)).status, 405);
  assert.equal(f.chamadas.length, 0);
});

test("rate limit: binding negando devolve 429; sem binding não bloqueia", async () => {
  const f = flowFalso(200, { passageiros: [] });
  const negado = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await chamar(req("/api/ler", { token: TOKEN }), f, negado)).status, 429);
  assert.equal((await chamar(req("/api/ler", { token: TOKEN }), f)).status, 200);
});

test("mock em localhost sem FLOW_URL; fora do localhost é 500", async () => {
  const local = new Request("http://localhost:52418/api/ler", { method: "POST", body: JSON.stringify({ token: TOKEN }) });
  const r = await tratarApi(local, {}, new URL(local.url));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).passageiros.length, 3);
  assert.equal((await chamar(req("/api/ler", { token: TOKEN }), undefined, {})).status, 500);
});

test("worker: GET / devolve a página com cabeçalhos de segurança", async () => {
  const r = await worker.fetch(new Request(ORIGEM + "/"), {});
  assert.equal(r.status, 200);
  assert.match(await r.text(), /\/app\.js/);
  assert.match(r.headers.get("Content-Security-Policy"), /img-src 'self' data: blob:/);
  assert.equal(r.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
});

test("ler: só campos esperados; telefone/e-mail sem máscara são descartados", async () => {
  const f = flowFalso(200, { dataServico: "2026-10-27T11:30:00Z", passageiros: [
    { id: PID, primeiroNome: "Ana", temFoto: false, extra: "x", temTelefone: true, telefoneMascarado: "+5511987654321", temEmail: true, emailMascarado: "an•••@empresa.com.br" },
  ] });
  const p = (await (await chamar(req("/api/ler", { token: TOKEN }), f)).json()).passageiros[0];
  assert.equal(p.extra, undefined);
  assert.equal(p.telefoneMascarado, "");
  assert.equal(p.temTelefone, true);
  assert.equal(p.emailMascarado, "an•••@empresa.com.br");
});

test("mock: 3 perfis (completo, só foto, nada) e e-mail 'erro…' simula falha", async () => {
  const local = (c, corpo) => new Request("http://localhost:52418/api/" + c, { method: "POST", body: JSON.stringify({ token: TOKEN, ...corpo }) });
  const ps = (await (await tratarApi(local("ler"), {}, new URL(local("ler").url))).json()).passageiros;
  assert.deepEqual(ps.map((p) => [p.temFoto, p.temTelefone, p.temEmail]), [[true, true, true], [true, false, false], [false, false, false]]);
  const r = local("salvar", { passageiroId: PID, email: "erro@teste.com" });
  assert.equal((await tratarApi(r, {}, new URL(r.url))).status, 500);
});

test("máscaras: telefone só DDD + 4 últimos; e-mail 2 letras + domínio", () => {
  assert.equal(telefoneOculto("+5511987654321"), "(11) •••••-4321");
  assert.equal(telefoneOculto("(21) 3456-7890"), "(21) •••••-7890");
  assert.equal(telefoneOculto("+15551234567"), "+••• 4567");
  assert.equal(telefoneOculto("123"), "••••");
  assert.equal(telefoneOculto(""), "");
  assert.equal(emailOculto("ana.souza@empresa.com.br"), "an•••@empresa.com.br");
  assert.equal(emailOculto("a@b.co"), "a•••@b.co");
  assert.equal(emailOculto(""), "");
  for (const v of [telefoneOculto("+5511987654321"), emailOculto("ana.souza@empresa.com.br")]) assert.doesNotMatch(v, /9876|souza/);
});
