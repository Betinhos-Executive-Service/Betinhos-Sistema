import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.mjs";
import { classificarAvaliacao, regraReserva, reenviarPendentes, validarAvaliacao } from "../src/avaliacao.mjs";

const FIM = "2099-01-01T00:00:00Z";
// KV em memória com TTL, metadata e list por prefixo (como o Workers KV)
function kv(inicial = {}) {
  const m = new Map(Object.entries(inicial).map(([k, v]) => [k, { value: v, metadata: null }]));
  const puts = [];
  return {
    m, puts,
    get: async (k) => m.get(k)?.value ?? null,
    getWithMetadata: async (k) => ({ value: m.get(k)?.value ?? null, metadata: m.get(k)?.metadata ?? null }),
    put: async (k, v, o = {}) => { puts.push({ k, v, o }); m.set(k, { value: v, metadata: o.metadata ?? null }); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "", limit = 1000, cursor } = {}) => {
      const todas = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const ini = cursor ? Number(cursor) : 0;
      const keys = todas.slice(ini, ini + limit).map((name) => ({ name, metadata: m.get(name).metadata }));
      const fim = ini + limit >= todas.length;
      return { keys, list_complete: fim, ...(fim ? {} : { cursor: String(ini + limit) }) };
    },
  };
}
const concluidoDv = (extra = {}) => JSON.stringify({ modo: "completo", titulo: "OS-1", etapas: [], concluidoPor: "dataverse", expiraEm: FIM, ...extra });
const ctx = () => { const p = []; return { p, waitUntil: (x) => p.push(x), fim: () => Promise.all(p) }; };
let seq = 0;
const novoId = () => (++seq).toString(36).padStart(12, "Z");
const post = (id, corpo, env, c = ctx()) => worker.fetch(new Request(`https://w/r/${id}/avaliacao`, { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), headers: { "content-type": "application/json" } }), env, c);

// fetch falso: Anthropic e Flow; registra as chamadas
function fetchFalso({ ia, flow = () => new Response("", { status: 202 }) } = {}) {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes("anthropic")) return ia ? ia(init) : new Response("{}", { status: 500 });
    return flow(init);
  };
  return { f, chamadas };
}
const respostaIa = (input, usage = { input_tokens: 300, output_tokens: 40 }) => () => new Response(JSON.stringify({ stop_reason: "tool_use", usage, content: [{ type: "tool_use", name: "avaliacao", input }] }));
async function comFetch(f, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = f;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test("validarAvaliacao aceita nota inteira 1–5 e comentário até 1000", () => {
  assert.deepEqual(validarAvaliacao({ nota: 5 }).dados, { nota: 5, comentario: null });
  assert.deepEqual(validarAvaliacao({ nota: 1, comentario: "  ok  " }).dados, { nota: 1, comentario: "ok" });
  assert.equal(validarAvaliacao({ nota: 3, comentario: "   " }).dados.comentario, null);
  assert.ok(validarAvaliacao({ nota: 4, comentario: "a".repeat(1000) }).dados);
  for (const b of [null, {}, { nota: 0 }, { nota: 6 }, { nota: 2.5 }, { nota: "5" }, { nota: 3, comentario: "a".repeat(1001) }, { nota: 3, comentario: 7 }]) assert.ok(validarAvaliacao(b).erro, JSON.stringify(b));
});

test("regra de reserva: ≥4 elogio, ≤2 reclamação, 3 sugestão", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(regraReserva), ["reclamacao", "reclamacao", "sugestao", "elogio", "elogio"]);
});

test("POST em link inexistente → 404", async () => {
  const r = await post(novoId(), { nota: 5 }, { TRACK_KV: kv() });
  assert.equal(r.status, 404);
});

test("POST com serviço ainda em andamento → 409", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: JSON.stringify({ modo: "completo", etapas: [{ tipo: "saida", lat: 1, lon: 1 }, { tipo: "destino", lat: 2, lon: 2 }], expiraEm: FIM }) }) };
  const r = await post(id, { nota: 5 }, env);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).jaAvaliado, undefined);
  assert.equal(env.TRACK_KV.m.has(`avaliacao:${id}`), false);
});

