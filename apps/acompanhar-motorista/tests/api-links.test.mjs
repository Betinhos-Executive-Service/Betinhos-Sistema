import assert from "node:assert/strict";
import test from "node:test";
import { autorizado, candidatosEndereco, cidadeDoTexto, concluirLink, criarLink, geocodeTolerante, lugaresConhecidos, novoIdLink, rotaApiLinks, validarPedido } from "../src/api-links.mjs";

const req = (auth) => new Request("https://x/api/links", { method: "POST", headers: auth ? { Authorization: auth } : {} });

test("autoriza só o segredo exato", () => {
  assert.equal(autorizado(req("Bearer s3cr3t"), "s3cr3t"), true);
  assert.equal(autorizado(req("Bearer errado"), "s3cr3t"), false);
  assert.equal(autorizado(req(null), "s3cr3t"), false);
  assert.equal(autorizado(req("Bearer s3cr3t"), ""), false);
});

test("valida campos obrigatórios", () => {
  assert.equal(validarPedido({ embarque: "Av. Paulista", rastreio: true }).erro, "placa obrigatória para rastreio");
  assert.equal(validarPedido({ embarque: "Av. Paulista" }).dados.placa, null, "sem placa: motorista em definição ou sem carro");
  assert.equal(validarPedido({ placa: "ABC1D23" }).erro, "embarque obrigatório");
  assert.equal(validarPedido({ placa: "ABC1D23", embarque: "Av. Paulista", horarioAgendado: "ontem" }).erro, "horarioAgendado inválido");
  assert.equal(validarPedido({ placa: "ruh-7g45", embarque: "Av. Paulista", validadeHoras: 999 }).dados.validadeHoras, 336);
  assert.equal(validarPedido({ placa: "ABC1D23", embarque: "Av. Paulista", validadeHoras: 168 }).dados.validadeHoras, 168);
});

test("cria o link no KV com o contrato da página", async () => {
  const puts = [];
  const env = { TRACK_KV: { put: async (k, v, o) => puts.push({ k, v: JSON.parse(v), o }) } };
  const deps = {
    geocode: async (endereco) => ({ lat: -23.5, lon: -46.6, label: endereco }),
    acharVeiculo: async (placa) => ({ id: "veh-1", plate: placa }),
    agora: () => new Date("2026-10-13T12:00:00Z"),
    novoId: () => "a".repeat(64)
  };
  const { dados } = validarPedido({ placa: "ABC1D23", embarque: "Av. Paulista", destinoFinal: "GRU", horarioAgendado: "2026-10-13T14:00:00Z", titulo: "Embarque OS-1", corVeiculo: "Prata", modeloVeiculo: "Corolla", marcaVeiculo: "Toyota", validadeHoras: 6 });

  const r = await criarLink(env, "https://link.test", dados, deps);

  assert.equal(r.link, `https://link.test/r/${"a".repeat(64)}`);
  assert.equal(r.expiraEm, "2026-10-13T18:00:00.000Z");
  assert.equal(puts[0].k, `track:${"a".repeat(64)}`);
  assert.equal(puts[0].o.expirationTtl, 21600);
  assert.deepEqual(Object.keys(puts[0].v).sort(), ["confianca", "corVeiculo", "criadoPor", "destino", "destinoFinal", "embarque", "etapas", "expiraEm", "horarioAgendado", "marcaVeiculo", "modeloVeiculo", "modo", "motivoSimples", "motorista", "placa", "titulo", "vehicleId", "veiculoTemFoto"]);
  assert.equal(puts[0].v.embarque, "Av. Paulista");
  assert.equal(puts[0].v.vehicleId, "veh-1");
  assert.equal(puts[0].v.criadoPor, "operacional");
});

const ID = "b".repeat(64);
const del = (id, auth) => new Request(`https://x/api/links/${id}`, { method: "DELETE", headers: auth ? { Authorization: auth } : {} });
const rota = (id, auth, env) => rotaApiLinks(del(id, auth), env, new URL(`https://x/api/links/${id}`));

test("revogar: sem autorização retorna 401 e não apaga", async () => {
  const apagados = [];
  const env = { LINK_API_SECRET: "s3cr3t", TRACK_KV: { delete: async (k) => apagados.push(k), put: async () => {} } };
  assert.equal((await rota(ID, null, env)).status, 401);
  assert.equal((await rota(ID, "Bearer errado", env)).status, 401);
  assert.deepEqual(apagados, []);
});

test("revogar: id inválido retorna 400", async () => {
  const apagados = [];
  const env = { LINK_API_SECRET: "s3cr3t", TRACK_KV: { delete: async (k) => apagados.push(k), put: async () => {} } };
  for (const id of ["abc", "z".repeat(64), "B".repeat(64), "a".repeat(63)]) {
    const r = await rota(id, "Bearer s3cr3t", env);
    assert.equal(r.status, 400);
    assert.ok((await r.json()).erro);
  }
  assert.deepEqual(apagados, []);
});

