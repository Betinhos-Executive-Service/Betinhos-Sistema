import assert from "node:assert/strict";
import test from "node:test";
import { atualizarChegando, RAIO_CHEGANDO_M, RAIO_SAIR_CHEGANDO_M } from "../src/etapas.mjs";

// Deslocamento em metros para o norte a partir de um ponto (1 grau de latitude ≈ 111,32 km).
const alvoBase = { lat: -23.5614, lon: -46.6559 };
const aNorte = (m) => ({ lat: alvoBase.lat + m / 111320, lon: alvoBase.lon });
const t = (s) => new Date(Date.UTC(2026, 10, 2, 12, 0, s)).toISOString();

test("entra em chegando a 1 km e não sai com a posição oscilando na borda", () => {
  const alvo = { ...alvoBase };
  assert.equal(atualizarChegando(alvo, { pos: aNorte(5000), rota: null, quando: t(0) }), false);
  assert.equal(alvo.chegandoEm, undefined);
  assert.equal(atualizarChegando(alvo, { pos: aNorte(RAIO_CHEGANDO_M - 10), rota: null, quando: t(10) }), true);
  assert.equal(alvo.chegandoEm, t(10));
  for (const m of [1050, 980, 1300, 1900, 1100]) assert.equal(atualizarChegando(alvo, { pos: aNorte(m), rota: null, quando: t(20) }), true, `${m} m`);
  assert.equal(alvo.chegandoEm, t(10), "o instante da primeira entrada é preservado");
});

test("só sai de chegando a mais de 2 km e sem ETA curto", () => {
  const alvo = { ...alvoBase, chegandoEm: t(0) };
  assert.equal(atualizarChegando(alvo, { pos: aNorte(RAIO_SAIR_CHEGANDO_M + 100), rota: { minutos: 6 }, quando: t(10) }), true, "longe mas ETA ≤ 10 min continua chegando");
  assert.equal(atualizarChegando(alvo, { pos: aNorte(RAIO_SAIR_CHEGANDO_M + 100), rota: { minutos: 12 }, quando: t(20) }), false);
  assert.equal(alvo.chegandoEm, undefined);
  assert.equal(atualizarChegando(alvo, { pos: aNorte(RAIO_SAIR_CHEGANDO_M + 100), rota: null, quando: t(30) }), false, "sem rota e longe: fora");
});

test("entra por ETA (≤ 5 min) mesmo longe, e pela área do lugar com folga de 1 km", () => {
  const porEta = { ...alvoBase };
  assert.equal(atualizarChegando(porEta, { pos: aNorte(4000), rota: { minutos: 5 }, quando: t(0) }), true);
  const area = { sul: alvoBase.lat - 0.01, norte: alvoBase.lat + 0.01, oeste: alvoBase.lon - 0.01, leste: alvoBase.lon + 0.01 };
  const porArea = { ...alvoBase, area };
  assert.equal(atualizarChegando(porArea, { pos: aNorte(1900), rota: null, quando: t(0) }), true, "a 1,9 km do centro, mas a menos de 1 km da caixa");
});

test("sem posição mantém o estado atual; sem alvo nunca é chegando", () => {
  assert.equal(atualizarChegando({ ...alvoBase, chegandoEm: t(0) }, { pos: null, rota: null, quando: t(1) }), true);
  assert.equal(atualizarChegando({ ...alvoBase }, { pos: null, rota: null, quando: t(1) }), false);
  assert.equal(atualizarChegando(null, { pos: aNorte(10), rota: null, quando: t(1) }), false);
});
