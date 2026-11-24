import assert from "node:assert/strict";
import test from "node:test";
import { normalizarEnderecos } from "../src/normalizar.mjs";

const resposta = (input) => ({ ok: true, json: async () => ({ content: [{ type: "tool_use", name: "enderecos", input }] }) });

test("devolve as etapas limpas do Haiku", async () => {
  let corpo;
  const fetch = async (_url, init) => { corpo = JSON.parse(init.body); return resposta({ etapas: [
    { tipo: "saida", local: "Aeroporto Internacional de Guarulhos", logradouro: null, cidade: "Guarulhos", uf: "SP", rotulo: "Aeroporto de Guarulhos – Terminal 3" },
    { tipo: "destino", local: null, logradouro: "Rua Haddock Lobo, 1000", cidade: "São Paulo", uf: "SP", rotulo: "Rua Haddock Lobo, 1000" }], confianca: "alta" }); };
  const r = await normalizarEnderecos({ saida: "Aerop. GRU AA 963", destino: "R. Haddock Lobo 1000 - SP" }, { chave: "k", fetch });
  assert.equal(corpo.model, "claude-haiku-5-5");
  assert.equal(corpo.tool_choice.name, "enderecos");
  assert.equal(r.etapas.length, 2);
  assert.equal(r.confianca, "alta");
  assert.equal(r.fonte, "haiku");
  assert.equal(r.etapas[0].consulta, "Aeroporto Internacional de Guarulhos, Guarulhos, SP", "com local: local, cidade, uf");
  assert.equal(r.etapas[1].consulta, "Rua Haddock Lobo, 1000, São Paulo, SP", "sem local: logradouro, cidade, uf");
  assert.match(corpo.system[0].text, /bairro/);
});

test("sem chave, erro HTTP, JSON fora do formato ou timeout → sem etapas", async () => {
  assert.equal((await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "", fetch: async () => { throw new Error("não chama"); } }))?.etapas, undefined);
  assert.equal((await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch: async () => ({ ok: false, status: 529 }) }))?.etapas, undefined);
  assert.equal((await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch: async () => resposta({ etapas: [{ tipo: "outro" }] }) }))?.etapas, undefined);
  const lento = (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("abort"))));
  assert.equal((await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch: lento, timeoutMs: 20 }))?.etapas, undefined);
});

test("exige uma saída e um destino, na ordem", async () => {
  const fetch = async () => resposta({ etapas: [{ tipo: "destino", local: "a", logradouro: null, cidade: null, uf: null, rotulo: "a" }], confianca: "alta" });
  assert.equal((await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch }))?.etapas, undefined);
});

test("rejeita etapas demais, textos longos e elementos null", async () => {
  const ok = [{ tipo: "saida", local: "a", logradouro: null, cidade: null, uf: null, rotulo: "a" }, { tipo: "destino", local: null, logradouro: "Rua b, 1", cidade: null, uf: null, rotulo: "b" }];
  const tenta = (etapas) => normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch: async () => resposta({ etapas, confianca: "alta" }) });
  assert.ok(await tenta(ok));
  const par = { tipo: "parada", local: "p", logradouro: null, cidade: null, uf: null, rotulo: "p" };
  assert.equal((await tenta([ok[0], ...Array(9).fill(par), ok[1]]))?.etapas, undefined);
  assert.equal((await tenta([{ ...ok[0], local: "a".repeat(201) }, ok[1]]))?.etapas, undefined);
  assert.equal((await tenta([ok[0], { ...ok[1], rotulo: "r".repeat(201) }]))?.etapas, undefined);
  assert.equal((await tenta([ok[0], null, ok[1]]))?.etapas, undefined);
  assert.equal((await tenta([{ ...ok[0], local: null }, ok[1]]))?.etapas, undefined, "sem local nem logradouro");
});

const okInput = { etapas: [{ tipo: "saida", local: "a", logradouro: null, cidade: null, uf: null, rotulo: "a" }, { tipo: "destino", local: null, logradouro: "Rua b, 1", cidade: null, uf: null, rotulo: "b" }], confianca: "alta" };
const comUso = (usage) => ({ ok: true, json: async () => ({ stop_reason: "tool_use", usage, content: [{ type: "tool_use", name: "enderecos", input: okInput }] }) });
const T = { saida: "Rua Secreta 99", destino: "y" };

test("registro de uso vem do usage, sem texto de endereço no log", async () => {
  const logs = [];
  const orig = console.log; console.log = (m) => logs.push(m);
  try {
    const r = await normalizarEnderecos(T, { chave: "k", fetch: async () => comUso({ input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }) });
    assert.equal(r.ia.ok, true);
    assert.equal(r.ia.tentativas, 1);
    assert.equal(r.ia.input_tokens, 900);
    assert.equal(r.ia.output_tokens, 120);
    assert.equal(typeof r.ia.ms, "number");
  } finally { console.log = orig; }
  const linha = logs.find((l) => String(l).includes("ia_normalizar"));
  assert.ok(linha);
  assert.doesNotMatch(linha, /Secreta/);
});

