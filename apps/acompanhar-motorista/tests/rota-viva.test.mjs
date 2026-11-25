import assert from "node:assert/strict";
import test from "node:test";
import { leituraConfiavel, registrarNaTrilha, rumoDaTrilha, cortarRota, avaliarRota, decidirRota } from "../src/rota-viva.mjs";

// Dutra em Guarulhos, sentido oeste (São Paulo): longitude diminui
const base = { lat: -23.4440, lon: -46.4350 };
const oeste = (m) => ({ lat: base.lat, lon: base.lon - m / (111320 * Math.cos(base.lat * Math.PI / 180)) });
const T0 = Date.parse("2026-11-12T19:00:00Z");
const leitura = (m, s) => ({ ...oeste(m), fixTime: new Date(T0 + s * 1000).toISOString() });

test("leituraConfiavel: aceita andar normal e recusa coordenada inválida, futuro, fora de ordem e salto", () => {
  const a = leitura(0, 0);
  assert.equal(leituraConfiavel(null, a, T0), true);
  assert.equal(leituraConfiavel(a, leitura(400, 20), T0 + 20000), true);          // 72 km/h
  assert.equal(leituraConfiavel(a, { lat: NaN, lon: 1, fixTime: a.fixTime }, T0), false);
  assert.equal(leituraConfiavel(null, { lat: 0, lon: 0, fixTime: a.fixTime }, T0), false);
  assert.equal(leituraConfiavel(null, leitura(0, 600), T0), false);                // 10 min no futuro
  assert.equal(leituraConfiavel(leitura(0, 30), leitura(100, 10), T0 + 30000), false);
  assert.equal(leituraConfiavel(a, leitura(5000, 20), T0 + 20000), false);        // 900 km/h
  assert.equal(leituraConfiavel(a, leitura(200, 0), T0), true);                   // salto pequeno sempre passa
});

test("registrarNaTrilha: acumula até 8, ignora repetida e recomeça com duas ruins coerentes", () => {
  let t = { pontos: [], rejeitada: null };
  for (let i = 0; i < 10; i++) t = registrarNaTrilha(t, leitura(i * 300, i * 15), T0 + i * 15000);
  assert.equal(t.pontos.length, 8);
  const igual = registrarNaTrilha(t, t.pontos.at(-1), T0 + 200000);
  assert.equal(igual, t);
  const ultima = t.pontos.at(-1);
  const pulo = { ...oeste(60000), fixTime: new Date(Date.parse(ultima.fixTime) + 15000).toISOString() };
  t = registrarNaTrilha(t, pulo, T0 + 200000);
  assert.equal(t.pontos.at(-1), ultima);
  assert.equal(t.rejeitada, pulo);
  const seguinte = { ...oeste(60300), fixTime: new Date(Date.parse(pulo.fixTime) + 15000).toISOString() };
  t = registrarNaTrilha(t, seguinte, T0 + 215000);
  assert.deepEqual(t.pontos, [pulo, seguinte]);
  assert.equal(t.rejeitada, null);
});

test("rumoDaTrilha: oeste ≈ 270° a 72 km/h; parado ou sem janela → null", () => {
  const r = rumoDaTrilha([leitura(0, 0), leitura(200, 10), leitura(400, 20)]);
  assert.ok(Math.abs(r.rumo - 270) < 1);
  assert.ok(Math.abs(r.velocidadeKmh - 72) <= 1);
  assert.equal(rumoDaTrilha([leitura(0, 0), leitura(10, 60)]), null);               // < 40 m
  assert.equal(rumoDaTrilha([leitura(0, 0), leitura(50, 60)]), null);               // 3 km/h
  assert.equal(rumoDaTrilha([leitura(0, 0), leitura(2000, 400)]), null);            // fora da janela de 3 min
  assert.equal(rumoDaTrilha([leitura(0, 0)]), null);
});

const norte = (q, m) => ({ lat: q.lat + m / 111320, lon: q.lon });
const linha = (...pts) => pts.map((q) => [q.lon, q.lat]);
// Rota boa: 10 km reto para oeste
const boa = { km: 10, minutos: 20, coords: linha(oeste(0), oeste(5000), oeste(10000)), fonte: "tomtom" };
// Rota com retorno: 1 km para leste, volta pela outra pista (40 m ao norte) e segue 10 km para oeste
const leste1 = { lat: base.lat, lon: base.lon + 1000 / (111320 * Math.cos(base.lat * Math.PI / 180)) };
const comRetorno = { km: 12, minutos: 26, coords: linha(oeste(0), leste1, norte(leste1, 40), norte(oeste(0), 40), norte(oeste(10000), 40)), fonte: "tomtom" };

test("cortarRota: corta na projeção e reduz km e minutos na proporção", () => {
  const r = cortarRota(boa, norte(oeste(2500), 20));
  assert.ok(Math.abs(r.km - 7.5) < 0.1);
  assert.equal(r.minutos, 15);
  assert.ok(Math.abs(r.coords[0][0] - oeste(2500).lon) < 1e-5);
  assert.equal(r.coords.length, 3);
  assert.equal(cortarRota(boa, norte(oeste(2500), 200)), null);
  assert.equal(cortarRota(null, base), null);
});