test("serviço concluído pelo GPS (etapas visitadas ou estado.concluidoEm) aceita avaliação", async () => {
  const a = novoId(), b = novoId();
  const env = { TRACK_KV: kv({
    [`track:${a}`]: JSON.stringify({ modo: "completo", etapas: [{ tipo: "saida", lat: 1, lon: 1, chegouEm: "x", saiuEm: "y" }, { tipo: "destino", lat: 2, lon: 2, chegouEm: "z" }], expiraEm: FIM }),
    [`track:${b}`]: JSON.stringify({ placa: "A", estado: { concluidoEm: "2026-10-23T12:00:00Z" }, expiraEm: FIM }),
  }) };
  assert.equal((await post(a, { nota: 5 }, env)).status, 200);
  assert.equal((await post(b, { nota: 4 }, env)).status, 200);
});

test("chave concluido:<id> do Dataverse também libera a avaliação", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: JSON.stringify({ modo: "completo", etapas: [{ tipo: "saida" }, { tipo: "destino" }], expiraEm: FIM }), [`concluido:${id}`]: "2026-10-23T12:00:00Z" }) };
  assert.equal((await post(id, { nota: 5 }, env)).status, 200);
});

test("nota inválida, comentário longo ou JSON quebrado → 400", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: concluidoDv() }) };
  assert.equal((await post(id, { nota: 7 }, env)).status, 400);
  assert.equal((await post(id, { nota: 4, comentario: "x".repeat(1001) }, env)).status, 400);
  assert.equal((await post(id, "{", env)).status, 400);
  assert.equal(env.TRACK_KV.m.has(`avaliacao:${id}`), false);
});

test("sem comentário: grava sem chamar a IA, classificação sem_comentario, TTL de 30 dias, responde 200", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: concluidoDv() }), ANTHROPIC_API_KEY_ACOMPANHAMENTO: "k" };
  const { f, chamadas } = fetchFalso();
  const c = ctx();
  const r = await comFetch(f, () => post(id, { nota: 5 }, env, c));
  await c.fim();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(chamadas.filter((x) => x.url.includes("anthropic")).length, 0);
  const put = env.TRACK_KV.puts.find((p) => p.k === `avaliacao:${id}`);
  assert.equal(put.o.expirationTtl, 30 * 86400);
  const reg = JSON.parse(env.TRACK_KV.m.get(`avaliacao:${id}`).value);
  assert.equal(reg.nota, 5);
  assert.equal(reg.comentario, null);
  assert.equal(reg.classificacao, "sem_comentario");
  assert.ok(reg.avaliadoEm);
});

test("só a primeira avaliação vale: a segunda → 409 { jaAvaliado: true } e não sobrescreve", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: concluidoDv() }) };
  assert.equal((await post(id, { nota: 5 }, env)).status, 200);
  const r = await post(id, { nota: 1, comentario: "mudei de ideia" }, env);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { jaAvaliado: true });
  assert.equal(JSON.parse(env.TRACK_KV.m.get(`avaliacao:${id}`).value).nota, 5);
});

test("limite: no máximo 5 POSTs por link por hora → o 6º recebe 429", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: concluidoDv() }) };
  for (let i = 0; i < 5; i++) assert.equal((await post(id, { nota: 9 }, env)).status, 400);
  const r = await post(id, { nota: 5 }, env);
  assert.equal(r.status, 429);
  assert.equal(env.TRACK_KV.m.has(`avaliacao:${id}`), false);
  const contador = env.TRACK_KV.puts.filter((p) => p.k === `limite-avaliacao:${id}`).at(-1);
  assert.ok(contador.o.expirationTtl <= 3600 && contador.o.expirationTtl >= 60);
});

test("com comentário: a IA classifica considerando a nota e o uso de tokens é registrado", async () => {
  const { f, chamadas } = fetchFalso({ ia: respostaIa({ classificacao: "sugestao", resumo: "Sugere água no carro" }) });
  const r = await classificarAvaliacao({ nota: 5, comentario: "Ótimo, poderia ter água" }, { chave: "k", fetch: f });
  assert.equal(r.classificacao, "sugestao");
  assert.equal(r.resumo, "Sugere água no carro");
  assert.equal(r.ia.ok, true);
  assert.equal(r.ia.input_tokens, 300);
  assert.equal(r.ia.output_tokens, 40);
  const corpo = chamadas[0].body;
  assert.equal(corpo.model, "claude-haiku-5-5");
  assert.deepEqual(corpo.output_config, { effort: "low" });
  assert.equal(corpo.tool_choice.name, "avaliacao");
  assert.ok(corpo.messages[0].content.includes("Nota: 5"));
  assert.ok(corpo.messages[0].content.includes("poderia ter água"));
});