test("revogar: apaga a chave track:<id>, grava a lápide revogado:<id> (24 h) e responde 200 (idempotente)", async () => {
  const apagados = [], gravados = [];
  const env = { LINK_API_SECRET: "s3cr3t", TRACK_KV: { delete: async (k) => apagados.push(k), put: async (k, v, o) => gravados.push([k, o?.expirationTtl]) } };
  for (let i = 0; i < 2; i++) {
    const r = await rota(ID, "Bearer s3cr3t", env);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { revogado: true });
  }
  assert.deepEqual(apagados, [`track:${ID}`, `track:${ID}`]);
  assert.deepEqual(gravados, [[`revogado:${ID}`, 86400], [`revogado:${ID}`, 86400]]);
});

test("revogar: método diferente de DELETE retorna 405", async () => {
  const r = await rotaApiLinks(new Request(`https://x/api/links/${ID}`, { method: "GET" }), {}, new URL(`https://x/api/links/${ID}`));
  assert.equal(r.status, 405);
});

test("extrai o endereço do texto da reserva", () => {
  const c = candidatosEndereco("07:30 - MUHIDINOV, RAKHIMOV - Avenida Doutor Nélson D'Ávila, 2200 - Vila das Acacias, São José dos Campos, SP, HOTEL");
  assert.equal(c[0], "Avenida Doutor Nélson D'Ávila, 2200, São José dos Campos, SP");
  assert.equal(c[1], "Avenida Doutor Nélson D'Ávila, 2200, Vila das Acacias, São José dos Campos, SP", "bairro só no candidato secundário");
  assert.equal(candidatosEndereco("1. Ana - Rua A, 10\n2. Bia - Rua B, 20")[0], "Rua A, 10");
});

test("aeroportos abreviados viram a consulta certa", () => {
  assert.equal(candidatosEndereco("Aerop. Guarulhos  AA 963")[0], "Aeroporto Internacional de Guarulhos");
  assert.deepEqual(lugaresConhecidos("07:30 - Ana - GRU T3"), ["Aeroporto Internacional de Guarulhos"]);
  assert.deepEqual(lugaresConhecidos("CGH - LA 3402"), ["Aeroporto de Congonhas, São Paulo"]);
  assert.deepEqual(lugaresConhecidos("Viracopos"), ["Aeroporto Internacional de Viracopos, Campinas"]);
  assert.deepEqual(lugaresConhecidos("Rua Guarulhos, 100 - Centro"), [], "cidade no nome da rua não é o aeroporto");
  assert.deepEqual(lugaresConhecidos("Hotel Grand Hyatt, Av. das Nações Unidas"), []);
});

test("geocode tolerante tenta candidatos, devolve rótulo limpo e null se nenhum serve", async () => {
  const geo = async (e) => { if (e.startsWith("Rua A")) return { lat: 1, lon: 2 }; throw new Error("nao"); };
  assert.deepEqual(await geocodeTolerante("08:00 - ANA - Rua A, 10, apto 3", geo), { lat: 1, lon: 2, area: null, label: "Rua A, 10" });
  assert.equal(await geocodeTolerante("sem endereco util", async () => { throw new Error("x"); }), null);
});

test("endereço com cidade: tenta rua + cidade sem bairro e recusa resultado em outra cidade", async () => {
  const texto = "16:30 - JOHAN - Avenida Nove de Julho, 500 - Jardim Esplanada, São José dos Campos, SP, B12";
  assert.deepEqual(cidadeDoTexto(texto), { cidade: "São José dos Campos", uf: "SP" });
  const c = candidatosEndereco(texto);
  assert.equal(c[0], "Avenida Nove de Julho, 500, São José dos Campos, SP", "rua + cidade, sem bairro nem código");
  assert.ok(!c.includes("Avenida Nove de Julho, 500"), "rua sozinha não vale quando o texto diz a cidade");
  const tentados = [];
  const geo = async (e) => { tentados.push(e); return e.includes("Jardim Esplanada")
    ? { lat: -23.23, lon: -45.89, cidade: "São José dos Campos" }
    : { lat: -23.57, lon: -46.69, cidade: "São Paulo" }; };
  const r = await geocodeTolerante(texto, geo);
  assert.equal(tentados.length, 2);
  assert.deepEqual(r, { lat: -23.23, lon: -45.89, area: null, label: "Avenida Nove de Julho, 500" });
  assert.equal(cidadeDoTexto("Rua A, 10"), null);
  assert.ok(candidatosEndereco("08:00 - Ana - Rua A, 10").includes("Rua A, 10"));
});

const kv = () => { const m = new Map(); return { m, put: async (k, v, o) => m.set(k, { v, o }), get: async (k) => m.get(k)?.v ?? null, getWithMetadata: async (k) => ({ value: m.get(k)?.v ?? null, metadata: m.get(k)?.o?.metadata ?? null }), delete: async (k) => m.delete(k) }; };

