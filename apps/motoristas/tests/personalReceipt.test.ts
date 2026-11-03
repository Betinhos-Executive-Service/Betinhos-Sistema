import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonalReceiptDraft, buildPersonalReceiptModel } from "../src/lib/personalReceipt.ts";
import type { DetailData } from "../src/types.ts";

const nbsp = (s: string) => s.replace(/ /g, " ");

function detail(fields: Record<string, string> = {}, record?: Record<string, unknown>, id = "OP-77"): DetailData {
  return {
    type: "SERVICO",
    id,
    title: "Serviço",
    actions: [],
    fields: Object.entries(fields).map(([label, value]) => ({ label, value })) as DetailData["fields"],
    dataverse: record ? { entitySetName: "cr40f_reservadeveculoses", id, record } : undefined
  };
}

test("sem serviço o recibo nasce vazio, com valores padrão", () => {
  const model = buildPersonalReceiptModel(undefined);
  assert.equal(model.nomePagante, "");
  assert.equal(model.cliente, "");
  assert.equal(model.valorTotal, "");
  assert.equal(model.trajetos, "");
  assert.equal(model.periodo, "");
  assert.equal(model.idioma, "pt-BR");
  assert.equal(model.metodoPagamento, "Cartão de Crédito");
  assert.equal(model.observacoes, "-");
  assert.equal(model.idPag, "A definir");
  assert.match(model.idOp, /^OP-\d{8}$/);
});

test("pagante: primeiro passageiro (sem HTML nem telefone), depois solicitante, depois cliente", () => {
  const passengers = "<span>Maria Silva - (11) 90000-0004</span><br/>João - 1198";
  assert.equal(buildPersonalReceiptModel(detail({ "Passageiros e Telefones de Contato": passengers, Solicitante: "Ana", Cliente: "Acme" })).nomePagante, "Maria Silva");
  assert.equal(buildPersonalReceiptModel(detail({ Solicitante: "Ana", Cliente: "Acme" })).nomePagante, "Ana");
  assert.equal(buildPersonalReceiptModel(detail({ Cliente: "Acme" })).nomePagante, "Acme");
  assert.equal(buildPersonalReceiptModel(detail({})).nomePagante, "");
  assert.equal(buildPersonalReceiptModel(detail({ "Passageiros e Telefones de Contato": "Tom &amp; Jerry - 11" })).nomePagante, "Tom & Jerry");
});

test("valor vem do registro numérico e respeita o idioma; texto no registro é ignorado", () => {
  assert.equal(nbsp(buildPersonalReceiptModel(detail({}, { cr40f_valor: 1500.5 })).valorTotal), "R$ 1.500,50");
  assert.equal(nbsp(buildPersonalReceiptModel(detail({}, { cr40f_valor: 1500.5 }), { idioma: "en-US" }).valorTotal), "R$1,500.50");
  assert.equal(buildPersonalReceiptModel(detail({}, { cr40f_valor: "1500" })).valorTotal, "");
  assert.equal(nbsp(buildPersonalReceiptModel(detail({}, { cr40f_valor: 0 })).valorTotal), "R$ 0,00");
});

test("valor digitado pelo usuário é normalizado (vírgula, ponto, R$) ou preservado se não for número", () => {
  const total = (valorTotal: string) => nbsp(buildPersonalReceiptModel(detail(), { valorTotal }).valorTotal);
  assert.equal(total("1.234,50"), "R$ 1.234,50");
  assert.equal(total("R$ 99,9"), "R$ 99,90");
  assert.equal(total("  "), "");
  assert.equal(total("abc"), "R$ abc");
  assert.equal(total("R$abc"), "R$ abc");
});

test("trajeto junta Trajeto, saída e destino, ignorando vazios; aceita rótulo sem acento", () => {
  assert.equal(buildPersonalReceiptModel(detail({ Trajeto: "GRU > Centro", "Endereço de Saída": "Rua A, 1", Destino: "Hotel B" })).trajetos, "GRU > Centro\nRua A, 1\nHotel B");
  assert.equal(buildPersonalReceiptModel(detail({ "Endereco de Saida": "Rua A, 1" })).trajetos, "Rua A, 1");
  assert.equal(buildPersonalReceiptModel(detail({ Trajeto: "  " })).trajetos, "");
});

test("período usa data do registro formatada em pt-BR; sem registro, o campo de texto", () => {
  const withRecord = buildPersonalReceiptModel(detail({ "Data e Horário de Saída": "texto" }, { cr40f_dataehorriodesada: "2026-03-05T15:30:00" }));
  assert.match(withRecord.periodo, /^05\/03\/2026,? \d{2}:30$/);
  assert.equal(buildPersonalReceiptModel(detail({ "Data e Horário de Saída": "05/03 10h" })).periodo, "05/03 10h");
  assert.equal(buildPersonalReceiptModel(detail({ "Data e Horário de Saída": "x" }, { cr40f_dataehorriodesada: "lixo" })).periodo, "x");
});

test("identificador do pagamento e id da operação", () => {
  assert.equal(buildPersonalReceiptModel(detail(), {}, { receiptIdentifier: " PAG-9 " }).idPag, "PAG-9");
  assert.equal(buildPersonalReceiptModel(detail(), {}, { receiptIdentifier: "  " }).idPag, "A definir");
  assert.equal(buildPersonalReceiptModel(detail({}, undefined, "  ")).idOp.startsWith("OP-"), true);
  assert.equal(buildPersonalReceiptModel(detail({}, undefined, "RES-5")).idOp, "RES-5");
});

test("overrides: idioma inválido volta para pt-BR, cartão é traduzido, outro método é mantido, data de emissão não é sobrescrita", () => {
  const model = buildPersonalReceiptModel(detail(), { idioma: "fr-FR" as never, metodoPagamento: "Credit Card", dataEmissao: "01/01/2000" });
  assert.equal(model.idioma, "pt-BR");
  assert.equal(model.metodoPagamento, "Cartão de Crédito");
  assert.notEqual(model.dataEmissao, "01/01/2000");
  assert.equal(buildPersonalReceiptModel(detail(), { metodoPagamento: "Pix" }).metodoPagamento, "Pix");
  assert.equal(buildPersonalReceiptModel(detail(), { idioma: "es-ES" }).metodoPagamento, "Tarjeta de Crédito");
  assert.equal(buildPersonalReceiptModel(detail(), { observacoes: "Obs" }).observacoes, "Obs");
});

test("rascunho sem serviço: campos vazios e data de hoje em AAAA-MM-DD", () => {
  const draft = buildPersonalReceiptDraft();
  assert.equal(draft.nomePagante, "");
  assert.equal(draft.observacoes, "");
  assert.equal(draft.idioma, "pt-BR");
  assert.equal(draft.metodoPagamento, "Cartão de Crédito");
  assert.match(draft.dataEmissao, /^\d{4}-\d{2}-\d{2}$/);
});

test("rascunho com serviço: valor sem R$, observação '-' vira vazia e cliente/pagante preenchidos", () => {
  const draft = buildPersonalReceiptDraft(detail({ Cliente: "Acme", Solicitante: "Ana" }, { cr40f_valor: 2500 }));
  assert.equal(draft.valorTotal, "2.500,00");
  assert.equal(draft.cliente, "Acme");
  assert.equal(draft.nomePagante, "Ana");
  assert.equal(draft.observacoes, "");
  assert.equal(buildPersonalReceiptDraft(detail({}, {})).valorTotal, "");
});
