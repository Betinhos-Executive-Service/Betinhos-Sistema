import assert from "node:assert/strict";
import test from "node:test";
import { Viagem, mesclarComKv } from "../src/viagem.mjs";
import { ASSETS } from "./modelo-portal.mjs";
import worker from "../src/worker.mjs";

export function ctxFalso() {
  const m = new Map(), cont = { put: 0, setAlarm: 0 };
  let alarme = null;
  return {
    m, cont, sockets: [],
    get alarme() { return alarme; },
    storage: {
      get: async (k) => structuredClone(m.get(k)),
      put: async (k, v) => { cont.put++; m.set(k, structuredClone(v)); },
      delete: async (k) => m.delete(k),
      deleteAll: async () => { m.clear(); alarme = null; },
      getAlarm: async () => alarme,
      setAlarm: async (t) => { cont.setAlarm++; alarme = t; },
      deleteAlarm: async () => { alarme = null; },
    },
    getWebSockets(tag) { return this.sockets.filter((s) => !tag || s.tags.includes(tag)); },
    acceptWebSocket(ws, tags = []) { ws.tags = tags; this.sockets.push(ws); },
    getTags(ws) { return ws.tags ?? []; },
  };
}

export function kvFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial)), puts = [];
  return { m, puts, get: async (k) => m.get(k) ?? null, put: async (k, v) => { puts.push(k); m.set(k, v); }, delete: async (k) => m.delete(k) };
}

// Infleet falsa: `pos` muda entre leituras; roteador fora (rota null), sem histórico.
export function infleetFalsa() {
  const f = { pos: null, chamadas: 0 };
  f.fetch = async (_url, init) => {
    const q = JSON.parse(init?.body ?? "{}").query ?? "";
    if (q.includes("getVehicle")) { f.chamadas++; return Response.json({ data: { getVehicle: { plate: "ABC1D23", hasSignal: true, driver: null, location: f.pos } } }); }
    if (q.includes("listVehiclePositions")) return Response.json({ data: { listVehiclePositions: [] } });
    return new Response("{}", { status: 500 });
  };
  return f;
}

export const ID = "aB3dE5gH7jK9";
export const linkCompleto = (extra = {}) => ({
  modo: "completo", vehicleId: "v1", titulo: "Embarque A → B", expiraEm: "2099-01-01T00:00:00Z",
  etapas: [{ tipo: "saida", rotulo: "Saída", rotuloLimpo: true, lat: -23.2, lon: -45.9, area: null }, { tipo: "destino", rotulo: "Destino", rotuloLimpo: true, lat: -23.6, lon: -46.7, area: null }],
  ...extra,
});
const posEm = (lat, lon, fixTime = new Date().toISOString()) => ({ latitude: lat, longitude: lon, speed: 30, fixTime, address: null });

async function comFetch(f, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = f.fetch;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

const novo = (kv, ctx = ctxFalso()) => ({ ctx, v: new Viagem(ctx, { TRACK_KV: kv, INFLEET_TOKEN: "x" }) });
const pedirDados = (v, link) => v.fetch(new Request(`https://viagem/dados?id=${ID}`, { method: "POST", body: JSON.stringify(link) }));

test("duas leituras em menos de 10 s consultam a Infleet uma vez", async () => {
  const f = infleetFalsa(); f.pos = posEm(-23.4, -46.2);
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v } = novo(kv);
  await comFetch(f, async () => {
    const [a, b] = await Promise.all([pedirDados(v, link), pedirDados(v, link)]);
    assert.equal(a.status, 200);
    assert.equal((await b.json()).fase, "a_caminho");
    await pedirDados(v, link);
  });
  assert.equal(f.chamadas, 1);
});