test("validarPedido aceita paradas, motorista e fotos; recusa foto acima de 400 KB", () => {
  const ok = validarPedido({ placa: "abc1d23", embarque: "GRU", paradas: [" Hotel Unique ", ""], motorista: { nome: "Carlos Lima", telefone: "11999990000", fotoBase64: "aGVsbG8=" } });
  assert.deepEqual(ok.dados.paradas, ["Hotel Unique"]);
  assert.equal(ok.dados.motorista.telefone, "11999990000");
  const grande = "A".repeat(Math.ceil(400 * 1024 * 4 / 3) + 8);
  assert.match(validarPedido({ placa: "x", embarque: "y", veiculo: { fotoBase64: grande } }).erro, /400 KB/);
});

test("criarLink usa as etapas do Haiku, marca modo completo e guarda as fotos", async () => {
  const env = { TRACK_KV: kv() };
  const geo = { "Aeroporto Internacional de Guarulhos": { lat: -23.4356, lon: -46.4731, area: null }, "Rua Haddock Lobo, 1000, São Paulo, SP": { lat: -23.5614, lon: -46.6659, area: null } };
  const r = await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "Aerop. GRU AA 963", destinoFinal: "R. Haddock Lobo 1000", paradas: [], validadeHoras: 4,
    motorista: { nome: "Carlos Lima", telefone: "11999990000", fotoBase64: "aGVsbG8=" }, veiculo: { fotoBase64: null } }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode: async (q) => geo[q] ?? null, agora: () => new Date("2026-10-22T12:00:00Z"), novoId: () => "f".repeat(64),
    normalizar: async () => ({ etapas: [{ tipo: "saida", local: "Aeroporto Internacional de Guarulhos", logradouro: null, cidade: "Guarulhos", uf: "SP", rotulo: "Aeroporto de Guarulhos" }, { tipo: "destino", local: null, logradouro: "Rua Haddock Lobo, 1000", cidade: "São Paulo", uf: "SP", rotulo: "Rua Haddock Lobo, 1000" }], confianca: "alta", fonte: "haiku" })
  });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"f".repeat(64)}`).v);
  assert.equal(r.link, `https://w/r/${"f".repeat(64)}`);
  assert.equal(t.modo, "completo");
  assert.equal(t.etapas.length, 2);
  assert.equal(t.destino.lat, -23.4356);
  assert.equal(t.motorista.telefone, "11999990000");
  assert.equal(t.motorista.temFoto, true);
  assert.ok(env.TRACK_KV.m.has(`foto:${"f".repeat(64)}:motorista`));
  assert.ok(!env.TRACK_KV.m.has(`foto:${"f".repeat(64)}:veiculo`));
});

test("Haiku fora → geocode do texto cru; etapa sem geocode → modo simples", async () => {
  const env = { TRACK_KV: kv() };
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "lugar estranho", destinoFinal: "outro", paradas: [], validadeHoras: 4 }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode: async () => null, agora: () => new Date(), novoId: () => "e".repeat(64), normalizar: async () => null });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"e".repeat(64)}`).v);
  assert.equal(t.modo, "simples");
});

test("concluir: auth, id, 404 e marca concluído com TTL de 2 h", async () => {
  const env = { TRACK_KV: kv(), LINK_API_SECRET: "s" };
  const id = "a".repeat(64);
  const req = (auth) => new Request(`https://w/api/links/${id}/concluir`, { method: "POST", headers: { Authorization: `Bearer ${auth}` } });
  assert.equal((await concluirLink(req("x"), env, id)).status, 401);
  assert.equal((await concluirLink(req("s"), env, "zz")).status, 400);
  assert.equal((await concluirLink(req("s"), env, id)).status, 404);
  await env.TRACK_KV.put(`track:${id}`, JSON.stringify({ placa: "ABC1D23" }));
  await env.TRACK_KV.put(`foto:${id}:motorista`, new Uint8Array([1, 2]).buffer, { metadata: { tipo: "image/png" } });
  const r = await concluirLink(req("s"), env, id, new Date("2026-10-22T12:00:00Z"));
  assert.equal(r.status, 200);
  const g = env.TRACK_KV.m.get(`track:${id}`);
  assert.equal(JSON.parse(g.v).concluidoPor, "dataverse");
  assert.equal(g.o.expirationTtl, 7200);
  assert.equal(JSON.parse(g.v).expiraEm, "2026-10-22T14:00:00.000Z");
  assert.equal(env.TRACK_KV.m.get(`foto:${id}:motorista`).o.expirationTtl, 7200);
  assert.equal(env.TRACK_KV.m.get(`foto:${id}:motorista`).o.metadata.tipo, "image/png");
  assert.equal((await rotaApiLinks(new Request(`https://w/api/links/${id}/concluir`, { method: "GET" }), env, new URL(`https://w/api/links/${id}/concluir`))).status, 405);
  await env.TRACK_KV.put(`track:${id}`, "{quebrado");
  assert.equal((await concluirLink(req("s"), env, id)).status, 404);
});

