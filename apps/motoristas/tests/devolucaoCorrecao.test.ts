import assert from "node:assert/strict";
import test from "node:test";
import {
  ANEXO_COMPLETO,
  buildCamposEditados,
  buildCancelamentoPayload,
  buildDevolucaoPayload,
  camposAlterados,
  cancelarEmDobro,
  edicaoInicial,
  enviarDevolucao,
  validarEdicao,
  validarEnvio,
  type DependenciasEnvio
} from "../src/features/despesas/devolucao.ts";
import { DEFAULT_EXPENSE_REFERENCE_DATA as REF } from "../src/features/despesas/expenses.defaults.ts";
import { STATUS_DESPESA, type DespesaRelatorio } from "../src/features/despesas/gastosRelatorio.ts";

const VEICULO = "00000000-0000-4000-8000-0000000000bb";
const NOMES = { motorista: "cr40f_motorista", categoria: "cr40f_categoria", formaPagamento: "cr40f_formapagamento", cidade: "cr40f_cidade", veiculo: "cr40f_veiculo" };
const despesa = (parcial: Partial<DespesaRelatorio> = {}): DespesaRelatorio => ({
  id: "d1", valor: 298.1, data: "2026-11-10", categoria: "Abastecimento", formaPagamentoId: "local-cartao-credito", status: STATUS_DESPESA.precisaCorrigir,
  statusAnexo: 100000002, litros: 48.5, km: 49200, veiculoId: VEICULO, estabelecimento: "Posto", conciliadaCartao: false,
  motivoDevolucao: "O km não confere.", iaMotivos: "", justificativa: "", aguardandoGestor: false, ...parcial
});
const inicial = edicaoInicial(despesa(), REF);
const id = (nome: string) => REF.categories.find((c) => c.name === nome)!.id;

test("edição inicial reflete o lançamento atual", () => {
  assert.deepEqual(inicial, { categoriaId: "local-abastecimento", veiculoId: VEICULO, kmInformado: "49200", litros: "48,5", dataGasto: "2026-11-10", formaPagamentoId: "local-cartao-credito" });
  assert.deepEqual(camposAlterados(inicial, inicial, REF), []);
});

test("payload só leva os campos alterados, com os mesmos nomes do lançamento, e nunca o valor", () => {
  const atual = { ...inicial, kmInformado: "49 300", litros: "50,25", dataGasto: "2026-11-09", formaPagamentoId: "local-dinheiro-corporativo" };
  const campos = buildCamposEditados(inicial, atual, REF, NOMES);
  assert.deepEqual(Object.keys(campos).sort(), ["cr40f_datagasto", "cr40f_kminformado", "cr40f_litros", "cr40f_formapagamento@odata.bind"].sort());
  assert.equal(campos.cr40f_kminformado, 49300);
  assert.equal(campos.cr40f_litros, 50.25);
  assert.equal(campos.cr40f_datagasto, "2026-11-09T12:00:00.000Z");
  const payload = buildDevolucaoPayload("", campos);
  assert.equal("cr40f_valor" in payload, false);
  assert.equal(payload.cr40f_statusoperacional, STATUS_DESPESA.enviado);
  assert.equal(payload.cr40f_statusanexo, ANEXO_COMPLETO);
  assert.equal("new_justificativamotorista" in payload, false);
});

test("trocar a categoria envia o lookup e limpa km e litros que ela não pede", () => {
  const atual = { ...inicial, categoriaId: id("Almoço"), kmInformado: "1", litros: "1", veiculoId: "" };
  const campos = buildCamposEditados(inicial, atual, REF, NOMES);
  assert.deepEqual(Object.keys(campos), ["cr40f_categoria@odata.bind", "cr40f_kminformado", "cr40f_litros"]);
  assert.equal(campos.cr40f_kminformado, null);
  assert.equal(campos.cr40f_litros, null);
  assert.match(String(campos["cr40f_categoria@odata.bind"]), /\(local-almoco\)$/);
});

test("veículo novo vira lookup; sem navigation property recusa", () => {
  const atual = { ...inicial, veiculoId: "00000000-0000-4000-8000-0000000000cc" };
  assert.match(String(buildCamposEditados(inicial, atual, REF, NOMES)["cr40f_veiculo@odata.bind"]), /\(00000000-0000-4000-8000-0000000000cc\)$/);
  assert.throws(() => buildCamposEditados(inicial, atual, REF, { ...NOMES, veiculo: undefined }), /veiculo/);
});

