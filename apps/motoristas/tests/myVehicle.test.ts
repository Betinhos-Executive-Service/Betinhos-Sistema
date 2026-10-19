import assert from "node:assert/strict";
import test from "node:test";
import { buildCurrentVehiclePatch, CURRENT_VEHICLE_ORIGIN_DRIVER, isThirdPartyDriver } from "../src/lib/myVehicle.ts";

test("só terceiro vê Meu carro", () => {
  assert.equal(isThirdPartyDriver({ cr40f_tipodevinculo: 1 }), true);
  assert.equal(isThirdPartyDriver({ cr40f_tipodevinculo: "1" }), true);
  assert.equal(isThirdPartyDriver({ cr40f_tipodevinculo: 0 }), false);
  assert.equal(isThirdPartyDriver(null), false);
});

test("troca do carro grava lookup, horário e origem Motorista", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const patch = buildCurrentVehiclePatch("ABC", (id) => `/cr40f_veiculoses(${id})`, now);
  assert.deepEqual(patch, {
    "cr40f_VeiculoAtual@odata.bind": "/cr40f_veiculoses(ABC)",
    new_veiculoatualdesde: "2026-10-13T12:00:00.000Z",
    new_origemveiculoatual: CURRENT_VEHICLE_ORIGIN_DRIVER
  });
});
