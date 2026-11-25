import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.mjs";
import { limparFoto, limparLer, payloadSalvar, ROTA_PASSAGEIROS, rotaPassageiros } from "../src/passageiros.mjs";

const ID = "aB3dE5gH7jK9";
const HASH = "ab".repeat(32);
const URL_FLOW = "https://flow.exemplo.invalid/executar";
const G1 = "00000000-0000-0000-0000-000000000001", G2 = "00000000-0000-0000-0000-000000000002", G3 = "00000000-0000-0000-0000-000000000003";
const JPEG_B64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

const kv = (inicial = {}) => {
  const m = new Map(Object.entries(inicial).map(([k, v]) => [k, { v, o: {} }]));
  return {
    m,
    get: async (k) => m.get(k)?.v ?? null,
    getWithMetadata: async (k) => ({ value: m.get(k)?.v ?? null, metadata: m.get(k)?.o?.metadata ?? null }),
    put: async (k, v, o) => { m.set(k, { v, o }); },
    delete: async (k) => { m.delete(k); },
  };
};
const link = (extra = {}) => JSON.stringify({ placa: "ABC1D23", expiraEm: new Date(Date.now() + 6 * 3600e3).toISOString(), cadastroHash: HASH, cadastroAmbiente: "dev", ...extra });
const mkEnv = (extra = {}, kvInicial = {}) => ({ TRACK_KV: kv({ [`track:${ID}`]: link(), ...kvInicial }), CADASTRO_FLOW_URL_DEV: URL_FLOW, ...extra });

// Flow falso: registra as chamadas e responde por `op`.
const flow = (respostas) => {
  const chamadas = [];
  const f = async (url, init) => {
    const corpo = JSON.parse(init.body);
    chamadas.push({ url, corpo });
    const r = typeof respostas === "function" ? await respostas(corpo) : respostas[corpo.op];
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200 });
  };
  f.chamadas = chamadas;
  return f;
};
const LER = { corpo: { dataServico: "2026-12-01T10:00:00Z", passageiros: [
  { id: G2.toUpperCase(), primeiroNome: "Carlos", ordem: 2, temFoto: false, foto: "AAAA", temTelefone: true, telefoneMascarado: "(11) •••••-4321", temEmail: true, emailMascarado: "ca•••@x.com", sobrenome: "Silva" },
  { id: G1, primeiroNome: "Mariana", ordem: 1, temFoto: true, temTelefone: true, telefoneMascarado: "11999994321", temEmail: false, emailMascarado: "ma•••@x.com" },
  { id: G3, primeiroNome: "Ana", temFoto: false },
  { id: "nao-e-guid", primeiroNome: "Fora" },
] } };

const m = (id, rest = "") => `/r/${id}/passageiros${rest}`.match(ROTA_PASSAGEIROS);
const get = (env, rest, f, ctx) => rotaPassageiros(new Request(`https://w${m(ID, rest)[0]}`), env, new URL(`https://w/r/${ID}/passageiros${rest}`), m(ID, rest), ctx, f);
const post = (env, guid, corpo, f, { origin = "https://w", headers = {}, ctx } = {}) => {
  const rest = `/${guid}`;
  return rotaPassageiros(new Request(`https://w/r/${ID}/passageiros${rest}`, { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), ...headers }, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }),
    env, new URL(`https://w/r/${ID}/passageiros${rest}`), m(ID, rest), ctx, f);
};

test("limparLer: só os campos da spec, ordem da escala com desempate por nome, máscara obrigatória, sem foto inline", () => {
  const { passageiros } = limparLer(LER.corpo);
  assert.deepEqual(passageiros.map((p) => p.primeiroNome), ["Mariana", "Carlos", "Ana"]); // 1, 2, sem ordem
  assert.deepEqual(Object.keys(passageiros[0]).sort(), ["emailMascarado", "id", "primeiroNome", "temEmail", "temFoto", "temTelefone", "telefoneMascarado"].sort());
  assert.equal(passageiros[0].telefoneMascarado, "", "telefone sem • não passa");
  assert.equal(passageiros[1].id, G2, "id em minúsculas");
  assert.equal(passageiros[1].telefoneMascarado, "(11) •••••-4321");
  const empate = limparLer({ passageiros: [{ id: G1, primeiroNome: "Zé", ordem: 1 }, { id: G2, primeiroNome: "Ana", ordem: 1 }] }).passageiros;
  assert.deepEqual(empate.map((p) => p.primeiroNome), ["Ana", "Zé"]);
  assert.equal(limparLer({}), null);
});

