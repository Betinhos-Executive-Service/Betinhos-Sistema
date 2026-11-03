import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EXPENSE_REFERENCE_DATA } from "../src/lib/expenses.defaults.ts";
import {
  findExpenseCategoryByName,
  findExpensePaymentMethodByName,
  getExpenseCategoryRules,
  matchesExpenseCitySearch,
  mapMaintenancePaymentToExpensePaymentNames,
  normalizeExpenseFields,
  parseCurrencyInput,
  parseDecimalInput,
  parseIntegerInput,
  shouldUploadMaintenanceExpenseInvoices,
  validateExpenseDraft
} from "../src/lib/expenses.reference.ts";
import type { ExpenseCityOption, ExpenseDraft, ExpensePhoto, ExpenseReferenceData } from "../src/lib/expenses.types.ts";

const city: ExpenseCityOption = { id: "c1", name: "São José dos Campos - SP", order: 1, uf: "SP", pais: "Brasil", codigoIbge: "3549904" };
const reference: ExpenseReferenceData = { ...DEFAULT_EXPENSE_REFERENCE_DATA, cities: [city] };
const photo = { id: "p1" } as unknown as ExpensePhoto;

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    categoriaId: "local-almoco",
    formaPagamentoId: "local-cartao-credito",
    cidadeId: "c1",
    valor: "R$ 45,90",
    dataGasto: "2026-03-05",
    estabelecimento: "  Restaurante X ",
    descricao: " ",
    kmInformado: "",
    litros: "",
    veiculoId: "",
    ...overrides
  } as ExpenseDraft;
}

test("parseCurrencyInput: vazio, só R$, milhar, vírgula decimal e lixo", () => {
  assert.equal(parseCurrencyInput(""), 0);
  assert.equal(parseCurrencyInput("R$"), 0);
  assert.equal(parseCurrencyInput("  R$ 1 234,5 "), 1234.5);
  assert.ok(Number.isNaN(parseCurrencyInput("abc")));
  assert.equal(parseCurrencyInput(undefined as unknown as string), 0);
});

test("parseIntegerInput remove tudo que não é dígito", () => {
  assert.equal(parseIntegerInput("12.345 km"), 12345);
  assert.equal(parseIntegerInput(""), 0);
  assert.equal(parseIntegerInput("sem número"), 0);
  assert.equal(parseIntegerInput(null as unknown as string), 0);
});

test("parseDecimalInput trata ponto como milhar e vírgula como decimal", () => {
  assert.equal(parseDecimalInput("45,5"), 45.5);
  assert.equal(parseDecimalInput("1.045,75 L"), 1045.75);
  assert.equal(parseDecimalInput(""), 0);
  assert.equal(parseDecimalInput("abc"), 0);
});

test("regras de categoria: sem categoria nada é exigido; Abastecimento exige veículo, KM e litros", () => {
  assert.deepEqual(getExpenseCategoryRules(null), { exigeVeiculo: false, exigeReserva: false, exigeKm: false, exigeLitros: false });
  const abastecimento = findExpenseCategoryByName(reference, ["abastecimento"]);
  assert.deepEqual(getExpenseCategoryRules(abastecimento), { exigeVeiculo: true, exigeReserva: false, exigeKm: true, exigeLitros: true });
});

test("regra de contingência por nome vale quando a categoria remota não traz os flags", () => {
  const lavagemRemota = { id: "r1", name: "LAVAGEM", order: 1, exigeVeiculo: false, exigeReserva: false, exigeKm: false, exigeLitros: false };
  assert.equal(getExpenseCategoryRules(lavagemRemota).exigeVeiculo, true);
  const outra = { ...lavagemRemota, name: "Pedágio" };
  assert.equal(getExpenseCategoryRules(outra).exigeVeiculo, false);
});