test("foto com base64 inválido → erro; prefixo data: é aceito", () => {
  assert.equal(validarPedido({ placa: "x", embarque: "y", motorista: { fotoBase64: "@@@" } }).erro, "foto inválida");
  assert.equal(validarPedido({ placa: "x", embarque: "y", veiculo: { fotoBase64: "data:image/png;base64,aGVsbG8=" } }).dados.veiculo.foto.bytes.length, 5);
});

test("modo simples guarda as etapas achadas, o motivo e a confiança", async () => {
  const env = { TRACK_KV: kv() };
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "a", destinoFinal: "b", paradas: [], validadeHoras: 4 }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode: async (q) => (q === "bbbbb" ? null : { lat: -23, lon: -46 }), agora: () => new Date(), novoId: () => "d".repeat(64), normalizar: async () => ({ etapas: [{ tipo: "saida", local: "aaaaa", logradouro: null, cidade: null, uf: null, rotulo: "Hotel A" }, { tipo: "destino", local: "bbbbb", logradouro: null, cidade: null, uf: null, rotulo: "Hotel B" }], confianca: "baixa" }) });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"d".repeat(64)}`).v);
  assert.equal(t.modo, "simples");
  assert.equal(t.confianca, "baixa");
  assert.equal(t.etapas.length, 1, "guarda a etapa que geocodificou");
  assert.equal(t.motivoSimples, "etapa sem endereço: Hotel B");
});

test("Haiku baixa com tudo geocodificado → modo completo, confiança registrada", async () => {
  const env = { TRACK_KV: kv() };
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "a", destinoFinal: "b", paradas: [], validadeHoras: 4 }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode: async (q) => (q === "aaaaa" ? { lat: -23.2237, lon: -45.9009 } : { lat: -23.4356, lon: -46.4731 }), agora: () => new Date(), novoId: () => "d".repeat(64), normalizar: async () => ({ etapas: [{ tipo: "saida", local: "aaaaa", logradouro: null, cidade: null, uf: null, rotulo: "Hotel A" }, { tipo: "destino", local: "bbbbb", logradouro: null, cidade: null, uf: null, rotulo: "Hotel B" }], confianca: "baixa" }) });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"d".repeat(64)}`).v);
  assert.equal(t.modo, "completo");
  assert.equal(t.confianca, "baixa");
  assert.equal(t.etapas.length, 2);
});

test("novoIdLink gera 12 caracteres base62 distintos", () => {
  const ids = new Set(Array.from({ length: 200 }, novoIdLink));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9A-Za-z]{12}$/);
});

test("rotas de API aceitam id novo (12 base62) e antigo (64 hex) e recusam outros", async () => {
  for (const [id, ok] of [["aB3dE5gH7jK9", true], ["a".repeat(64), true], ["aB3dE5gH7jK", false], ["aB3dE5gH7jK9m", false], ["aB3dE5gH7j-9", false], ["A".repeat(64), false]]) {
    const apagados = [];
    const env = { LINK_API_SECRET: "s3cr3t", TRACK_KV: { delete: async (k) => apagados.push(k), put: async () => {} } };
    const r = await rota(id, "Bearer s3cr3t", env);
    assert.equal(r.status === 400, !ok, id);
    assert.deepEqual(apagados, ok ? [`track:${id}`] : [], id);
  }
});

test("foto só aceita jpeg, png e webp", () => {
  const v = (t) => validarPedido({ placa: "x", embarque: "y", veiculo: { fotoBase64: `data:${t};base64,aGVsbG8=` } });
  for (const t of ["image/jpeg", "image/png", "image/webp"]) assert.ok(v(t).dados, t);
  for (const t of ["image/svg+xml", "text/html"]) assert.equal(v(t).erro, "foto inválida", t);
});

test("criarLink espaça o geocode em pelo menos 1100 ms", async () => {
  let agora = 1_000_000; const chamadas = [];
  const env = { TRACK_KV: kv() };
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "Rua Augusta 100, São Paulo", destinoFinal: "Rua Haddock Lobo 1000, São Paulo", paradas: ["Avenida Paulista 900, São Paulo"], validadeHoras: 4 }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), normalizar: async () => null, novoId: () => "d".repeat(64),
    agora: () => new Date(agora), esperar: async (ms) => { agora += ms; },
    geocode: async (q) => { chamadas.push(agora); return { lat: 1, lon: 1, area: null }; } });
  assert.equal(chamadas.length, 3);
  for (let i = 1; i < chamadas.length; i++) assert.ok(chamadas[i] - chamadas[i - 1] >= 1100);
});