test("limparFoto e payloadSalvar seguem as regras do cadastro-passageiro", () => {
  assert.deepEqual(limparFoto({ foto: { mimeType: "image/png", base64: "QUJD" } }), { tipo: "image/png", base64: "QUJD" });
  assert.equal(limparFoto({ foto: { mimeType: "text/html", base64: "QUJD" } }).tipo, "image/jpeg");
  assert.equal(limparFoto({ foto: { base64: "<script>" } }), null);
  assert.equal(limparFoto({ foto: null }), null);
  assert.deepEqual(payloadSalvar({ telefone: "+5511999994321", email: " a@b.co " }, G1.toUpperCase()), { passageiroId: G1, telefone: "+5511999994321", email: "a@b.co" });
  assert.equal(payloadSalvar({}, G1), null, "nenhum campo");
  assert.equal(payloadSalvar({ telefone: "123" }, G1), null);
  assert.equal(payloadSalvar({ email: "sem-arroba" }, G1), null);
  assert.equal(payloadSalvar({ fotoBase64: "<x>" }, G1), null);
  assert.equal(payloadSalvar({ telefone: "11999994321" }, "xx"), null);
  const grande = "A".repeat(300001);
  assert.equal(payloadSalvar({ fotoBase64: "QUJD", miniaturaBase64: grande }, G1).miniaturaBase64, undefined, "miniatura grande é descartada");
  assert.equal(payloadSalvar({ fotoBase64: "QUJD", miniaturaBase64: "QUJE" }, G1).miniaturaBase64, "QUJE");
});

test("GET lista: chama o flow com {hash, op:ler}, limpa, devolve aberto e grava pax:<id> com o TTL do link", async () => {
  const env = mkEnv();
  const f = flow({ ler: LER });
  const r = await get(env, "", f);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.aberto, true);
  assert.equal(j.motivo, null);
  assert.deepEqual(j.passageiros.map((p) => p.primeiroNome), ["Mariana", "Carlos", "Ana"]);
  assert.deepEqual(f.chamadas, [{ url: URL_FLOW, corpo: { hash: HASH, op: "ler" } }]);
  const gravado = env.TRACK_KV.m.get(`pax:${ID}`);
  assert.deepEqual(JSON.parse(gravado.v).passageiros, j.passageiros);
  assert.ok(gravado.o.expirationTtl > 5 * 3600 && gravado.o.expirationTtl <= 6 * 3600);
  assert.doesNotMatch(JSON.stringify(j), /AAAA|Silva|ordem/);
});

test("GET lista: cache KV responde sem esperar o flow, só regrava quando muda e o link concluído vira motivo concluido", async () => {
  const env = mkEnv();
  const f1 = flow({ ler: LER });
  await get(env, "", f1);
  let puts = 0;
  const put = env.TRACK_KV.put;
  env.TRACK_KV.put = async (...a) => { puts++; return put(...a); };
  // Nova abertura: o isolate acabou de atualizar, então nem chama o flow e nada é regravado.
  const f2 = flow({ ler: LER });
  assert.equal((await get(env, "", f2)).status, 200);
  assert.equal(f2.chamadas.length, 0);
  assert.equal(puts, 0);
  // Concluído (chave do Dataverse): lista continua aparecendo, aberto false.
  env.TRACK_KV.m.set(`concluido:${ID}`, { v: "2026-11-23T10:00:00Z" });
  const j = await (await get(env, "", f2)).json();
  assert.equal(j.aberto, false);
  assert.equal(j.motivo, "concluido");
  assert.equal(j.passageiros.length, 3);
});

test("GET lista: 404 sem cadastroHash, sem URL do ambiente, ambiente inválido e link inexistente; 405 para outros métodos", async () => {
  const f = flow({ ler: LER });
  const semHash = mkEnv({}, { [`track:${ID}`]: link({ cadastroHash: undefined }) });
  const semUrl = mkEnv({ CADASTRO_FLOW_URL_DEV: undefined });
  const prod = mkEnv({}, { [`track:${ID}`]: link({ cadastroAmbiente: "prod" }) }); // só há URL do dev
  const invalido = mkEnv({}, { [`track:${ID}`]: link({ cadastroAmbiente: "x" }) });
  const inexistente = mkEnv({}, { [`track:${ID}`]: null });
  inexistente.TRACK_KV.m.delete(`track:${ID}`);
  for (const env of [semHash, semUrl, prod, invalido, inexistente]) assert.equal((await get(env, "", f)).status, 404);
  assert.equal(f.chamadas.length, 0);
  const r = await rotaPassageiros(new Request("https://w/x", { method: "DELETE" }), mkEnv(), new URL("https://w/x"), m(ID), null, f);
  assert.equal(r.status, 405);
});

