import assert from "node:assert/strict";
import test from "node:test";
import { calcularDados, gravarNoKv, marcosChave, publicarDados } from "../src/dados.mjs";

const etapas = () => [{ tipo: "saida", rotulo: "Saída", rotuloLimpo: true, lat: -23.5, lon: -46.6 }, { tipo: "destino", rotulo: "Destino", rotuloLimpo: true, lat: -23.6, lon: -46.7 }];

async function comInfleet(location, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const q = JSON.parse(init?.body ?? "{}").query ?? "";
    if (q.includes("getVehicle")) return Response.json({ data: { getVehicle: { plate: "ABC1D23", hasSignal: true, driver: null, location } } });
    if (q.includes("listVehiclePositions")) return Response.json({ data: { listVehiclePositions: [] } });
    return new Response("{}", { status: 500 }); // roteador/OSRM fora: rota viva segue sem rota
  };
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test("calcularDados: concluído não consulta a Infleet nem grava", async () => {
  const gravados = [];
  const t = { modo: "completo", etapas: etapas(), expiraEm: "2099-01-01T00:00:00Z" };
  const d = await calcularDados("x".repeat(12), t, {}, {}, { concluido: true, gravar: (l) => gravados.push(l) });
  assert.equal(d.fase, "concluido");
  assert.equal(gravados.length, 0);
});

test("calcularDados: sem veículo da Infleet não consulta a Infleet e marca em definição", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("não devia chamar"); };
  try {
    const t = { modo: "completo", etapas: etapas(), vehicleId: null, motorista: null, horarioAgendado: new Date().toISOString(), expiraEm: "2099-01-01T00:00:00Z" };
    const d = await calcularDados("z".repeat(12), t, {}, {}, { gravar: () => {} });
    assert.deepEqual([d.fase, d.rastreio, d.emDefinicao, d.posicao], ["agendado", false, true, null]);
    const sem = await calcularDados("z".repeat(12), { ...t, motorista: { nome: "Ana" } }, {}, {}, { gravar: () => {} });
    assert.deepEqual([sem.rastreio, sem.emDefinicao, sem.motorista.nome], [false, false, "Ana"]);
  } finally { globalThis.fetch = original; }
});

test("calcularDados: posição nova grava com mesclar e guarda a trilha no `est` recebido", async () => {
  const gravados = [], est = {};
  const t = { modo: "completo", vehicleId: "v1", etapas: etapas(), expiraEm: "2099-01-01T00:00:00Z" };
  const fix = new Date().toISOString();
  const d = await comInfleet({ latitude: -23.4, longitude: -46.5, speed: 30, fixTime: fix }, () =>
    calcularDados("y".repeat(12), t, { INFLEET_TOKEN: "x" }, est, { gravar: (l, o) => gravados.push({ ultimaPos: l.ultimaPos, ...o }) }));
  assert.equal(d.fase, "a_caminho");
  assert.deepEqual(gravados[0], { ultimaPos: { lat: -23.4, lon: -46.5, fixTime: fix }, mesclar: true });
  assert.equal(est.trilha.pontos.at(-1).fixTime, fix);
  assert.equal(t.ultimaPos.fixTime, fix, "t é a cópia de trabalho");
});

test("calcularDados: link antigo grava os marcos sem mesclar", async () => {
  const gravados = [];
  const t = { placa: "A", vehicleId: "v1", destino: { lat: -23.5, lon: -46.6, area: null, label: "Saída" }, destinoTentadoEm: "x", expiraEm: "2099-01-01T00:00:00Z" };
  await comInfleet({ latitude: -23.5, longitude: -46.6, speed: 0, fixTime: new Date().toISOString() }, () =>
    calcularDados("z".repeat(12), t, { INFLEET_TOKEN: "x" }, {}, { gravar: (l, o) => gravados.push({ estado: l.estado, ...o }) }));
  assert.equal(gravados.length, 1);
  assert.equal(gravados[0].mesclar, false);
  assert.ok(gravados[0].estado.chegouEmbarqueEm);
});

test("gravarNoKv com mesclar preserva etapas e conclusão já gravadas", async () => {
  const id = "k".repeat(12), puts = [];
  const noKv = { etapas: [{ tipo: "saida", chegouEm: "2026-11-13T10:00:00Z" }, { tipo: "destino" }], concluidoPor: "dataverse", concluidoEm: "2026-11-13T11:00:00Z" };
  const env = { TRACK_KV: { get: async () => JSON.stringify(noKv), put: async (k, v) => puts.push([k, JSON.parse(v)]) } };
  const t = { etapas: [{ tipo: "saida" }, { tipo: "destino" }], expiraEm: "2099-01-01T00:00:00Z" };
  await gravarNoKv(env, id, t, { mesclar: true });
  assert.equal(puts[0][0], `track:${id}`);
  assert.equal(puts[0][1].etapas[0].chegouEm, "2026-11-13T10:00:00Z");
  assert.equal(puts[0][1].concluidoPor, "dataverse");
  assert.equal(t.etapas[0].chegouEm, "2026-11-13T10:00:00Z", "a mescla volta para t");
});