test("IA com local sem logradouro: consulta sem ' - ', rótulo da IA mantido e marcado como limpo", async () => {
  const env = { TRACK_KV: kv() };
  const consultas = [];
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "x", destinoFinal: "y", paradas: [], validadeHoras: 4 }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), agora: () => new Date(), novoId: () => "c".repeat(64),
    provedores: [Object.assign(async (q) => { consultas.push(q); return [{ lat: q.includes("Ritz") ? -22.98 : -22.94, lon: q.includes("Ritz") ? -43.22 : -45.41 }]; }, { nome: "f" })],
    normalizar: async () => ({ etapas: [{ tipo: "saida", local: "Tenaris Confab", logradouro: "Avenida Gastão Vidigal Neto, 475", cidade: "Pindamonhangaba", uf: "SP", rotulo: "Tenaris Confab" }, { tipo: "destino", local: "Ritz Leblon", logradouro: null, cidade: "Rio de Janeiro", uf: "RJ", rotulo: "Ritz Leblon" }], confianca: "alta" }) });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"c".repeat(64)}`).v);
  assert.ok(consultas.every((q) => !q.includes(" - ")), consultas.join(" | "));
  assert.equal(consultas.at(-1), "Ritz Leblon, Rio de Janeiro, RJ");
  assert.deepEqual(t.etapas.map((e) => e.rotulo), ["Tenaris Confab", "Ritz Leblon"]);
  assert.ok(t.etapas.every((e) => e.rotuloLimpo) && t.destinoFinal.rotuloLimpo);
  assert.equal(t.modo, "completo");
});

test("orçamento de 45 s por criação: etapas restantes ficam sem geocode e o motivo é tempo esgotado", async () => {
  let agora = 0;
  const env = { TRACK_KV: kv() };
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "Rua Augusta, 100", destinoFinal: "Rua Haddock Lobo, 1000", paradas: ["Avenida Paulista, 900"], validadeHoras: 4 }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), normalizar: async () => null, novoId: () => "9".repeat(64), agora: () => new Date(agora),
    provedores: [Object.assign(async () => { agora += 30000; return [{ lat: -23.56, lon: -46.65 }]; }, { nome: "lento" })] });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"9".repeat(64)}`).v);
  assert.equal(t.modo, "simples");
  assert.equal(t.motivoSimples, "tempo esgotado");
  assert.equal(t.etapas.length, 2);
});

test("registro ia vai para o KV, recebe contexto e prazo, e o /dados não o publica", async () => {
  const puts = [];
  let opcoes;
  const env = { TRACK_KV: { put: async (k, v) => puts.push({ k, v: JSON.parse(v) }) } };
  const ia = { ok: false, motivo: "timeout", ms: 12000, tentativas: 2, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const { dados } = validarPedido({ placa: "ABC1D23", embarque: "Av. Paulista, 1000", destinoFinal: "GRU", titulo: "Embarque OS-9", tipoServico: "Transfer", horarioAgendado: "2026-10-23T10:00:00Z" });
  await criarLink(env, "https://w", dados, { acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode: async () => ({ lat: -23.5, lon: -46.6 }),
    agora: () => new Date(), novoId: () => "f".repeat(64), normalizar: async (_t, o) => { opcoes = o; return { ia }; } });
  assert.equal(opcoes.contexto.titulo, "Embarque OS-9");
  assert.equal(opcoes.contexto.tipoServico, "Transfer");
  assert.ok(opcoes.prazo > Date.now());
  const t = puts[0].v;
  assert.deepEqual(t.ia, ia);
  assert.equal(t.confianca, null);
  const { default: worker } = await import("../src/worker.mjs");
  const m = new Map([[`track:${"f".repeat(64)}`, JSON.stringify({ ...t, expiraEm: "2099-01-01T00:00:00Z" })], [`concluido:${"f".repeat(64)}`, "2026-10-23T12:00:00.000Z"]]);
  const r = await worker.fetch(new Request(`https://w/r/${"f".repeat(64)}/dados`), { TRACK_KV: { get: async (k) => m.get(k) ?? null } });
  const texto = await r.text();
  assert.doesNotMatch(texto, /input_tokens|tentativas|"ia"/);
});

const iaBase = (extra = {}) => ({ ok: true, motivo: null, ms: 5, tentativas: 1, input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...extra });
const etapa = (tipo, local) => ({ tipo, local, logradouro: null, cidade: "São Paulo", uf: "SP", rotulo: local, consulta: `${local}, São Paulo, SP` });
const pedidoRe = () => validarPedido({ placa: "ABC1D23", embarque: "Hotel X", destinoFinal: "Empresa Y", titulo: "Embarque OS-7" }).dados;
const criarRe = async ({ respostas, geocode, agora = () => new Date() }) => {
  const puts = [], chamadas = [];
  const env = { TRACK_KV: { put: async (k, v) => puts.push({ k, v: JSON.parse(v) }) } };
  await criarLink(env, "https://w", pedidoRe(), { acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode, agora, novoId: () => "7".repeat(64),
    normalizar: async (_t, o) => { chamadas.push(o); return respostas[chamadas.length - 1]; } });
  return { t: puts.at(-1).v, chamadas };
};

test("reanálise por etapa sem geocode: effort high, falha na mensagem e regeocodifica só a que falhou", async () => {
  const consultas = [];
  const geocode = async (q) => { consultas.push(q); return /Hotel X|Empresa Y Sede/.test(q) ? { lat: -23.5, lon: -46.6 } : null; };
  const { t, chamadas } = await criarRe({ geocode, respostas: [
    { etapas: [etapa("saida", "Hotel X"), etapa("destino", "Empresa Y")], confianca: "alta", ia: iaBase() },
    { etapas: [etapa("saida", "Hotel X"), etapa("destino", "Empresa Y Sede")], confianca: "alta", ia: iaBase({ input_tokens: 300, output_tokens: 90 }) }
  ] });
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[1].effort, "high");
  assert.equal(chamadas[1].falhas.length, 1);
  assert.equal(chamadas[1].falhas[0].tipo, "destino");
  assert.match(chamadas[1].falhas[0].consulta, /Empresa Y/);
  assert.equal(consultas.filter((q) => /Hotel X/.test(q)).length, 1, "etapa que achou não é geocodificada de novo");
  assert.equal(t.etapas.length, 2);
  assert.equal(t.ia.reanalise.ok, true);
  assert.equal(t.ia.reanalise.melhorou, true);
  assert.equal(t.ia.reanalise.input_tokens, 300);
  assert.equal(t.ia.reanalise.output_tokens, 90);
  assert.equal(typeof t.ia.reanalise.ms, "number");
});

