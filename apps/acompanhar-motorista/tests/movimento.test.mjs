import assert from "node:assert/strict";
import test from "node:test";
import { rumo, giro, interpolar, metrosEntre, planoDeMovimento, idadeTexto, projetarNaLinha, carroNaRota, etaEstavel } from "../src/movimento.mjs";

const p = { lat: -23.5614, lon: -46.6559 };
const norte = (m) => ({ lat: p.lat + m / 111320, lon: p.lon });
const leste = (m) => ({ lat: p.lat, lon: p.lon + m / (111320 * Math.cos(p.lat * Math.PI / 180)) });

test("rumo: norte 0°, leste 90°, sul 180°, oeste 270°", () => {
  assert.ok(Math.abs(rumo(p, norte(100)) - 0) < 0.5);
  assert.ok(Math.abs(rumo(p, leste(100)) - 90) < 0.5);
  assert.ok(Math.abs(rumo(norte(100), p) - 180) < 0.5);
  assert.ok(Math.abs(rumo(leste(100), p) - 270) < 0.5);
});

test("giro escolhe o menor caminho ao cruzar o norte", () => {
  assert.equal(giro(350, 10), 20);
  assert.equal(giro(10, 350), -20);
  assert.equal(giro(90, 270), 180);
  assert.equal(giro(45, 45), 0);
});

test("interpolar é linear e limitada a [0, 1]", () => {
  const b = norte(1000);
  assert.deepEqual(interpolar(p, b, 0), p);
  assert.ok(Math.abs(metrosEntre(p, interpolar(p, b, 0.5)) - 500) < 1);
  assert.deepEqual(interpolar(p, b, 2), b);
  assert.deepEqual(interpolar(p, b, -1), p);
});

test("plano: desliza entre atualizações normais; salta sem origem, escondido, com salto grande ou reduzindo movimento", () => {
  assert.deepEqual(planoDeMovimento(null, p, {}), { modo: "saltar", duracaoMs: 0, rumo: null });
  const normal = planoDeMovimento(p, norte(200), { intervaloMs: 15000 });
  assert.equal(normal.modo, "deslizar"); assert.equal(normal.duracaoMs, 15000); assert.ok(Math.abs(normal.rumo) < 0.5);
  assert.equal(planoDeMovimento(p, norte(200), { intervaloMs: 60000 }).duracaoMs, 20000, "teto de 20 s");
  assert.equal(planoDeMovimento(p, norte(200), { intervaloMs: 500 }).duracaoMs, 2000, "piso de 2 s");
  assert.equal(planoDeMovimento(p, norte(200), { oculto: true }).modo, "saltar");
  assert.equal(planoDeMovimento(p, norte(200), { reduzMovimento: true }).modo, "saltar");
  assert.equal(planoDeMovimento(p, norte(3500), {}).modo, "saltar");
});

test("plano: ruído de GPS parado não mexe o carro nem o rumo", () => {
  assert.deepEqual(planoDeMovimento(p, norte(3), {}), { modo: "parado", duracaoMs: 0, rumo: null });
  assert.equal(planoDeMovimento(p, norte(6), {}).rumo, null, "entre 5 e 8 m desliza sem girar");
});

test("idadeTexto", () => {
  assert.equal(idadeTexto(3000), "agora");
  assert.equal(idadeTexto(45000), "45 s");
  assert.equal(idadeTexto(125000), "2 min");
  assert.equal(idadeTexto(65 * 60000), "1 h 05");
  assert.equal(idadeTexto(-5), "");
});

test("rumoDaRota: aponta para a rota à frente, não para o deslocamento", async () => {
  const { rumoDaRota } = await import("../src/movimento.mjs");
  const pos = { lat: -23.3, lon: -45.97 };
  // Rota indo para o oeste (lon diminuindo), começando no carro.
  const oeste = [[-45.97, -23.3], [-45.9702, -23.3], [-45.971, -23.3], [-45.98, -23.3]];
  const r = rumoDaRota(pos, oeste);
  assert.ok(Math.abs(r - 270) < 1, `rumo ${r}`);
  // Rota para o norte.
  const norte = [[-45.97, -23.3], [-45.97, -23.299], [-45.97, -23.29]];
  assert.ok(Math.min(rumoDaRota(pos, norte), 360 - rumoDaRota(pos, norte)) < 1);
  // Carro longe da rota (> 150 m) ou sem rota: null.
  assert.equal(rumoDaRota({ lat: -23.31, lon: -45.97 }, oeste), null);
  assert.equal(rumoDaRota(pos, null), null);
  assert.equal(rumoDaRota(pos, [[-45.97, -23.3]]), null);
});