test("motivos: sem_chave, http_<status>, json_invalido, recusa", async () => {
  assert.equal((await normalizarEnderecos(T, { chave: "" })).ia.motivo, "sem_chave");
  assert.equal((await normalizarEnderecos(T, { chave: "k", fetch: async () => ({ ok: false, status: 401 }) })).ia.motivo, "http_401");
  assert.equal((await normalizarEnderecos(T, { chave: "k", fetch: async () => resposta({ etapas: [] }) })).ia.motivo, "json_invalido");
  const recusa = async () => ({ ok: true, json: async () => ({ stop_reason: "refusal", content: [] }) });
  const r = await normalizarEnderecos(T, { chave: "k", fetch: recusa });
  assert.equal(r.ia.motivo, "recusa");
  assert.equal(r.etapas, undefined);
});

test("nova tentativa só em timeout/429/5xx, no máximo 1, somando o usage", async () => {
  for (const [status, esperado] of [[529, 2], [500, 2], [429, 2], [400, 1], [401, 1]]) {
    let n = 0;
    await normalizarEnderecos(T, { chave: "k", fetch: async () => { n++; return { ok: false, status }; } });
    assert.equal(n, esperado, `status ${status}`);
  }
  let n = 0;
  const r = await normalizarEnderecos(T, { chave: "k", fetch: async () => (++n === 1 ? { ok: false, status: 529 } : comUso({ input_tokens: 10, output_tokens: 5 })) });
  assert.equal(r.ia.ok, true);
  assert.equal(r.ia.tentativas, 2);
  let m = 0;
  const lento = (_u, init) => { m++; return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("abort")))); };
  const t = await normalizarEnderecos(T, { chave: "k", fetch: lento, timeoutMs: 10 });
  assert.equal(m, 2);
  assert.equal(t.ia.motivo, "timeout");
  let j = 0;
  await normalizarEnderecos(T, { chave: "k", fetch: async () => { j++; return resposta({ etapas: [] }); } });
  assert.equal(j, 1, "json_invalido não repete");
});

test("não repete se a nova tentativa passaria do prazo", async () => {
  let n = 0, relogio = 1000;
  await normalizarEnderecos(T, { chave: "k", timeoutMs: 12000, prazo: 1000 + 11000, agora: () => relogio, fetch: async () => { n++; relogio += 500; return { ok: false, status: 503 }; } });
  assert.equal(n, 1);
});

test("system fixo, com cache, exemplos e effort low; contexto vai na mensagem", async () => {
  const corpos = [];
  const fetch = async (_u, init) => { corpos.push(JSON.parse(init.body)); return comUso({}); };
  await normalizarEnderecos({ saida: "a", destino: "b" }, { chave: "k", fetch, contexto: { titulo: "Embarque OS-1234", horarioAgendado: "2026-10-23T10:00:00.000Z", tipoServico: "Transfer" } });
  await normalizarEnderecos({ saida: "c", destino: "d" }, { chave: "k", fetch });
  assert.deepEqual(corpos[0].system, corpos[1].system);
  assert.equal(corpos[0].system.length, 1);
  assert.deepEqual(corpos[0].system[0].cache_control, { type: "ephemeral" });
  const sys = corpos[0].system[0].text;
  for (const ex of ["Aerop. GRU T3 - LATAM 3456", "Congonhas", "Viracopos", "Santos Dumont", "Galeão", "Kenvue JK", "apto 172", "Ritz Leblon", "Golden Tulip", "Rodoviária", "Shopping"]) assert.ok(sys.includes(ex), ex);
  assert.doesNotMatch(sys, /OS-1234/);
  assert.deepEqual(corpos[0].output_config, { effort: "low" });
  assert.deepEqual(corpos[0].tool_choice, { type: "tool", name: "enderecos" });
  const msg = corpos[0].messages[0].content;
  assert.match(msg, /Embarque OS-1234/);
  assert.match(msg, /2026-10-23T10:00/);
  assert.match(msg, /Transfer/);
  assert.match(msg, /Vale do Paraíba/);
  assert.doesNotMatch(corpos[1].messages[0].content, /Tipo de serviço/);
});

test("reanálise: mesmo system, effort high, falhas na mensagem e uma tentativa só", async () => {
  const corpos = [];
  const fetch = async (_u, init) => { corpos.push(JSON.parse(init.body)); return corpos.length === 1 ? comUso({}) : { ok: false, status: 529 }; };
  await normalizarEnderecos(T, { chave: "k", fetch });
  const r = await normalizarEnderecos(T, { chave: "k", fetch, effort: "high", maxTentativas: 1, falhas: [{ tipo: "destino", rotulo: "Empresa Y", consulta: "Empresa Y, São Paulo, SP" }] });
  assert.equal(corpos.length, 2);
  assert.deepEqual(corpos[0].system, corpos[1].system);
  assert.deepEqual(corpos[1].output_config, { effort: "high" });
  assert.match(corpos[1].messages[0].content, /Empresa Y, São Paulo, SP/);
  assert.match(corpos[1].messages[0].content, /alternativ/);
  assert.equal(r.ia.tentativas, 1);
});