test("IA falha (HTTP 500, resposta inválida, sem chave ou timeout) → regra de reserva pela nota", async () => {
  const f500 = fetchFalso().f;
  assert.equal((await classificarAvaliacao({ nota: 2, comentario: "atrasou" }, { chave: "k", fetch: f500 })).classificacao, "reclamacao");
  const invalida = fetchFalso({ ia: respostaIa({ classificacao: "neutro", resumo: "x" }) }).f;
  const r = await classificarAvaliacao({ nota: 4, comentario: "bom" }, { chave: "k", fetch: invalida });
  assert.equal(r.classificacao, "elogio");
  assert.equal(r.ia.ok, false);
  assert.equal(r.ia.motivo, "json_invalido");
  assert.equal((await classificarAvaliacao({ nota: 3, comentario: "ok" }, {})).ia.motivo, "sem_chave");
  const lento = async (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("abort"))));
  const t = await classificarAvaliacao({ nota: 3, comentario: "ok" }, { chave: "k", fetch: lento, timeoutMs: 20 });
  assert.equal(t.classificacao, "sugestao");
  assert.equal(t.ia.motivo, "timeout");
});

test("POST com comentário grava a classificação da IA e envia ao Flow (envio.ok)", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: concluidoDv() }), ANTHROPIC_API_KEY_ACOMPANHAMENTO: "k", AVALIACAO_FLOW_URL: "https://flow.example/segredo?sig=abc" };
  const { f, chamadas } = fetchFalso({ ia: respostaIa({ classificacao: "reclamacao", resumo: "Atraso na chegada" }) });
  const c = ctx();
  const logs = [];
  const log = console.log, warn = console.warn, err = console.error;
  console.log = console.warn = console.error = (...a) => logs.push(a.join(" "));
  try {
    const r = await comFetch(f, async () => { const r = await post(id, { nota: 2, comentario: "O motorista atrasou" }, env, c); await c.fim(); return r; });
    assert.equal(r.status, 200);
  } finally { console.log = log; console.warn = warn; console.error = err; }
  const enviado = chamadas.find((x) => x.url.startsWith("https://flow.example"));
  assert.deepEqual(Object.keys(enviado.body).sort(), ["avaliadoEm", "classificacao", "comentario", "linkId", "nota", "titulo"]);
  assert.equal(enviado.body.linkId, id);
  assert.equal(enviado.body.titulo, "OS-1");
  assert.equal(enviado.body.classificacao, "reclamacao");
  const reg = JSON.parse(env.TRACK_KV.m.get(`avaliacao:${id}`).value);
  assert.equal(reg.resumo, "Atraso na chegada");
  assert.equal(reg.ia.ok, true);
  assert.equal(reg.envio.ok, true);
  assert.equal(reg.envio.tentativas, 1);
  assert.ok(reg.envio.enviadoEm);
  assert.equal(env.TRACK_KV.m.get(`avaliacao:${id}`).metadata.pendente, false);
  assert.ok(logs.some((l) => l.includes("ia_avaliacao")), "registra uso da IA");
  assert.ok(!logs.some((l) => l.includes("flow.example") || l.includes("sig=abc")), "nunca loga a URL do flow");
});

test("Flow falha: cliente recebe 200, avaliação fica pendente e o cron reenvia", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: concluidoDv() }), AVALIACAO_FLOW_URL: "https://flow.example/x" };
  let falhar = true;
  const { f, chamadas } = fetchFalso({ flow: () => new Response("", { status: falhar ? 500 : 202 }) });
  const c = ctx();
  const r = await comFetch(f, async () => { const r = await post(id, { nota: 5 }, env, c); await c.fim(); return r; });
  assert.equal(r.status, 200);
  let reg = JSON.parse(env.TRACK_KV.m.get(`avaliacao:${id}`).value);
  assert.deepEqual([reg.envio.ok, reg.envio.tentativas, reg.envio.ultimoErro], [false, 1, "http_500"]);
  assert.equal(env.TRACK_KV.m.get(`avaliacao:${id}`).metadata.pendente, true);
  falhar = false;
  const res = await reenviarPendentes(env, { fetch: f });
  assert.equal(res.enviadas, 1);
  reg = JSON.parse(env.TRACK_KV.m.get(`avaliacao:${id}`).value);
  assert.deepEqual([reg.envio.ok, reg.envio.tentativas, reg.envio.ultimoErro], [true, 2, null]);
  assert.equal(env.TRACK_KV.m.get(`avaliacao:${id}`).metadata.pendente, false);
  assert.equal(chamadas.filter((x) => x.url.startsWith("https://flow")).length, 2);
  // TTL preservado a partir de avaliadoEm (não renova os 30 dias)
  const ultimo = env.TRACK_KV.puts.filter((p) => p.k === `avaliacao:${id}`).at(-1);
  assert.ok(ultimo.o.expirationTtl <= 30 * 86400 && ultimo.o.expirationTtl > 30 * 86400 - 120);
});