test("reanálise por confiança baixa, sem melhora registrada", async () => {
  const { t, chamadas } = await criarRe({ geocode: async () => ({ lat: -23.5, lon: -46.6 }), respostas: [
    { etapas: [etapa("saida", "Hotel X"), etapa("destino", "Empresa Y")], confianca: "baixa", ia: iaBase() },
    { ia: iaBase({ ok: false, motivo: "timeout" }) }
  ] });
  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas[1].falhas, []);
  assert.equal(t.ia.reanalise.ok, false);
  assert.equal(t.ia.reanalise.motivo, "timeout");
  assert.equal(t.ia.reanalise.melhorou, false);
  assert.equal(t.confianca, "baixa");
});

test("sem reanálise quando tudo achou com confiança alta", async () => {
  const { t, chamadas } = await criarRe({ geocode: async () => ({ lat: -23.5, lon: -46.6 }), respostas: [
    { etapas: [etapa("saida", "Hotel X"), etapa("destino", "Empresa Y")], confianca: "alta", ia: iaBase() }] });
  assert.equal(chamadas.length, 1);
  assert.equal(t.ia.reanalise, undefined);
});

test("sem reanálise quando não cabe no orçamento", async () => {
  let relogio = Date.parse("2026-10-23T12:00:00Z");
  const geocode = async () => { relogio += 20000; return null; };
  const { t, chamadas } = await criarRe({ geocode, agora: () => new Date(relogio), respostas: [
    { etapas: [etapa("saida", "Hotel X"), etapa("destino", "Empresa Y")], confianca: "baixa", ia: iaBase() }] });
  assert.equal(chamadas.length, 1);
  assert.equal(t.ia.reanalise, undefined);
});

test("trajeto da reserva chega à IA junto com saída e destino", async () => {
  assert.equal(validarPedido({ placa: "x", embarque: "y", trajeto: "  São José dos Campos → São José dos Campos " }).dados.trajeto, "São José dos Campos → São José dos Campos");
  assert.equal(validarPedido({ placa: "x", embarque: "y" }).dados.trajeto, null);
  let recebido = null;
  const env = { TRACK_KV: kv() };
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "Rua dos Cajueiros, 260", destinoFinal: "Avenida Nove de Julho, 417", trajeto: "Jacareí → São José dos Campos", paradas: [], validadeHoras: 4, motorista: null, veiculo: { foto: null } }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode: async () => null, agora: () => new Date("2026-11-03T12:00:00Z"), novoId: () => "t".repeat(64),
    normalizar: async (textos) => { recebido = textos; return null; }
  });
  assert.equal(recebido.trajeto, "Jacareí → São José dos Campos");
});