test("mesma posição: o estado para de ser gravado; posição nova grava o DO mas não o KV", async () => {
  const f = infleetFalsa(); f.pos = posEm(-23.4, -46.2, "2026-11-13T12:00:00Z");
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v, ctx } = novo(kv);
  await comFetch(f, async () => {
    for (let i = 0; i < 2; i++) { v.leitura = null; await pedirDados(v, link); }
    const puts = ctx.cont.put;
    v.leitura = null; await pedirDados(v, link);
    assert.equal(ctx.cont.put, puts, "leitura igual não grava");
    f.pos = posEm(-23.41, -46.21, "2026-11-13T12:00:30Z");
    v.leitura = null; await pedirDados(v, link);
    assert.ok(ctx.cont.put > puts, "posição nova grava o estado do DO");
    assert.equal(ctx.m.get("s").t.ultimaPos.fixTime, "2026-11-13T12:00:30Z");
  });
  assert.equal(kv.puts.length, 0, "ultimaPos não vai ao KV");
});

test("chegada na saída espelha os marcos no KV, uma vez", async () => {
  const f = infleetFalsa(); f.pos = posEm(-23.4, -46.2, "2026-11-13T12:00:00Z");
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v } = novo(kv);
  await comFetch(f, async () => {
    await pedirDados(v, link);
    for (const [i, fix] of ["12:01:00", "12:02:00", "12:05:00"].entries()) { f.pos = posEm(-23.2, -45.9, `2026-11-13T${fix}Z`); v.leitura = null; await pedirDados(v, link); if (i === 0) assert.ok(kv.puts.length >= 1); }
    const gravado = JSON.parse(kv.m.get(`track:${ID}`));
    assert.ok(gravado.etapas[0].chegouEm || gravado.etapas[0].dentroDesde, "marco da saída no KV");
    const n = kv.puts.length;
    v.leitura = null; await pedirDados(v, link);
    assert.equal(kv.puts.length, n, "sem mudança de marco, sem escrita no KV");
  });
});

test("sem WebSocket e sem inscrição: /dados não marca alarm e o alarm não se reagenda", async () => {
  const f = infleetFalsa(); f.pos = posEm(-23.2001, -45.9001);
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v, ctx } = novo(kv);
  await comFetch(f, async () => { await pedirDados(v, link); v.leitura = null; await v.alarm(); });
  assert.equal(ctx.alarme, null);
  assert.equal(ctx.cont.setAlarm, 0);
});

test("concluído marca limpeza em 24 h e o alarm seguinte apaga tudo", async () => {
  const link = linkCompleto({ concluidoPor: "dataverse" }), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v, ctx } = novo(kv);
  const r = await pedirDados(v, link); // sem fetch falso: a Infleet não pode ser consultada
  assert.equal((await r.json()).fase, "concluido");
  assert.ok(Math.abs(ctx.alarme - (Date.now() + 24 * 3600000)) < 5000);
  v.s.limparEm = Date.now() - 1;
  await v.alarm();
  assert.equal(ctx.m.size, 0);
});

test("/recarregar com concluidoPor: próxima leitura é concluída sem Infleet", async () => {
  const f = infleetFalsa(); f.pos = posEm(-23.4, -46.2);
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v } = novo(kv);
  await comFetch(f, () => pedirDados(v, link));
  const r = await v.fetch(new Request(`https://viagem/recarregar?id=${ID}`, { method: "POST", body: JSON.stringify({ ...link, concluidoPor: "dataverse" }) }));
  assert.equal(r.status, 204);
  assert.equal((await (await pedirDados(v, link)).json()).fase, "concluido");
  assert.equal(f.chamadas, 1);
});

test("/encerrar apaga o estado e avisa os sockets", async () => {
  const link = linkCompleto({ concluidoPor: "dataverse" }), kv = kvFalso();
  const { v, ctx } = novo(kv);
  await pedirDados(v, link);
  const enviados = [];
  ctx.sockets.push({ tags: [], send: (m) => enviados.push(JSON.parse(m)), close: () => {} });
  assert.equal((await v.fetch(new Request(`https://viagem/encerrar?id=${ID}`, { method: "POST" }))).status, 204);
  assert.deepEqual(enviados, [{ tipo: "fim" }]);
  assert.equal(ctx.m.get("s").encerrado, true);
  assert.equal((await pedirDados(v, link)).status, 404);
});