test("marcosChave ignora só a última posição", () => {
  const t = { etapas: [{ chegouEm: null }], ultimaPos: { lat: 1 } };
  assert.equal(marcosChave(t), marcosChave({ ...t, ultimaPos: { lat: 2 } }));
  assert.notEqual(marcosChave(t), marcosChave({ ...t, etapas: [{ chegouEm: "x" }] }));
});

test("publicarDados: diagnóstico só com debug, mais avaliado/versao/servidorEm", () => {
  const agora = new Date("2026-11-13T12:00:00Z");
  const d = { fase: "a_caminho", diagnostico: { rumo: 1 } };
  assert.deepEqual(publicarDados(d, { versao: "0.0.1", agora }), { fase: "a_caminho", avaliado: false, versao: "0.0.1", servidorEm: agora.toISOString() });
  assert.deepEqual(publicarDados(d, { debug: true, versao: "0.0.1", agora }).diagnostico, { rumo: 1 });
});

// Conta as chamadas fora da Infleet (roteador, OSRM, geocodificação): o modo economia não deve fazer nenhuma.
async function contandoRoteador(location, fn) {
  const original = globalThis.fetch, cont = { fora: 0 };
  globalThis.fetch = async (url, init) => {
    const q = JSON.parse(typeof init?.body === "string" && init.body.startsWith("{") ? init.body : "{}").query ?? "";
    if (q.includes("getVehicle")) return Response.json({ data: { getVehicle: { plate: "ABC1D23", hasSignal: true, driver: null, location } } });
    if (q.includes("listVehiclePositions")) return Response.json({ data: { listVehiclePositions: [] } });
    cont.fora++;
    return new Response("{}", { status: 500 });
  };
  try { await fn(); return cont.fora; } finally { globalThis.fetch = original; }
}
const linkEtapas = () => ({ modo: "completo", vehicleId: "v1", etapas: etapas(), expiraEm: "2099-01-01T00:00:00Z" });
const pos = (lat) => ({ latitude: lat, longitude: -46.6, speed: 40, fixTime: new Date().toISOString() });
const nada = async () => {};

test("economia: a 15 km ou mais do alvo não há rota nem roteador; sem economia, o roteador é chamado", async () => {
  let d;
  const longe = await contandoRoteador(pos(-23.0), async () => { d = await calcularDados("e".repeat(12), linkEtapas(), { INFLEET_TOKEN: "x" }, {}, { economia: true, gravar: nada }); });
  assert.equal(longe, 0);
  assert.equal(d.rota, null);
  assert.equal(d.fase, "a_caminho");
  const normal = await contandoRoteador(pos(-23.0), () => calcularDados("e".repeat(12), linkEtapas(), { INFLEET_TOKEN: "x" }, {}, { gravar: nada }));
  assert.ok(normal > 0);
});

test("economia: perto do alvo, roteador só se a última rota tem 5 min ou mais", async () => {
  const recente = await contandoRoteador(pos(-23.52), () =>
    calcularDados("e".repeat(12), linkEtapas(), { INFLEET_TOKEN: "x" }, { rotaEm: Date.now() - 60000 }, { economia: true, gravar: nada }));
  assert.equal(recente, 0);
  const est = { rotaEm: Date.now() - 6 * 60000 };
  const velha = await contandoRoteador(pos(-23.52), () => calcularDados("e".repeat(12), linkEtapas(), { INFLEET_TOKEN: "x" }, est, { economia: true, gravar: nada }));
  assert.ok(velha > 0);
  assert.ok(Date.now() - est.rotaEm < 1000, "tentativa nova renova rotaEm");
});

test("gravarNoKv com mesclar não recria link apagado (revogado ou expirado)", async () => {
  const puts = [];
  const env = { TRACK_KV: { get: async () => null, put: async (k) => puts.push(k) } };
  assert.equal(await gravarNoKv(env, "k".repeat(12), { etapas: [], expiraEm: "2099-01-01T00:00:00Z" }, { mesclar: true }), false);
  assert.equal(puts.length, 0);
});