test("GET lista: o ambiente do link escolhe a URL do flow", async () => {
  const env = mkEnv({ CADASTRO_FLOW_URL_PROD: "https://flow-prod.exemplo.invalid/x" }, { [`track:${ID}`]: link({ cadastroAmbiente: "prod" }) });
  const f = flow({ ler: LER });
  await get(env, "", f);
  assert.equal(f.chamadas[0].url, "https://flow-prod.exemplo.invalid/x");
});

test("GET lista: flow 410 devolve a lista (do cache) com motivo expirado; 404 e flow fora viram 404 e 502", async () => {
  const env = mkEnv();
  await get(env, "", flow({ ler: LER }));
  // Lista guardada como encerrada (flow respondeu 410 antes): segue só leitura, sem consultar o flow.
  const doc = { ...JSON.parse(env.TRACK_KV.m.get(`pax:${ID}`).v), fechado: "expirado" };
  const f410 = flow({});
  const depois = await (await get(mkEnv({}, { [`pax:${ID}`]: JSON.stringify(doc) }), "", f410)).json();
  assert.equal(depois.aberto, false);
  assert.equal(depois.motivo, "expirado");
  assert.equal(depois.passageiros.length, 3);
  assert.equal(f410.chamadas.length, 0);
  // Sem cache: 410 → lista vazia encerrada; 404 → 404; 429 → 429; 500/rede → 502.
  const vazio = await (await get(mkEnv(), "", flow({ ler: { status: 410 } }))).json();
  assert.deepEqual([vazio.aberto, vazio.motivo, vazio.passageiros], [false, "expirado", []]);
  assert.equal((await get(mkEnv(), "", flow({ ler: { status: 404 } }))).status, 404);
  assert.equal((await get(mkEnv(), "", flow({ ler: { status: 429 } }))).status, 429);
  assert.equal((await get(mkEnv(), "", flow({ ler: { status: 500 } }))).status, 502);
  assert.equal((await get(mkEnv(), "", flow({ ler: { status: 418 } }))).status, 502);
  assert.equal((await get(mkEnv(), "", flow({ ler: new Error("rede") }))).status, 502);
  assert.equal((await get(mkEnv(), "", flow({ ler: { corpo: { semLista: true } } }))).status, 502);
});

test("rotas novas via worker: herdam X-Robots-Tag e nunca expõem hash nem URL do flow", async () => {
  const env = mkEnv();
  const original = globalThis.fetch;
  globalThis.fetch = flow({ ler: LER });
  try {
    const r = await worker.fetch(new Request(`https://w/r/${ID}/passageiros`), env, { waitUntil() {} });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("X-Robots-Tag"), "noindex");
    assert.doesNotMatch(await r.text(), new RegExp(`${HASH}|flow\\.exemplo|sig=`));
    const sem = await worker.fetch(new Request(`https://w/r/${ID}/passageiros`), mkEnv({ CADASTRO_FLOW_URL_DEV: undefined }));
    assert.equal(sem.status, 404);
    assert.equal(sem.headers.get("X-Robots-Tag"), "noindex");
    assert.equal((await worker.fetch(new Request(`https://w/r/${ID}/passageiros`, { method: "PUT" }), env)).status, 405);
  } finally { globalThis.fetch = original; }
});

// ---- POST ----

test("POST: Origin diferente ou ausente → 403 sem tocar no flow", async () => {
  const f = flow({ salvar: { corpo: { ok: true } } });
  assert.equal((await post(mkEnv(), G1, { telefone: "11999994321" }, f, { origin: "https://outro" })).status, 403);
  assert.equal((await post(mkEnv(), G1, { telefone: "11999994321" }, f, { origin: null })).status, 403);
  assert.equal(f.chamadas.length, 0);
});

test("POST: corpo acima de 4 MB → 413 (declarado ou real); inválido → 400; sem cadastro → 404", async () => {
  const f = flow({ salvar: { corpo: { ok: true } } });
  assert.equal((await post(mkEnv(), G1, "x", f, { headers: { "Content-Length": String(5 * 1024 * 1024) } })).status, 413);
  assert.equal((await post(mkEnv(), G1, "x".repeat(4 * 1024 * 1024 + 1), f)).status, 413);
  for (const ruim of ["não é json", {}, { telefone: "1" }, { email: "x" }, { fotoBase64: "<x>" }, [1]]) assert.equal((await post(mkEnv(), G1, ruim, f)).status, 400, JSON.stringify(ruim));
  assert.equal((await post(mkEnv(), "guid-curto", { telefone: "11999994321" }, f).catch(() => ({ status: 404 }))).status, 404);
  assert.equal((await post(mkEnv({ CADASTRO_FLOW_URL_DEV: undefined }), G1, { telefone: "11999994321" }, f)).status, 404);
  assert.equal(f.chamadas.length, 0);
});