test("recarga periódica: progresso do DO sobre o KV", () => {
  const kv = { titulo: "Novo", etapas: [{ tipo: "saida" }, { tipo: "destino" }], estado: { a: 1 } };
  const t = { titulo: "Velho", ultimaPos: { lat: 1 }, etapas: [{ tipo: "saida", chegouEm: "2026-11-13T12:00:00Z" }, { tipo: "destino" }], estado: { b: 2 } };
  const r = mesclarComKv(kv, t);
  assert.equal(r.titulo, "Novo");
  assert.deepEqual(r.ultimaPos, { lat: 1 });
  assert.equal(r.etapas[0].chegouEm, "2026-11-13T12:00:00Z");
  assert.deepEqual(r.estado, { a: 1, b: 2 });
});

test("Worker: Viagem com erro → /dados responde pelo caminho sem DO, com o mesmo JSON", async () => {
  const id = "f".repeat(64), link = linkCompleto({ concluidoPor: "dataverse" });
  const kv = kvFalso({ [`track:${id}`]: JSON.stringify(link) });
  const quebrado = { idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error("limite estourado"); } }) };
  const semDo = await (await worker.fetch(new Request(`https://w/r/${id}/dados`), { TRACK_KV: kv })).json();
  const comErro = await (await worker.fetch(new Request(`https://w/r/${id}/dados`), { TRACK_KV: kv, VIAGEM: quebrado })).json();
  delete semDo.servidorEm; delete comErro.servidorEm;
  assert.deepEqual(comErro, semDo);
});

test("Worker: /dados passa pelo Viagem quando há binding", async () => {
  const id = "aB3dE5gH7jK8", link = linkCompleto({ concluidoPor: "dataverse" });
  const kv = kvFalso({ [`track:${id}`]: JSON.stringify(link) });
  const ctx = ctxFalso(), viagem = new Viagem(ctx, { TRACK_KV: kv });
  const chamadas = [];
  const VIAGEM = { idFromName: (n) => n, get: () => ({ fetch: (u, init) => { chamadas.push(u); return viagem.fetch(new Request(u, init)); } }) };
  const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { TRACK_KV: kv, VIAGEM });
  assert.equal((await r.json()).fase, "concluido");
  assert.equal(chamadas.length, 1);
  assert.equal(ctx.m.get("s").id, id);
});

test("API: concluir manda o link relido ao Viagem; revogar encerra; sem binding, nada", async () => {
  const id = "c".repeat(64), chamadas = [], pendentes = [];
  const kv = kvFalso({ [`track:${id}`]: JSON.stringify(linkCompleto()) });
  kv.getWithMetadata = async () => ({ value: null, metadata: null });
  const VIAGEM = { idFromName: (n) => n, get: (n) => ({ fetch: async (u, init) => { chamadas.push({ n, u, corpo: init?.body ?? null }); return new Response(null, { status: 204 }); } }) };
  const ctx = { waitUntil: (p) => pendentes.push(p) };
  const env = { TRACK_KV: kv, LINK_API_SECRET: "s", VIAGEM };
  const auth = { Authorization: "Bearer s" };
  assert.equal((await worker.fetch(new Request(`https://w/api/links/${id}/concluir`, { method: "POST", headers: auth }), env, ctx)).status, 200);
  await Promise.all(pendentes);
  assert.equal(chamadas[0].u, `https://viagem/recarregar?id=${id}`);
  assert.equal(JSON.parse(chamadas[0].corpo).concluidoPor, "dataverse");
  assert.equal((await worker.fetch(new Request(`https://w/api/links/${id}`, { method: "DELETE", headers: auth }), env, ctx)).status, 200);
  await Promise.all(pendentes);
  assert.equal(chamadas[1].u, `https://viagem/encerrar?id=${id}`);
  assert.equal((await worker.fetch(new Request(`https://w/api/links/${id}`, { method: "DELETE", headers: { Authorization: "Bearer x" } }), env, ctx)).status, 401);
  await worker.fetch(new Request(`https://w/api/links/${id}/concluir`, { method: "POST", headers: auth }), { ...env, VIAGEM: undefined }, ctx);
  await Promise.all(pendentes);
  assert.equal(chamadas.length, 2, "401 e sem binding não avisam");
});

