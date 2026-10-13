import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInfleetServiceVehiclePatch,
  describeVehicle,
  needsDriverChoice,
  needsFleetChoice,
  parseInfleetVehicleResolution,
  selectableCandidates,
  thirdPartyResolution,
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
  candidatos: [{ veiculoId: RTI, placa: "RTI7G00", modelo: "Corolla", cor: "Prata", segundos: 7200, percentual: 100, cadastrado: true }],
  escolhido: { veiculoId: RTI, placa: "RTI7G00", modelo: "Corolla", cor: "Prata", segundos: 7200, percentual: 100, cadastrado: true }
});

const askJson = JSON.stringify({
  decisao: "perguntar",
  motivo: "abaixo-do-limite",
  totalSegundos: 10000,
  candidatos: [
    { veiculoId: GEZ, placa: "GEZ6D67", modelo: "Corolla", cor: "Preto", segundos: 6000, percentual: 60, cadastrado: true },
    { veiculoId: RTI, placa: "RTI7G00", modelo: "Corolla", cor: "Prata", segundos: 3000, percentual: 30, cadastrado: true },
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
  assert.equal(needsDriverChoice(resolution), false);
});

test("escolha do motorista grava origem própria e percentual do candidato", () => {
  const resolution = parseInfleetVehicleResolution(askJson);
  const patch = buildInfleetServiceVehiclePatch(resolution, { veiculoId: RTI, placa: "RTI7G00", origem: "candidato" }, bind);

  assert.equal(patch["cr40f_Veiculo@odata.bind"], bind(RTI));
  assert.equal(patch.new_origemveiculo, SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN);
  assert.equal(patch.new_percentualveiculoinfleet, 30);
  assert.equal(JSON.parse(String(patch.new_evidenciaveiculoinfleet)).escolhaMotorista.veiculoId, RTI);
});

test("carro fora dos usados na janela não é gravado", () => {
  const resolution = parseInfleetVehicleResolution(askJson);
  const patch = buildInfleetServiceVehiclePatch(resolution, { veiculoId: "33333333-3333-3333-3333-333333333333", placa: "XYZ", origem: "candidato" }, bind);

  assert.equal(patch["cr40f_Veiculo@odata.bind"], undefined);
  assert.equal(patch.new_origemveiculo, undefined);
});

test("com candidatos o motorista não escolhe na frota", () => {
  const resolution = parseInfleetVehicleResolution(askJson);
  const patch = buildInfleetServiceVehiclePatch(resolution, { veiculoId: "33333333-3333-3333-3333-333333333333", placa: "XYZ", origem: "frota" }, bind);

  assert.equal(needsFleetChoice(resolution), false);
  assert.equal(patch.new_origemveiculo, undefined);
});

test("sem decisão da Infleet o motorista escolhe qualquer carro ativo", () => {
  const resolution = parseInfleetVehicleResolution(JSON.stringify({ decisao: "indisponivel", motivo: "sem-viagens-do-motorista", candidatos: [] }));
  const other = "33333333-3333-3333-3333-333333333333";
  const patch = buildInfleetServiceVehiclePatch(resolution, { veiculoId: other, placa: "FCB8B61", origem: "frota" }, bind);

  assert.equal(needsFleetChoice(resolution), true);
  assert.equal(patch["cr40f_Veiculo@odata.bind"], bind(other));
  assert.equal(patch.new_origemveiculo, SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN);
  assert.equal(patch.new_percentualveiculoinfleet, 0);
  assert.equal(JSON.parse(String(patch.new_evidenciaveiculoinfleet)).escolhaMotorista.origem, "frota");
});

test("perguntar sem carro cadastrado vira indisponível", () => {
  const resolution = parseInfleetVehicleResolution(JSON.stringify({
    decisao: "perguntar",
    motivo: "veiculo-nao-cadastrado",
    candidatos: [{ veiculoId: null, placa: "ABC1D23", segundos: 600, percentual: 100, cadastrado: false }]
  }));

  assert.equal(resolution.decisao, "indisponivel");
  assert.equal(resolution.motivo, "veiculo-nao-cadastrado");
});

test("sem escolha do motorista não grava carro", () => {
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

test("descreve o carro por modelo e cor", () => {
  assert.equal(describeVehicle({ modelo: "Corolla", cor: "Prata", placa: "RTI7G00" }), "Corolla Prata");
  assert.equal(describeVehicle({ modelo: "", cor: "", placa: "RTI7G00" }), "RTI7G00");
  assert.equal(describeVehicle({ modelo: "Compass", cor: "PRETA", placa: "FCB8B61" }), "Compass Preta");
  assert.equal(describeVehicle({ modelo: "BMW", cor: "Azul", placa: "AAA" }), "BMW Azul");
});

test("terceiro com carro atual grava sem perguntar", () => {
  const resolution = thirdPartyResolution({ id: RTI, placa: "RTI7G00", modelo: "Cruze", cor: "Prata" });
  assert.equal(needsDriverChoice(resolution), true);
  const patch = buildInfleetServiceVehiclePatch(resolution, { veiculoId: RTI, placa: "RTI7G00", origem: "terceiro" }, bind);
  assert.equal(patch["cr40f_Veiculo@odata.bind"], bind(RTI));
  assert.equal(patch.new_origemveiculo, SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN);
  assert.equal(patch.new_percentualveiculoinfleet, 0);
  assert.equal(JSON.parse(String(patch.new_evidenciaveiculoinfleet)).motivo, "motorista-terceiro");
});

test("terceiro sem carro atual escolhe na frota dele", () => {
  const resolution = thirdPartyResolution(null);
  assert.equal(needsFleetChoice(resolution), true);
});
