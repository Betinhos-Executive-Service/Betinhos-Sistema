import assert from "node:assert/strict";
import test from "node:test";
import { linhaPercorrida } from "../src/percorrido.mjs";

const p = (lat, lon, min) => ({ lat, lon, fixTime: new Date(Date.UTC(2026, 10, 3, 12, min)).toISOString() });

test("ordena por tempo, termina na posição atual e devolve [lon, lat]", () => {
  const l = linhaPercorrida([p(-23.52, -46.6, 2), p(-23.51, -46.6, 1)], { lat: -23.53, lon: -46.6 });
  assert.deepEqual(l, [[-46.6, -23.51], [-46.6, -23.52], [-46.6, -23.53]]);
});

test("pulo impossível (60 km em 1 min) reinicia a linha no trecho recente", () => {
  const l = linhaPercorrida([p(-23.0, -46.0, 1), p(-23.5, -46.6, 2), p(-23.501, -46.6, 3)]);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], [-46.6, -23.5]);
});

test("sem pontos suficientes ou inválidos → null", () => {
  assert.equal(linhaPercorrida([]), null);
  assert.equal(linhaPercorrida(null, { lat: 1, lon: 1 }), null);
  assert.equal(linhaPercorrida([{ lat: null, lon: 1 }]), null);
});

test("reduz para no máximo ~300 pontos mantendo o último", () => {
  const muitos = Array.from({ length: 1000 }, (_, i) => p(-23.5 + i * 0.00001, -46.6, i));
  const l = linhaPercorrida(muitos);
  assert.ok(l.length <= 301);
  assert.deepEqual(l.at(-1), [-46.6, -23.5 + 999 * 0.00001]);
});

test("pontos espaçados em ritmo de estrada (50 km em 30 min) continuam na mesma linha", () => {
  assert.equal(linhaPercorrida([p(-23.0, -46.0, 0), p(-23.45, -46.0, 30)]).length, 2);
  assert.equal(linhaPercorrida([p(-23.0, -46.0, 0), p(-23.45, -46.0, 30), p(-23.46, -46.0, 31)]).length, 3);
});

test("com saída: a linha nasce no endereço de saída e descarta o deslocamento anterior", () => {
  const saida = { lat: -23.2325, lon: -45.852 };
  const antes = [p(-23.30, -45.95, 1), p(-23.27, -45.90, 2)]; // vindo até o embarque
  const noLocal = [p(-23.2326, -45.8521, 3), p(-23.2330, -45.8525, 4)];
  const viagem = [p(-23.24, -45.87, 5)];
  const l = linhaPercorrida([...antes, ...noLocal, ...viagem], { lat: -23.22, lon: -45.91 }, { saida });
  assert.deepEqual(l[0], [-45.852, -23.2325]);
  assert.ok(l.every(([lon]) => lon !== -45.95 && lon !== -45.9), "nada de antes da saída");
  assert.deepEqual(l.at(-1), [-45.91, -23.22]);
});

test("com saída: carro que ainda não chegou ao embarque → sem linha", () => {
  const saida = { lat: -23.2325, lon: -45.852 };
  assert.equal(linhaPercorrida([p(-23.30, -45.95, 1), p(-23.27, -45.90, 2)], { lat: -23.26, lon: -45.89 }, { saida }), null);
});

test("com `ate`: pontos depois da chegada ficam de fora e a linha fecha no destino", () => {
  const saida = { lat: -23.2325, lon: -45.852 };
  const destino = { lat: -23.22, lon: -45.91, fixTime: p(0, 0, 10).fixTime };
  const pts = [p(-23.2326, -45.8521, 1), p(-23.24, -45.87, 5), p(-23.22, -45.91, 10), p(-23.10, -45.70, 20)]; // o último é a volta
  const l = linhaPercorrida(pts, destino, { saida, ate: Date.parse(destino.fixTime) });
  assert.deepEqual(l[0], [-45.852, -23.2325]);
  assert.deepEqual(l.at(-1), [-45.91, -23.22]);
  assert.ok(!l.some(([lon]) => lon === -45.70), "sem a volta");
});