const socketFalso = () => { const s = { tags: [], enviados: [], fechado: null }; s.send = (m) => s.enviados.push(JSON.parse(m)); s.close = (c) => { s.fechado = c; }; return s; };

test("WebSocket: leitura fresca vai no aceite; sem ela, o alarm é antecipado e transmite (diagnóstico só com debug)", async () => {
  const f = infleetFalsa(); f.pos = posEm(-23.4, -46.2);
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v, ctx } = novo(kv);
  await comFetch(f, async () => {
    await pedirDados(v, link);
    const a = socketFalso();
    await v.aceitarConexao(a, false);
    assert.equal(a.enviados.length, 1);
    assert.equal(a.enviados[0].tipo, "dados");
    assert.equal(a.enviados[0].fase, "a_caminho");
    assert.equal("diagnostico" in a.enviados[0], false);

    v.leitura = null; ctx.cont.setAlarm = 0;
    const b = socketFalso();
    await v.aceitarConexao(b, true);
    assert.deepEqual(b.tags, ["debug"]);
    assert.equal(b.enviados.length, 0);
    assert.equal(ctx.cont.setAlarm, 1);
    assert.ok(ctx.alarme <= Date.now());

    await v.alarm();
    assert.equal(a.enviados.length, 2);
    assert.equal(b.enviados.length, 1);
    assert.equal("diagnostico" in a.enviados[1], false);
    assert.ok("diagnostico" in b.enviados[0]);
    assert.ok(ctx.alarme > Date.now(), "com socket aberto o alarm segue marcado");
  });
});

test("WebSocket: Infleet fora sem leitura em memória (DO acordou da hibernação) avisa a página", async () => {
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v, ctx } = novo(kv);
  await v.iniciar(ID, JSON.stringify(link));
  const a = socketFalso();
  ctx.sockets.push(a);
  v.ler = async () => { throw new Error("Infleet HTTP 503"); };
  await v.alarm();
  assert.deepEqual(a.enviados, [{ tipo: "fonte_fora" }]);
  assert.ok(ctx.alarme > Date.now(), "segue tentando no ritmo de quem está olhando");
});

test("WebSocket: link expirado no DO vazio → 404; webSocketClose fecha o par", async () => {
  const { v } = novo(kvFalso());
  const r = await v.fetch(new Request(`https://viagem/ao-vivo?id=${ID}&debug=`, { headers: { Upgrade: "websocket" } }));
  assert.equal(r.status, 404);
  const s = socketFalso();
  v.webSocketClose(s, 1006, "");
  assert.equal(s.fechado, 1000);
});

test("Worker: /ao-vivo sem Upgrade → 426; sem binding ou sem link → 404 sem acordar o Viagem; com link repassa", async () => {
  const id = "aB3dE5gH7jK8", kv = kvFalso({ [`track:${id}`]: JSON.stringify(linkCompleto()) });
  const up = { headers: { Upgrade: "websocket" } }, chamadas = [];
  const VIAGEM = { idFromName: (n) => n, get: () => ({ fetch: async (req) => { chamadas.push({ url: req.url, up: req.headers.get("Upgrade") }); return new Response(null, { status: 204 }); } }) };
  assert.equal((await worker.fetch(new Request(`https://w/r/${id}/ao-vivo`), { TRACK_KV: kv, VIAGEM })).status, 426);
  assert.equal((await worker.fetch(new Request(`https://w/r/${id}/ao-vivo`, up), { TRACK_KV: kv })).status, 404);
  assert.equal((await worker.fetch(new Request(`https://w/r/${"Z".repeat(12)}/ao-vivo`, up), { TRACK_KV: kv, VIAGEM })).status, 404);
  assert.equal((await worker.fetch(new Request(`https://w/r/${id}/ao-vivo?debug=1`, up), { TRACK_KV: kv, VIAGEM })).status, 204);
  assert.deepEqual(chamadas, [{ url: `https://viagem/ao-vivo?id=${id}&debug=1`, up: "websocket" }], "id sem link não chega ao Viagem");
});