test("PUT /api/links/:id recalcula as etapas do mesmo link, mantém validade e progresso de quem não mudou", async () => {
  const env = { TRACK_KV: kv(), LINK_API_SECRET: "s" };
  const geo = { Alfa: { lat: -23.5, lon: -46.6 }, Beta: { lat: -23.6, lon: -46.7 }, Gama: { lat: -23.2, lon: -45.9 } };
  const provedor = Object.assign(async (q) => { const k = Object.keys(geo).find((n) => q.includes(n)); return k ? [{ ...geo[k], area: null, cidade: "São Paulo" }] : []; }, { nome: "t" });
  const deps = { acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), provedores: [provedor], agora: () => new Date("2026-11-04T12:00:00Z"), novoId: () => "g".repeat(12), normalizar: async () => null };
  const base = { placa: "ABC1D23", paradas: [], validadeHoras: 4, titulo: "Embarque a → b" };
  await criarLink(env, "https://w", { ...base, embarque: "Rua Alfa, 10, São Paulo", destinoFinal: "Rua Beta, 20, São Paulo" }, deps);
  const id = "g".repeat(12), chave = `track:${id}`;
  const t0 = JSON.parse(env.TRACK_KV.m.get(chave).v);
  t0.etapas[0].chegouEm = "2026-11-04T11:50:00Z"; t0.estado = { chegandoEm: "x" };
  env.TRACK_KV.m.set(chave, { v: JSON.stringify(t0) });

  // Destino mudou, saída igual: progresso da saída e estado ficam; validade não muda.
  const { atualizarLink } = await import("../src/api-links.mjs");
  const r = await atualizarLink(env, id, { ...base, embarque: "Rua Alfa, 10, São Paulo", destinoFinal: "Rua Gama, 30, São Paulo" }, { ...deps, agora: () => new Date("2026-11-04T13:00:00Z") });
  assert.deepEqual(r, { atualizado: true, mesmaSaida: true });
  const t1 = JSON.parse(env.TRACK_KV.m.get(chave).v);
  assert.equal(t1.destinoFinal.lat, -23.2);
  assert.equal(t1.etapas[0].chegouEm, "2026-11-04T11:50:00Z");
  assert.deepEqual(t1.estado, { chegandoEm: "x" });
  assert.equal(t1.expiraEm, t0.expiraEm);
  assert.equal(env.TRACK_KV.m.get(chave).o.expirationTtl, 3 * 3600);

  // Saída mudou: zera progresso e marcos.
  await atualizarLink(env, id, { ...base, embarque: "Rua Gama, 30, São Paulo", destinoFinal: "Rua Beta, 20, São Paulo" }, deps);
  const t2 = JSON.parse(env.TRACK_KV.m.get(chave).v);
  assert.equal(t2.destino.lat, -23.2);
  assert.equal(t2.etapas[0].chegouEm, undefined);
  assert.deepEqual(t2.estado, {});

  // Concluído, inexistente e expirado.
  env.TRACK_KV.m.set(`concluido:${id}`, { v: "2026-11-04T14:00:00Z" });
  assert.deepEqual(await atualizarLink(env, id, { ...base, embarque: "Rua Alfa, 10, São Paulo" }, deps), { concluido: true });
  assert.equal(await atualizarLink(env, "h".repeat(12), { ...base, embarque: "Rua Alfa, 10, São Paulo" }, deps), null);
  env.TRACK_KV.m.delete(`concluido:${id}`);
  assert.equal(await atualizarLink(env, id, { ...base, embarque: "Rua Alfa, 10, São Paulo" }, { ...deps, agora: () => new Date("2026-11-04T16:00:00Z") }), null);

  // Rota: auth e id.
  const put = (auth, i = id) => rotaApiLinks(new Request(`https://w/api/links/${i}`, { method: "PUT", headers: auth ? { Authorization: auth } : {}, body: "{}" }), env, new URL(`https://w/api/links/${i}`));
  assert.equal((await put(null)).status, 401);
  assert.equal((await put("Bearer s", "x")).status, 400);
  assert.equal((await put("Bearer s")).status, 400, "corpo sem placa");
});