test("cron: no máximo 20 por execução, desiste após 5 tentativas e ignora as já enviadas", async () => {
  const kvm = kv();
  const reg = (tentativas, ok = false) => JSON.stringify({ nota: 5, comentario: null, classificacao: "sem_comentario", avaliadoEm: new Date().toISOString(), titulo: "T", envio: { ok, tentativas, ultimoErro: ok ? null : "http_500", enviadoEm: null } });
  for (let i = 0; i < 25; i++) await kvm.put(`avaliacao:p${String(i).padStart(10, "0")}`, reg(1), { metadata: { pendente: true } });
  await kvm.put("avaliacao:ok0000000000", reg(1, true), { metadata: { pendente: false } });
  await kvm.put("avaliacao:q4tentativas", reg(4), { metadata: { pendente: true } });
  const env = { TRACK_KV: kvm, AVALIACAO_FLOW_URL: "https://flow.example/x" };
  const { f, chamadas } = fetchFalso({ flow: () => new Response("", { status: 500 }) });
  const r = await reenviarPendentes(env, { fetch: f });
  assert.equal(r.tentadas, 20);
  assert.equal(chamadas.length, 20);
  // as primeiras esgotam as 5 tentativas e saem da fila; a de 4 tentativas, quando tentada, chega a 5 e sai também
  for (let i = 0; i < 5; i++) await reenviarPendentes(env, { fetch: f });
  assert.equal(JSON.parse(kvm.m.get("avaliacao:p0000000000").value).envio.tentativas, 5);
  const q = kvm.m.get("avaliacao:q4tentativas");
  assert.equal(JSON.parse(q.value).envio.tentativas, 5);
  assert.equal(q.metadata.pendente, false);
});

test("sem o secret AVALIACAO_FLOW_URL: grava pendente sem gastar tentativa e o cron não faz nada", async () => {
  const id = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: concluidoDv() }) };
  const { f, chamadas } = fetchFalso();
  const c = ctx();
  const r = await comFetch(f, async () => { const r = await post(id, { nota: 4 }, env, c); await c.fim(); return r; });
  assert.equal(r.status, 200);
  const reg = JSON.parse(env.TRACK_KV.m.get(`avaliacao:${id}`).value);
  assert.deepEqual([reg.envio.ok, reg.envio.tentativas, reg.envio.ultimoErro], [false, 0, "sem_url"]);
  assert.equal(env.TRACK_KV.m.get(`avaliacao:${id}`).metadata.pendente, true);
  assert.deepEqual(await reenviarPendentes(env, { fetch: f }), { tentadas: 0, enviadas: 0 });
  assert.equal(chamadas.length, 0);
});

test("scheduled do Worker chama o reenvio", async () => {
  const env = { TRACK_KV: kv() };
  const c = ctx();
  await worker.scheduled({ cron: "*/15 * * * *" }, env, c);
  await c.fim();
  assert.equal(c.p.length, 1);
});

test("/dados informa avaliado true|false sem o conteúdo da avaliação", async () => {
  const id = novoId(), outro = novoId();
  const env = { TRACK_KV: kv({ [`track:${id}`]: concluidoDv(), [`track:${outro}`]: concluidoDv() }) };
  assert.equal((await post(id, { nota: 5, comentario: "Motorista gentil e pontual" }, env)).status, 200);
  const txt = await (await worker.fetch(new Request(`https://w/r/${id}/dados`), env)).text();
  const j = JSON.parse(txt);
  assert.equal(j.avaliado, true);
  assert.ok(!txt.includes("gentil"));
  assert.equal((await (await worker.fetch(new Request(`https://w/r/${outro}/dados`), env)).json()).avaliado, false);
});