test("alarm sem ninguém olhando lê em modo economia; com socket aberto, leitura normal", async () => {
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v, ctx } = novo(kv);
  await v.iniciar(ID, JSON.stringify(link));
  const modos = [];
  v.ler = async ({ economia }) => { modos.push(economia); return null; };
  await v.alarm();
  ctx.sockets.push(socketFalso());
  await v.alarm();
  assert.deepEqual(modos, [true, false]);
});

// ---- Avisos ----
async function envVapid() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const { toBase64Url } = await import("../src/webpush.mjs");
  return {
    VAPID_PUBLIC_KEY: toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))),
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk", par.privateKey)), VAPID_SUBJECT: "mailto:teste@example.com",
  };
}
async function inscricaoReal(n) {
  const { toBase64Url } = await import("../src/webpush.mjs");
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))), auth: toBase64Url(new Uint8Array(16).fill(n)), idioma: "pt" };
}
// Serviço de push falso: status por endpoint; conta os envios.
function pushFalso(status = {}) {
  const f = { envios: [] };
  f.fetch = async (url) => { f.envios.push(url); return new Response(null, { status: status[url] ?? 201 }); };
  return f;
}
const pedirAviso = (v, metodo, corpo) => v.fetch(new Request(`https://viagem/avisos?id=${ID}`, { method: metodo, body: JSON.stringify(corpo) }));

async function viagemComAvisos(dadosIniciais) {
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const ctx = ctxFalso(), v = new Viagem(ctx, { TRACK_KV: kv, ...(await envVapid()) });
  let dados = dadosIniciais;
  v.ler = async () => dados;
  return { v, ctx, mudar: (d) => { dados = d; } };
}

test("avisos: inscrição marca o que já aconteceu; cada evento sai uma vez, só o mais adiantado", async () => {
  const { v, ctx, mudar } = await viagemComAvisos({ fase: "a_caminho", chegando: true });
  const a = await inscricaoReal(1);
  assert.equal((await pedirAviso(v, "POST", a)).status, 201);
  assert.deepEqual(ctx.m.get("s").enviados, { chegando_embarque: true }, "chegando já valia ao inscrever");
  assert.ok(ctx.alarme, "inscrição marca alarm");
  const push = pushFalso();
  await comFetch(push, async () => {
    await v.alarm();
    assert.equal(push.envios.length, 0);
    mudar({ fase: "em_viagem", chegando: true }); // chegou e saiu entre dois alarms
    await v.alarm();
    await v.alarm();
  });
  assert.equal(push.envios.length, 1, "um aviso, uma vez");
  assert.deepEqual(Object.keys(ctx.m.get("s").enviados).sort(), ["chegando_destino", "chegando_embarque", "chegou_embarque", "viagem_iniciada"]);
});

test("avisos: primeira leitura falha na inscrição → nada marcado, alarm em até 60 s e o chegando sai no alarm seguinte", async () => {
  // Horário daqui a 3 h: com leitura ok e carro longe, o alarm iria para 1 h antes; sem leitura, não pode esperar.
  const link = linkCompleto({ horarioAgendado: new Date(Date.now() + 3 * 3600000).toISOString() });
  const ctx = ctxFalso(), v = new Viagem(ctx, { TRACK_KV: kvFalso({ [`track:${ID}`]: JSON.stringify(link) }), ...(await envVapid()) });
  let dados = null;
  v.ler = async () => { if (!dados) throw new Error("Infleet fora"); return dados; };
  const antes = Date.now();
  assert.equal((await pedirAviso(v, "POST", await inscricaoReal(4))).status, 201);
  assert.deepEqual(ctx.m.get("s").enviados, {}, "nada marcado como enviado sem ter sido enviado");
  assert.ok(ctx.alarme && ctx.alarme <= antes + 60000 + 1000, "alarm em até 60 s, não 1 h antes do horário");
  const push = pushFalso();
  await comFetch(push, async () => {
    await v.alarm(); // ainda fora: tenta de novo em até 60 s
    assert.ok(ctx.alarme <= Date.now() + 60000 + 1000);
    dados = { fase: "a_caminho", chegando: true };
    await v.alarm();
  });
  assert.equal(push.envios.length, 1, "chegando enviado assim que a leitura voltou");
  assert.deepEqual(ctx.m.get("s").enviados, { chegando_embarque: true });
});