test("avaliarRota: retorno e contramão; rota boa passa", () => {
  const alvo = oeste(10000);
  assert.deepEqual(avaliarRota(boa, { pos: oeste(0), alvo, rumo: 270 }), []);
  const m = avaliarRota(comRetorno, { pos: oeste(0), alvo, rumo: 270 });
  assert.ok(m.includes("contramao"));
  assert.ok(m.includes("volta"));
  assert.deepEqual(avaliarRota(comRetorno, { pos: oeste(0), alvo, rumo: null }), ["volta"]);
});

test("avaliarRota: desvio quando a rota passa de 2,5× a reta", () => {
  const longa = { ...boa, km: 30 };
  assert.deepEqual(avaliarRota(longa, { pos: oeste(0), alvo: oeste(10000), rumo: null }), ["desvio"]);
  assert.deepEqual(avaliarRota(longa, { pos: oeste(0), alvo: oeste(1000), rumo: null }).includes("desvio"), false); // reta < 2 km
});

const fix = (s) => new Date(T0 + s * 1000).toISOString();
const entrada = (pos, s, extra = {}) => ({ pos, fixTime: fix(s), alvo: oeste(10000), alvoChave: "fim", agoraMs: T0 + s * 1000, perto: false, rumo: 270, ...extra });
const contador = (...rotas) => { const f = async () => { f.n++; return rotas.shift() ?? null; }; f.n = 0; return f; };

test("decidirRota: primeira rota é calculada; depois segue cortando sem chamar o roteador", async () => {
  const calc = contador(boa);
  const r1 = await decidirRota(null, entrada(oeste(0), 0), calc);
  assert.equal(r1.decisao, "nova");
  const r2 = await decidirRota(r1.estado, entrada(oeste(1000), 30), calc);
  assert.equal(r2.decisao, "seguindo");
  assert.equal(calc.n, 1);
  assert.ok(r2.rota.km < 10);
});

test("decidirRota: fora da rota só recalcula na segunda leitura diferente", async () => {
  const calc = contador(boa, boa);
  const { estado } = await decidirRota(null, entrada(oeste(0), 0), calc);
  const fora = norte(oeste(1000), 300);
  const a = await decidirRota(estado, entrada(fora, 30), calc);
  assert.equal(a.decisao, "fora_aguardando");
  const mesma = await decidirRota(a.estado, entrada(fora, 30), calc);
  assert.equal(mesma.decisao, "fora_aguardando");
  const b = await decidirRota(mesma.estado, entrada(norte(oeste(1300), 300), 45), calc);
  assert.equal(b.decisao, "recalculada");
  assert.equal(calc.n, 2);
});

test("decidirRota: rota velha perto do alvo recalcula em 2 min; longe só em 4 min", async () => {
  const calc = contador(boa, boa);
  const { estado } = await decidirRota(null, entrada(oeste(0), 0), calc);
  assert.equal((await decidirRota(estado, entrada(oeste(500), 150), calc)).decisao, "seguindo");
  assert.equal((await decidirRota(estado, entrada(oeste(500), 150, { perto: true }), calc)).decisao, "recalculada");
  assert.equal(calc.n, 2);
});

test("decidirRota: rota com retorno espera confirmação e mantém a anterior", async () => {
  const calc = contador(boa, comRetorno, comRetorno);
  const { estado } = await decidirRota(null, entrada(oeste(0), 0), calc);
  // rota velha (4 min) força o recálculo, que volta com retorno
  const a = await decidirRota(estado, entrada(oeste(500), 250), calc);
  assert.equal(a.decisao, "suspeita_aguardando");
  assert.equal(a.rota.coords.at(-1)[0], boa.coords.at(-1)[0]);
  const repetida = await decidirRota(a.estado, entrada(oeste(500), 250), calc);
  assert.equal(repetida.decisao, "suspeita_aguardando");
  assert.equal(calc.n, 2);
  const b = await decidirRota(repetida.estado, entrada(oeste(700), 265), calc);
  assert.equal(b.decisao, "suspeita_aceita");
  assert.deepEqual(b.motivos.includes("volta"), true);
});

test("decidirRota: alvo novo descarta o estado; roteador fora devolve a última exibida", async () => {
  const calc = contador(boa, null);
  const { estado } = await decidirRota(null, entrada(oeste(0), 0), calc);
  const r = await decidirRota(estado, entrada(oeste(0), 10, { alvoChave: "etapa2" }), calc);
  assert.equal(r.decisao, "sem_rota");
  assert.equal(r.rota, null);
});

test("decidirRota: roteador fora com rota velha mantém a última exibida", async () => {
  const calc = contador(boa, null);
  const { estado } = await decidirRota(null, entrada(oeste(0), 0), calc);
  const r = await decidirRota(estado, entrada(oeste(500), 250), calc);
  assert.equal(r.decisao, "sem_rota");
  assert.ok(r.rota && r.rota.km < 10);
});
