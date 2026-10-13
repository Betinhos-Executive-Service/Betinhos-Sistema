import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInfleetServiceVehiclePatch,
  formatUsageDuration,
  parseInfleetVehicleResolution,
  selectableCandidates,
  SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN,
  SERVICE_VEHICLE_ORIGIN_INFLEET
} from "../src/lib/serviceVehicleInfleet.ts";

const RTI = "11111111-1111-1111-1111-111111111111";
const GEZ = "22222222-2222-2222-2222-222222222222";
const bind = (id: string) => `/cr40f_veiculos(${id})`;

const automaticJson = JSON.stringify({
  decisao: "automatico",
  motivo: "acima-do-limite",
  regra: "ignicao-85-v1",
  janela: { inicio: "2026-10-12T15:00:00Z", fim: "2026-10-12T22:30:00Z" },
  totalSegundos: 7200,
  candidatos: [{ veiculoId: RTI, placa: "RTI7G00", segundos: 7200, percentual: 100, cadastrado: true }],
  escolhido: { veiculoId: RTI, placa: "RTI7G00", segundos: 7200, percentual: 100, cadastrado: true },
  veiculoPosseId: GEZ
});

const askJson = JSON.stringify({
  decisao: "perguntar",
  motivo: "abaixo-do-limite",
  totalSegundos: 10000,
  candidatos: [
    { veiculoId: GEZ, placa: "GEZ6D67", segundos: 6000, percentual: 60, cadastrado: true },
    { veiculoId: RTI, placa: "RTI7G00", segundos: 3000, percentual: 30, cadastrado: true },
    { veiculoId: null, placa: "ABC1D23", segundos: 1000, percentual: 10, cadastrado: false }
  ]
});

test("decisão automática grava carro, origem Infleet, percentual e evidência", () => {
  const resolution = parseInfleetVehicleResolution(automaticJson);
  const patch = buildInfleetServiceVehiclePatch(resolution, null, bind);

  assert.equal(patch["cr40f_Veiculo@odata.bind"], bind(RTI));
  assert.equal(patch.new_origemveiculo, SERVICE_VEHICLE_ORIGIN_INFLEET);
  assert.equal(patch.new_percentualveiculoinfleet, 100);
  const evidence = JSON.parse(String(patch.new_evidenciaveiculoinfleet));
  assert.equal(evidence.decisao, "automatico");
  assert.equal(evidence.veiculoPosseId, GEZ);
});

test("escolha do motorista grava origem própria e percentual do candidato", () => {
  const resolution = parseInfleetVehicleResolution(askJson);
  const patch = buildInfleetServiceVehiclePatch(resolution, { veiculoId: RTI, placa: "RTI7G00", origem: "candidato" }, bind);

  assert.equal(patch["cr40f_Veiculo@odata.bind"], bind(RTI));
  assert.equal(patch.new_origemveiculo, SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN);
  assert.equal(patch.new_percentualveiculoinfleet, 30);
  assert.equal(JSON.parse(String(patch.new_evidenciaveiculoinfleet)).escolhaMotorista.origem, "candidato");
});

test("carro fora dos candidatos grava percentual zero", () => {
  const resolution = parseInfleetVehicleResolution(askJson);
  const other = "33333333-3333-3333-3333-333333333333";
  const patch = buildInfleetServiceVehiclePatch(resolution, { veiculoId: other, placa: "XYZ", origem: "outro" }, bind);

  assert.equal(patch["cr40f_Veiculo@odata.bind"], bind(other));
  assert.equal(patch.new_percentualveiculoinfleet, 0);
});

test("indisponível só grava evidência e não mexe no carro", () => {
  const resolution = parseInfleetVehicleResolution(JSON.stringify({ decisao: "indisponivel", motivo: "infleet-indisponivel", candidatos: [] }));
  const patch = buildInfleetServiceVehiclePatch(resolution, null, bind);

  assert.deepEqual(Object.keys(patch), ["new_evidenciaveiculoinfleet"]);
});

test("resposta inválida vira indisponível", () => {
  assert.equal(parseInfleetVehicleResolution("{oops").decisao, "indisponivel");
  assert.equal(parseInfleetVehicleResolution({ decisao: "talvez" }).decisao, "indisponivel");
  assert.equal(parseInfleetVehicleResolution({ decisao: "automatico", candidatos: [] }).decisao, "indisponivel");
});

test("motorista só escolhe entre carros cadastrados", () => {
  const options = selectableCandidates(parseInfleetVehicleResolution(askJson));
  assert.deepEqual(options.map((item) => item.placa), ["GEZ6D67", "RTI7G00"]);
});

test("duração em minutos e horas", () => {
  assert.equal(formatUsageDuration(1500), "25 min");
  assert.equal(formatUsageDuration(7200), "2 h");
  assert.equal(formatUsageDuration(8100), "2 h 15 min");
});