test("avisos: motorista definido ou trocado avisa uma vez; tirar não avisa; depois da saída, não avisa", async () => {
  const emDefinicao = { fase: "agendado", emDefinicao: true, motorista: { nome: null } };
  const com = (nome, fase = "agendado") => ({ fase, emDefinicao: false, motorista: { nome }, veiculo: { placa: "ABC1D23" } });
  const { v, ctx, mudar } = await viagemComAvisos(emDefinicao);
  await pedirAviso(v, "POST", await inscricaoReal(5));
  assert.equal(ctx.m.get("s").motorista, null, "base: em definição");
  const push = pushFalso();
  await comFetch(push, async () => {
    await v.alarm();
    mudar(com("Carlos Souza")); await v.alarm(); await v.alarm();
    mudar(com("Ana Lima")); await v.alarm();
    mudar(emDefinicao); await v.alarm();
    mudar(com("Ana Lima", "em_viagem")); await v.alarm();
    mudar(com("Bruno", "em_viagem")); await v.alarm();
  });
  // Carlos, Ana e o viagem_iniciada; a volta de Ana e a troca para Bruno já com a viagem andando ficam sem aviso.
  assert.equal(push.envios.length, 3);
  assert.equal(ctx.m.get("s").motorista, "Bruno");
});

test("avisos: inscrição com motorista já definido não avisa o mesmo motorista", async () => {
  const { v, ctx } = await viagemComAvisos({ fase: "agendado", motorista: { nome: "Carlos" } });
  await pedirAviso(v, "POST", await inscricaoReal(6));
  const push = pushFalso();
  await comFetch(push, () => v.alarm());
  assert.equal(push.envios.length, 0);
  assert.equal(ctx.m.get("s").motorista, "Carlos");
});

test("avisos: nome que some numa leitura (fora de em definição) e volta não avisa de novo", async () => {
  const { v, ctx, mudar } = await viagemComAvisos({ fase: "agendado", emDefinicao: false, motorista: { nome: "Carlos" } });
  await pedirAviso(v, "POST", await inscricaoReal(7));
  const push = pushFalso();
  await comFetch(push, async () => {
    mudar({ fase: "a_caminho", emDefinicao: false, motorista: { nome: null } }); await v.alarm();
    mudar({ fase: "a_caminho", emDefinicao: false, motorista: { nome: "Carlos" } }); await v.alarm();
  });
  assert.equal(push.envios.length, 0);
  assert.equal(ctx.m.get("s").motorista, "Carlos");
});

test("avisos: 410 remove a inscrição; 500 tenta no alarm seguinte, até 3 vezes", async () => {
  const { v, ctx, mudar } = await viagemComAvisos({ fase: "a_caminho", chegando: false });
  const [a, b] = [await inscricaoReal(1), await inscricaoReal(2)];
  await pedirAviso(v, "POST", a);
  await pedirAviso(v, "POST", b);
  const push = pushFalso({ [a.endpoint]: 410, [b.endpoint]: 500 });
  mudar({ fase: "no_local" });
  await comFetch(push, async () => { for (let i = 0; i < 4; i++) await v.alarm(); });
  const s = ctx.m.get("s");
  assert.deepEqual(s.inscricoes.map((i) => i.endpoint), [b.endpoint], "a 410 saiu");
  assert.equal(push.envios.filter((u) => u === b.endpoint).length, 3, "3 tentativas e desiste");
  assert.equal(s.enviados.chegou_embarque, true);
  assert.deepEqual(s.falhas, {});
});