test("POST: 409 quando o serviço está concluído (flag, chave concluido:<id> ou GPS), antes do flow", async () => {
  const f = flow({ salvar: { corpo: { ok: true } } });
  const corpo = { telefone: "11999994321" };
  assert.equal((await post(mkEnv({}, { [`track:${ID}`]: link({ concluidoPor: "dataverse" }) }), G1, corpo, f)).status, 409);
  assert.equal((await post(mkEnv({}, { [`concluido:${ID}`]: "2026-11-23T10:00:00Z" }), G1, corpo, f)).status, 409);
  assert.equal((await post(mkEnv({}, { [`track:${ID}`]: link({ estado: { concluidoEm: "x" } }) }), G1, corpo, f)).status, 409);
  assert.equal(f.chamadas.length, 0);
});

test("POST: rate limit por IP + link; sem binding não bloqueia", async () => {
  const chaves = [];
  const env = mkEnv({ RATE_LIMITER: { limit: async ({ key }) => { chaves.push(key); return { success: false }; } } });
  const f = flow({ salvar: { corpo: { ok: true } }, ler: LER });
  assert.equal((await post(env, G1, { telefone: "11999994321" }, f, { headers: { "CF-Connecting-IP": "203.0.113.9" } })).status, 429);
  assert.deepEqual(chaves, [`203.0.113.9:${ID}`]);
  assert.equal(f.chamadas.length, 0);
  const livre = mkEnv();
  assert.equal((await post(livre, G1, { telefone: "11999994321" }, f)).status, 200);
  const quebrado = mkEnv({ RATE_LIMITER: { limit: async () => { throw new Error("x"); } } });
  assert.equal((await post(quebrado, G1, { telefone: "11999994321" }, f)).status, 200);
});

test("POST sucesso: repassa só campos válidos ao flow, devolve o passageiro mascarado da lista nova e atualiza pax:<id>", async () => {
  const env = mkEnv();
  const f = flow({ salvar: { corpo: { ok: true } }, ler: LER });
  const r = await post(env, G1.toUpperCase(), { telefone: "+5511999994321", email: "m@x.com", intruso: "x" }, f);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.passageiro.id, G1);
  assert.equal(j.passageiro.primeiroNome, "Mariana");
  assert.deepEqual(f.chamadas[0], { url: URL_FLOW, corpo: { hash: HASH, op: "salvar", passageiroId: G1, telefone: "+5511999994321", email: "m@x.com" } });
  assert.equal(f.chamadas[1].corpo.op, "ler");
  assert.ok(env.TRACK_KV.m.has(`pax:${ID}`));
});

test("POST sucesso com a releitura falhando: apaga pax:<id> e devolve só o que foi enviado, mascarado localmente", async () => {
  const env = mkEnv({}, { [`pax:${ID}`]: JSON.stringify({ passageiros: [] }) });
  const f = flow((c) => (c.op === "salvar" ? { corpo: { ok: true } } : { status: 500 }));
  const j = await (await post(env, G1, { telefone: "+5511999994321", email: "mariana@x.com" }, f)).json();
  assert.deepEqual(j.passageiro, { id: G1, temTelefone: true, telefoneMascarado: "(11) •••••-4321", temEmail: true, emailMascarado: "ma•••@x.com" });
  assert.equal(env.TRACK_KV.m.has(`pax:${ID}`), false);
});

test("POST: repassa 400/404/410/429/500 do flow; flow fora ou status estranho → 502", async () => {
  const corpo = { telefone: "11999994321" };
  for (const status of [400, 404, 410, 429, 500]) assert.equal((await post(mkEnv(), G1, corpo, flow({ salvar: { status } }))).status, status, String(status));
  assert.equal((await post(mkEnv(), G1, corpo, flow({ salvar: new Error("rede") }))).status, 502);
  assert.equal((await post(mkEnv(), G1, corpo, flow({ salvar: { status: 503 } }))).status, 502);
});

test("logs: nada de telefone, e-mail, base64, hash nem URL do flow", async () => {
  const linhas = [];
  const { log, warn, error } = console;
  console.log = console.warn = console.error = (...a) => linhas.push(a.join(" "));
  try {
    await post(mkEnv(), G1, { telefone: "11999994321", email: "segredo@x.com", fotoBase64: "QUJD" }, flow({ salvar: { status: 500 } }));
    await post(mkEnv(), G1, { telefone: "11999994321" }, flow({ salvar: new Error(`falha em ${URL_FLOW}?sig=abc`) }));
  } finally { Object.assign(console, { log, warn, error }); }
  assert.ok(linhas.length >= 2);
  assert.doesNotMatch(linhas.join("\n"), /11999994321|segredo@|QUJD|flow\.exemplo|sig=|ab{1}ab{1}ab/);
  assert.doesNotMatch(linhas.join("\n"), new RegExp(HASH));
});