test("validação: só confere o que foi mexido; categoria nova confere tudo o que ela pede", () => {
  assert.deepEqual(validarEdicao(inicial, { ...inicial, dataGasto: "2026-11-09" }, REF), {});
  assert.equal(validarEdicao(inicial, { ...inicial, kmInformado: "" }, REF).kmInformado, "Informe o KM.");
  assert.equal(validarEdicao(inicial, { ...inicial, litros: "0" }, REF).litros, "Informe os litros.");
  assert.equal(validarEdicao(inicial, { ...inicial, dataGasto: "" }, REF).dataGasto, "Informe a data do gasto.");
  const dia = edicaoInicial(despesa({ categoria: "Almoço", km: null, litros: null, veiculoId: "" }), REF);
  const paraAbastecimento = validarEdicao(dia, { ...dia, categoriaId: id("Abastecimento") }, REF);
  assert.deepEqual(Object.keys(paraAbastecimento).sort(), ["kmInformado", "litros", "veiculoId"]);
});

test("explicação só é obrigatória sem foto nova e sem campo alterado", () => {
  assert.equal(validarEnvio({ explicacao: "", temFoto: false }).pode, false);
  assert.equal(validarEnvio({ explicacao: "", temFoto: false, temAlteracao: true }).pode, true);
  assert.equal(validarEnvio({ explicacao: "", temFoto: true }).pode, true);
  assert.equal(validarEnvio({ explicacao: "curta", temFoto: false, temAlteracao: true }).pode, false);
  assert.equal(validarEnvio({ explicacao: "Corrigi o km do painel.", temFoto: false, temAlteracao: true }).pode, true);
});

test("envio: nomes dos lookups, foto e um único PATCH com campos, explicação, Enviado e anexo Completo", async () => {
  const chamadas: string[] = [];
  const patches: Record<string, unknown>[] = [];
  const deps: DependenciasEnvio = {
    carregarNomesLookup: async (incluiVeiculo) => { chamadas.push(`nomes:${incluiVeiculo}`); return NOMES; },
    subirComprovante: async () => { chamadas.push("foto"); },
    atualizarDespesa: async (payload) => { chamadas.push("patch"); patches.push(payload); }
  };
  const atual = { ...inicial, categoriaId: id("Lavagem"), kmInformado: "49300" };
  await enviarDevolucao({ explicacao: " Era lavagem. ", foto: { dataUrl: "data:image/png;base64,AA==", fileName: "a.png" }, progresso: { anexado: false }, edicao: { inicial, atual, referenceData: REF } }, deps);
  assert.deepEqual(chamadas, ["nomes:false", "foto", "patch"]);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].new_justificativamotorista, "Era lavagem.");
  assert.equal("cr40f_valor" in patches[0], false);
  assert.equal(patches[0].cr40f_kminformado, null);
  assert.ok("cr40f_categoria@odata.bind" in patches[0]);
});

test("envio sem campos alterados não consulta lookups e mantém o payload de antes", async () => {
  const patches: Record<string, unknown>[] = [];
  const deps: DependenciasEnvio = { subirComprovante: async () => {}, atualizarDespesa: async (p) => { patches.push(p); } };
  await enviarDevolucao({ explicacao: "", foto: null, progresso: { anexado: false }, edicao: { inicial, atual: inicial, referenceData: REF } }, deps);
  assert.deepEqual(patches, [{ cr40f_statusoperacional: STATUS_DESPESA.enviado, cr40f_statusanexo: ANEXO_COMPLETO }]);
});

test("cancelamento 'lancei em dobro': só o status Cancelado, sem anexo Completo, explicação nem valor", async () => {
  assert.deepEqual(buildCancelamentoPayload(), { cr40f_statusoperacional: 100000004 });
  const patches: Record<string, unknown>[] = [];
  await cancelarEmDobro({ atualizarDespesa: async (p) => { patches.push(p); } });
  assert.deepEqual(patches, [{ cr40f_statusoperacional: STATUS_DESPESA.cancelado }]);
});