test("avisos: DELETE tira a inscrição; corpo inválido → 400; sem VAPID nada é enviado", async () => {
  const { v, ctx } = await viagemComAvisos({ fase: "a_caminho" });
  const a = await inscricaoReal(3);
  await pedirAviso(v, "POST", a);
  assert.equal((await pedirAviso(v, "POST", { ...a, endpoint: "https://evil.example.com/x" })).status, 400);
  assert.equal((await v.fetch(new Request(`https://viagem/avisos?id=${ID}`, { method: "POST", body: "{" }))).status, 400);
  assert.equal((await pedirAviso(v, "DELETE", { endpoint: a.endpoint })).status, 204);
  assert.deepEqual(ctx.m.get("s").inscricoes, []);

  const semVapid = new Viagem(ctxFalso(), { TRACK_KV: kvFalso({ [`track:${ID}`]: JSON.stringify(linkCompleto()) }) });
  semVapid.ler = async () => ({ fase: "no_local" });
  await pedirAviso(semVapid, "POST", a);
  const push = pushFalso();
  await comFetch(push, () => semVapid.alarm());
  assert.equal(push.envios.length, 0);
});

test("Worker: /avisos 404 sem VAPID ou sem binding; 413 acima de 4 KB; repassa ao Viagem", async () => {
  const id = "aB3dE5gH7jK8", kv = kvFalso({ [`track:${id}`]: JSON.stringify(linkCompleto()) }), chamadas = [];
  const VIAGEM = { idFromName: (n) => n, get: () => ({ fetch: async (u, init) => { chamadas.push({ u, metodo: init.method }); return new Response(null, { status: 201 }); } }) };
  const vapid = await envVapid();
  const post = (corpo) => new Request(`https://w/r/${id}/avisos`, { method: "POST", body: corpo });
  assert.equal((await worker.fetch(post("{}"), { TRACK_KV: kv, VIAGEM })).status, 404);
  assert.equal((await worker.fetch(post("{}"), { TRACK_KV: kv, ...vapid })).status, 404);
  assert.equal((await worker.fetch(post("x".repeat(5000)), { TRACK_KV: kv, VIAGEM, ...vapid })).status, 413);
  assert.equal((await worker.fetch(post("{}"), { TRACK_KV: kv, VIAGEM, ...vapid })).status, 201);
  assert.equal((await worker.fetch(new Request(`https://w/r/${id}/avisos`, { method: "PUT", body: "{}" }), { TRACK_KV: kv, VIAGEM, ...vapid })).status, 405);
  assert.equal((await worker.fetch(new Request(`https://w/r/${"Z".repeat(12)}/avisos`, { method: "POST", body: "{}" }), { TRACK_KV: kv, VIAGEM, ...vapid })).status, 404);
  assert.deepEqual(chamadas, [{ u: `https://viagem/avisos?id=${id}`, metodo: "POST" }], "id sem link não chega ao Viagem");
});

test("Worker: a página só recebe a chave VAPID com os três segredos e o Viagem", async () => {
  const id = "aB3dE5gH7jK8", kv = kvFalso({ [`track:${id}`]: JSON.stringify(linkCompleto()) });
  const vapid = await envVapid(), VIAGEM = { idFromName: (n) => n, get: () => ({}) };
  const html = async (env) => (await worker.fetch(new Request(`https://w/r/${id}`), { TRACK_KV: kv, ASSETS, ...env })).text();
  assert.match(await html({ ...vapid, VIAGEM }), new RegExp(`"vapid":"${vapid.VAPID_PUBLIC_KEY}"`));
  assert.match(await html({ ...vapid }), /"vapid":null/);
  assert.match(await html({ ...vapid, VAPID_SUBJECT: undefined, VIAGEM }), /"vapid":null/);
});

