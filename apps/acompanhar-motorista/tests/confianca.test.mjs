import assert from "node:assert/strict";
import test from "node:test";
import { avaliarTrajeto, trajetoConfiavel, SALTO_MAX_M } from "../src/confianca.mjs";

const gru = { lat: -23.4356, lon: -46.4731 }, paulista = { lat: -23.5614, lon: -46.6559 }, manaus = { lat: -3.119, lon: -60.0217 };

test("todas geocodificadas, perto e Haiku alta → confiável", () => assert.equal(trajetoConfiavel([gru, paulista], "alta"), true));
test("Haiku não rodou mas geocode achou tudo → confiável", () => assert.equal(trajetoConfiavel([gru, paulista], null), true));
test("Haiku baixa com tudo geocodificado → completo", () => assert.equal(trajetoConfiavel([gru, paulista], "baixa"), true));
test("Haiku baixa com etapa sem geocode → simples", () => assert.equal(trajetoConfiavel([gru, null], "baixa"), false));
test("caso real: Golden Tulip (São José dos Campos) → Aerop. Guarulhos, 65 km, Haiku baixa → completo", () => {
  const golden = { lat: -23.2237, lon: -45.9009 }, guarulhos = { lat: -23.4356, lon: -46.4731 };
  assert.equal(trajetoConfiavel([golden, guarulhos], "baixa"), true);
});
test("etapa sem geocode → simples", () => assert.equal(trajetoConfiavel([gru, null, paulista], "alta"), false));
test("salto acima de 600 km → simples", () => { assert.equal(SALTO_MAX_M, 600000); assert.equal(trajetoConfiavel([gru, manaus], "alta"), false); });
test("menos de duas etapas → simples", () => assert.equal(trajetoConfiavel([gru], "alta"), false));
test("salto entre 150 e 600 km (Pindamonhangaba → Curitiba, ~480 km) continua completo", () => {
  const pinda = { lat: -22.941, lon: -45.411 }, curitiba = { lat: -25.43, lon: -49.27 };
  assert.ok(avaliarTrajeto([pinda, curitiba]).modo === "completo");
});
test("motivo do modo simples: etapa sem endereço e salto", () => {
  assert.deepEqual(avaliarTrajeto([gru, null], ["Aeroporto de Guarulhos", "Destino"]), { modo: "simples", motivo: "etapa sem endereço: Destino" });
  assert.match(avaliarTrajeto([gru, manaus]).motivo, /^salto de \d+ km$/);
});