test("busca de categoria e pagamento por nome ignora acento e caixa", () => {
  assert.equal(findExpenseCategoryByName(reference, ["ALMOCO"])?.id, "local-almoco");
  assert.equal(findExpenseCategoryByName(reference, ["inexistente"]), null);
  assert.equal(findExpensePaymentMethodByName(reference, ["cartao de credito"])?.id, "local-cartao-credito");
  assert.equal(findExpensePaymentMethodByName(reference, []), null);
});

test("mapeamento de pagamento de manutenção: pedido, pix e padrão cartão", () => {
  assert.deepEqual(mapMaintenancePaymentToExpensePaymentNames("Pedido de compra"), ["Faturado (Plano mensal)", "Faturado"]);
  assert.deepEqual(mapMaintenancePaymentToExpensePaymentNames("PIX"), ["Particular (Reembolso)", "Particular"]);
  assert.deepEqual(mapMaintenancePaymentToExpensePaymentNames(""), ["Cartao de credito", "Cartão de crédito"]);
});

test("anexos da manutenção só deixam de subir quando o status é 'falhou' (100000002)", () => {
  assert.equal(shouldUploadMaintenanceExpenseInvoices(100000002), false);
  assert.equal(shouldUploadMaintenanceExpenseInvoices("100000002"), false);
  assert.equal(shouldUploadMaintenanceExpenseInvoices(100000001), true);
  assert.equal(shouldUploadMaintenanceExpenseInvoices(undefined), true);
});

test("busca de cidade: texto, UF, IBGE, sigla; vazio e sem relação não casam", () => {
  assert.equal(matchesExpenseCitySearch(city, "jose"), true);
  assert.equal(matchesExpenseCitySearch(city, "SP"), true);
  assert.equal(matchesExpenseCitySearch(city, "3549904"), true);
  assert.equal(matchesExpenseCitySearch(city, "sjc"), true);
  assert.equal(matchesExpenseCitySearch(city, "   "), false);
  assert.equal(matchesExpenseCitySearch(city, "curitiba"), false);
});

test("validação: rascunho completo não tem erros e valor negativo ou inválido é recusado", () => {
  assert.deepEqual(validateExpenseDraft(draft(), [photo], reference), {});
  assert.ok(validateExpenseDraft(draft({ valor: "-5" }), [photo], reference).valor);
  assert.ok(validateExpenseDraft(draft({ valor: "0,00" }), [photo], reference).valor);
  assert.ok(validateExpenseDraft(draft({ valor: "abc" }), [photo], reference).valor);
  assert.ok(validateExpenseDraft(draft({ dataGasto: "" }), [photo], reference).dataGasto);
  assert.ok(validateExpenseDraft(draft({ veiculoId: "  ", categoriaId: "local-lavagem" }), [photo], reference).veiculoId);
});

test("normalizeExpenseFields apara textos, zera opcionais vazios e só mantém KM/litros quando a categoria pede", () => {
  const fields = normalizeExpenseFields(draft(), [photo], reference);
  assert.equal(fields.valor, 45.9);
  assert.equal(fields.estabelecimento, "Restaurante X");
  assert.equal(fields.descricao, undefined);
  assert.equal(fields.kmInformado, undefined);
  assert.equal(fields.veiculoId, undefined);

  const comKm = normalizeExpenseFields(draft({ categoriaId: "local-almoco", kmInformado: "999", litros: "10,5" }), [photo], reference);
  assert.equal(comKm.kmInformado, undefined);
  assert.equal(comKm.litros, undefined);

  const abastecimento = normalizeExpenseFields(draft({ categoriaId: "local-abastecimento", veiculoId: " v1 ", kmInformado: "12.345", litros: "40,25" }), [photo], reference);
  assert.equal(abastecimento.kmInformado, 12345);
  assert.equal(abastecimento.litros, 40.25);
  assert.equal(abastecimento.veiculoId, "v1");
});

test("normalizeExpenseFields lança erro com as mensagens de validação quando algo falta", () => {
  assert.throws(() => normalizeExpenseFields(draft({ valor: "" }), [], reference), /valor maior que zero.*foto/s);
});