test("Worker: manifest do link, prévia no HTML e X-Robots-Tag em toda resposta /r/", async () => {
  const id = "aB3dE5gH7jK8";
  const kv = kvFalso({ [`track:${id}`]: JSON.stringify({ ...linkCompleto(), horarioAgendado: "2026-11-13T15:30:00.000Z", modeloVeiculo: "Corolla", corVeiculo: "Prata" }) });
  const m = await worker.fetch(new Request(`https://w/r/${id}/manifest.webmanifest`), { TRACK_KV: kv });
  assert.equal(m.status, 200);
  assert.equal(m.headers.get("Content-Type"), "application/manifest+json");
  const man = await m.json();
  assert.equal(man.start_url, `/r/${id}`);
  assert.equal(man.scope, `/r/${id}`);
  assert.equal(man.display, "standalone");
  assert.equal(m.headers.get("X-Robots-Tag"), "noindex");
  assert.equal((await worker.fetch(new Request(`https://w/r/${id}/manifest.webmanifest`), { TRACK_KV: kvFalso({}) })).status, 404);
  const html = await (await worker.fetch(new Request(`https://w/r/${id}`), { TRACK_KV: kv, ASSETS })).text();
  assert.match(html, /og:description" content="Embarque às 12:30 · Corolla prata"/);
  assert.match(html, /og:image" content="https:\/\/w\/og-betinhos\.png"/);
  assert.match(html, new RegExp(`rel="manifest" href="/r/${id}/manifest\\.webmanifest"`));
  for (const caminho of [`/r/${id}/dados`, `/r/${"0".repeat(12)}/dados`, `/r/${id}/avisos`]) {
    const r = await worker.fetch(new Request(`https://w${caminho}`), { TRACK_KV: kv });
    assert.equal(r.headers.get("X-Robots-Tag"), "noindex", caminho);
  }
});

test("revogado durante a leitura: o marco não recria o link no KV e a resposta é 404", async () => {
  const f = infleetFalsa(); f.pos = posEm(-23.2, -45.9);
  const link = linkCompleto(), kv = kvFalso({ [`track:${ID}`]: JSON.stringify(link) });
  const { v } = novo(kv);
  let soltar, chegou;
  const travada = new Promise((r) => { soltar = r; }), pediu = new Promise((r) => { chegou = r; });
  const original = f.fetch;
  f.fetch = async (url, init) => { if ((init?.body ?? "").includes("getVehicle")) { chegou(); await travada; } return original(url, init); };
  await comFetch(f, async () => {
    const pendente = pedirDados(v, link);
    await pediu;
    kv.m.delete(`track:${ID}`);
    await v.fetch(new Request(`https://viagem/encerrar?id=${ID}`, { method: "POST" }));
    soltar();
    assert.equal((await pendente).status, 404);
  });
  assert.equal(kv.m.has(`track:${ID}`), false);
});

test("D1: antes de horário − 2 h o DO não consulta a Infleet nem publica posição (fase agendado)", async () => {
  const f = infleetFalsa();
  f.pos = posEm(-23.3, -46);
  const horario = new Date(Date.now() + 3 * 3600000).toISOString();
  const { v } = novo(kvFalso());
  const j = await comFetch(f, async () => (await pedirDados(v, linkCompleto({ horarioAgendado: horario }))).json());
  assert.equal(j.fase, "agendado");
  assert.equal(j.posicao, null);
  assert.equal(j.horarioAgendado, horario);
  assert.equal(f.chamadas, 0);
  // Dentro da janela de 2 h volta ao normal.
  const dentro = new Date(Date.now() + 90 * 60000).toISOString();
  const { v: v2 } = novo(kvFalso());
  const k = await comFetch(f, async () => (await pedirDados(v2, linkCompleto({ horarioAgendado: dentro }))).json());
  assert.equal(k.fase, "a_caminho");
  assert.equal(f.chamadas, 1);
});