test("rumoDoPercorrido: direção do fim do caminho feito", async () => {
  const { rumoDoPercorrido } = await import("../src/movimento.mjs");
  const r = rumoDoPercorrido([[-46.0, -23.3], [-45.99, -23.3], [-45.98, -23.3]]);
  assert.ok(Math.abs(r - 90) < 1, `rumo ${r}`);
  assert.equal(rumoDoPercorrido([[-46, -23.3]]), null);
});

const linhaLeste = [[p.lon, p.lat], [leste(1000).lon, leste(1000).lat]];

test("projetarNaLinha: ponto 20 m ao norte do meio da linha", () => {
  const meio = leste(500), q = { lat: meio.lat + 20 / 111320, lon: meio.lon };
  const r = projetarNaLinha(q, linhaLeste);
  assert.equal(r.indice, 0);
  assert.ok(Math.abs(r.distancia - 20) < 1);
  assert.ok(Math.abs(r.metrosAntes - 500) < 2);
  assert.ok(Math.abs(r.total - 1000) < 2);
  assert.ok(Math.abs(r.lat - p.lat) < 1e-6);
});

test("projetarNaLinha: prefere o trecho anterior quando um posterior passa quase no mesmo lugar", () => {
  // vai 1 km para leste e volta pela mesma rua 30 m ao norte (retorno)
  const n30 = (q) => ({ lat: q.lat + 30 / 111320, lon: q.lon });
  const ida = [[p.lon, p.lat], [leste(1000).lon, leste(1000).lat]];
  const volta = [[n30(leste(1000)).lon, n30(leste(1000)).lat], [n30(p).lon, n30(p).lat]];
  const r = projetarNaLinha(leste(100), ida.concat(volta));
  assert.equal(r.indice, 0);
});

test("projetarNaLinha: sem linha → null", () => {
  assert.equal(projetarNaLinha(p, null), null);
  assert.equal(projetarNaLinha(p, [[p.lon, p.lat]]), null);
});

test("carroNaRota: encaixa até o limite, mantém acima dele", () => {
  const meio = leste(500);
  const perto = { lat: meio.lat + 20 / 111320, lon: meio.lon }, longe = { lat: meio.lat + 60 / 111320, lon: meio.lon };
  assert.ok(Math.abs(carroNaRota(perto, linhaLeste, 30).lat - p.lat) < 1e-6);
  assert.deepEqual(carroNaRota(longe, linhaLeste, 30), longe);
  assert.deepEqual(carroNaRota(perto, null, 30), perto);
});

test("etaEstavel: pequenas variações passam, salto só com confirmação", () => {
  const e = (m) => ({ minutos: m });
  assert.deepEqual(etaEstavel(null, null, e(40)), { mostrar: e(40), pendente: null });
  assert.deepEqual(etaEstavel(e(40), null, e(38)), { mostrar: e(38), pendente: null });
  const salto = etaEstavel(e(40), null, e(58));
  assert.deepEqual(salto, { mostrar: e(40), pendente: e(58) });
  assert.deepEqual(etaEstavel(e(40), e(58), e(57)), { mostrar: e(57), pendente: null });
  assert.deepEqual(etaEstavel(e(40), e(58), e(41)), { mostrar: e(41), pendente: null });
  assert.deepEqual(etaEstavel(e(40), null, null), { mostrar: null, pendente: null });
});

test("funções embutidas na página são ES5 (sem arrow, template, spread, const/let)", () => {
  for (const fn of [projetarNaLinha, carroNaRota, etaEstavel]) {
    const s = String(fn);
    assert.doesNotMatch(s, /=>|`|\.\.\.|\b(const|let)\s/, fn.name);
    // Função interna vira __name(...) no bundle do wrangler e quebra no navegador.
    assert.equal((s.match(/\bfunction\b/g) || []).length, 1, fn.name + " sem função interna");
  }
});