// ---- foto ----

test("GET foto: flow op foto, JPEG com cabeçalhos seguros, cache KV paxfoto:<id>:<guid>; 404 sem foto", async () => {
  const env = mkEnv();
  const f = flow({ foto: { corpo: { ok: true, foto: { mimeType: "image/jpeg", base64: JPEG_B64 } } } });
  const r = await get(env, `/${G1}/foto`, f);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "image/jpeg");
  assert.equal(r.headers.get("Cache-Control"), "private, max-age=300");
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(r.headers.get("Content-Security-Policy"), "default-src 'none'");
  assert.equal(Buffer.from(await r.arrayBuffer()).toString("base64"), JPEG_B64);
  assert.deepEqual(f.chamadas[0].corpo, { hash: HASH, op: "foto", passageiroId: G1 });
  assert.ok(env.TRACK_KV.m.has(`paxfoto:${ID}:${G1}`));
  // Segunda leitura vem do cache.
  const f2 = flow({});
  assert.equal((await get(env, `/${G1}/foto`, f2)).status, 200);
  assert.equal(f2.chamadas.length, 0);
  // Sem foto, não-imagem, fora do escopo ou sem cadastro: 404.
  assert.equal((await get(mkEnv(), `/${G2}/foto`, flow({ foto: { corpo: { ok: true, foto: null } } }))).status, 404);
  assert.equal((await get(mkEnv(), `/${G2}/foto`, flow({ foto: { corpo: { foto: { base64: "<html>" } } } }))).status, 404);
  assert.equal((await get(mkEnv(), `/${G2}/foto`, flow({ foto: { status: 404 } }))).status, 404);
  assert.equal((await get(mkEnv(), `/${G2}/foto`, flow({ foto: { status: 500 } }))).status, 502);
  assert.equal((await get(mkEnv({ CADASTRO_FLOW_URL_DEV: undefined }), `/${G2}/foto`, flow({}))).status, 404);
});

test("POST com foto grava a miniatura nova em paxfoto (miniatura, senão a foto) sem passar pelo flow", async () => {
  const env = mkEnv();
  const f = flow({ salvar: { corpo: { ok: true } }, ler: LER });
  await post(env, G1, { fotoBase64: JPEG_B64, miniaturaBase64: "QUJD" }, f);
  const k = env.TRACK_KV.m.get(`paxfoto:${ID}:${G1}`);
  assert.equal(Buffer.from(k.v).toString("utf8"), "ABC");
  assert.equal(k.o.metadata.tipo, "image/jpeg");
  assert.deepEqual(f.chamadas[0].corpo.miniaturaBase64, "QUJD");
  await post(env, G2, { fotoBase64: "QUJE" }, f);
  assert.equal(Buffer.from(env.TRACK_KV.m.get(`paxfoto:${ID}:${G2}`).v).toString("utf8"), "ABD");
  const lida = await get(env, `/${G1}/foto`, flow({}));
  assert.equal(await lida.text(), "ABC");
});

test("limparLer: passageiro repetido na reserva aparece uma vez, com a menor ordem", () => {
  const { passageiros } = limparLer({ passageiros: [{ id: G1, primeiroNome: "Zé", ordem: 3 }, { id: G2, primeiroNome: "Ana", ordem: 2 }, { id: G1, primeiroNome: "Zé", ordem: 1 }] });
  assert.deepEqual(passageiros.map((p) => p.id), [G1, G2]);
});

test("limparLer: e-mail mascarado sem @ (só •••) vale como e-mail ausente", () => {
  const { passageiros } = limparLer({ passageiros: [
    { id: G1, primeiroNome: "Ana", temEmail: true, emailMascarado: "•••" },
    { id: G2, primeiroNome: "Bia", temEmail: true, emailMascarado: "b•••@x.com", temTelefone: true, telefoneMascarado: "(11) •••••-4321" },
  ] });
  assert.deepEqual([passageiros[0].temEmail, passageiros[0].emailMascarado], [false, ""]);
  assert.deepEqual([passageiros[1].temEmail, passageiros[1].emailMascarado, passageiros[1].telefoneMascarado], [true, "b•••@x.com", "(11) •••••-4321"]);
});