test("etapa no aeroporto guarda a chegada no terminal citado; endereço comum não", async () => {
  const env = { TRACK_KV: kv() };
  const geocode = async (q) => (/guarulhos/i.test(q) ? { lat: -23.4356, lon: -46.4731 } : { lat: -23.5614, lon: -46.6559 });
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "Av. Paulista, 1000, São Paulo", destinoFinal: "Aeroporto de Guarulhos Terminal 3", paradas: [], validadeHoras: 4 }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode, agora: () => new Date(), novoId: () => "b".repeat(64), normalizar: async () => null });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"b".repeat(64)}`).v);
  const [saida, destino] = t.etapas;
  assert.equal(saida.chegada, undefined);
  assert.deepEqual(destino.chegada, { lat: -23.4257371, lon: -46.4740626 });
  assert.equal(destino.lat, -23.4356); // marcador e "chegou" continuam no ponto geocodificado
});

// ---- cadastro (credencial do portal de passageiros) ----
const HASH = "ab".repeat(32);
const pedidoCad = (cadastro) => validarPedido({ placa: "ABC1D23", embarque: "Rua Alfa, 10, São Paulo", validadeHoras: 4, ...(cadastro === undefined ? {} : { cadastro }) });

test("validarPedido: cadastro opcional; hash de 64 hex minúsculos e ambiente dev|prod, senão 400", () => {
  assert.equal(pedidoCad().dados.cadastro, null);
  assert.deepEqual(pedidoCad({ hash: HASH, ambiente: "prod" }).dados.cadastro, { hash: HASH, ambiente: "prod" });
  for (const ruim of [{ hash: HASH.toUpperCase(), ambiente: "dev" }, { hash: "abc", ambiente: "dev" }, { hash: HASH, ambiente: "teste" }, { hash: HASH }, { ambiente: "dev" }, "texto", { hash: 1, ambiente: "dev" }]) {
    assert.equal(pedidoCad(ruim).erro, "cadastro inválido", JSON.stringify(ruim));
  }
});

test("cadastro: criar grava cadastroHash/cadastroAmbiente; PUT sem cadastro preserva, com cadastro troca; /dados e HTML nunca o publicam", async () => {
  const env = { TRACK_KV: kv() };
  const provedor = Object.assign(async () => [{ lat: -23.5, lon: -46.6, area: null, cidade: "São Paulo" }], { nome: "t" });
  const deps = { acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), provedores: [provedor], agora: () => new Date("2026-11-04T12:00:00Z"), novoId: () => "c".repeat(12), normalizar: async () => null };
  await criarLink(env, "https://w", pedidoCad({ hash: HASH, ambiente: "dev" }).dados, deps);
  const chave = `track:${"c".repeat(12)}`;
  assert.deepEqual([JSON.parse(env.TRACK_KV.m.get(chave).v).cadastroHash, JSON.parse(env.TRACK_KV.m.get(chave).v).cadastroAmbiente], [HASH, "dev"]);

  const { atualizarLink } = await import("../src/api-links.mjs");
  await atualizarLink(env, "c".repeat(12), pedidoCad().dados, deps);
  const t = JSON.parse(env.TRACK_KV.m.get(chave).v);
  assert.equal(t.cadastroHash, HASH);
  assert.equal(t.cadastroAmbiente, "dev");
  const outro = "cd".repeat(32);
  await atualizarLink(env, "c".repeat(12), pedidoCad({ hash: outro, ambiente: "prod" }).dados, deps);
  assert.equal(JSON.parse(env.TRACK_KV.m.get(chave).v).cadastroHash, outro);

  // Nem o /dados nem a página (HTML) contêm o hash.
  const { default: worker } = await import("../src/worker.mjs");
  const envW = { TRACK_KV: { get: async (k) => (k === chave ? env.TRACK_KV.m.get(chave).v : k.startsWith("concluido:") ? "2026-11-04T13:00:00Z" : null), getWithMetadata: async () => ({ value: null, metadata: null }) } };
  for (const sufixo of ["", "/dados"]) {
    const texto = await (await worker.fetch(new Request(`https://w/r/${"c".repeat(12)}${sufixo}`), envW)).text();
    assert.doesNotMatch(texto, new RegExp(`${outro}|cadastroHash|cadastroAmbiente`), sufixo || "html");
  }
});

test("link sem rastreio: sem placa ou com rastreio false não consulta a Infleet; PUT troca de modo", async () => {
  const env = { TRACK_KV: kv(), LINK_API_SECRET: "s" };
  const buscas = [];
  const deps = { acharVeiculo: async (p) => { buscas.push(p); return { id: "v1", plate: p }; }, geocode: async () => ({ lat: -23.5, lon: -46.6 }),
    agora: () => new Date("2026-11-25T12:00:00Z"), novoId: () => "s".repeat(12), normalizar: async () => null };
  const pedido = (extra) => validarPedido({ embarque: "Rua Alfa, 10", validadeHoras: 48, ...extra }).dados;
  const id = "s".repeat(12), ler = () => JSON.parse(env.TRACK_KV.m.get(`track:${id}`).v);
  const { atualizarLink } = await import("../src/api-links.mjs");

  await criarLink(env, "https://w", pedido({}), deps);
  assert.deepEqual([ler().vehicleId, ler().placa, ler().motorista, buscas.length], [null, null, null, 0]);

  // Terceiro sem rastreador: placa vem, Infleet não.
  await atualizarLink(env, id, pedido({ placa: "ter-1a23", rastreio: false, motorista: { nome: "Ana" } }), deps);
  assert.deepEqual([ler().vehicleId, ler().placa, ler().motorista.nome, buscas.length], [null, "TER1A23", "Ana", 0]);

  // Escala com carro Infleet: busca o veículo; tirar o motorista volta a sem veículo, sem revogar.
  await atualizarLink(env, id, pedido({ placa: "ABC1D23", motorista: { nome: "Bia" } }), deps);
  assert.deepEqual([ler().vehicleId, buscas], ["v1", ["ABC1D23"]]);
  const r = await atualizarLink(env, id, pedido({}), deps);
  assert.equal(r.atualizado, true);
  assert.deepEqual([ler().vehicleId, ler().placa, ler().motorista], [null, null, null]);
});
