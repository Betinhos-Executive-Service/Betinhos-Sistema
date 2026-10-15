import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickReadResponse } from "../src/lib/receiptQuickRead.ts";

const leitura = { legivel: true, valor: 85.4, data: "2026-10-12", hora: "14:32", estabelecimento: "Posto X", cnpj: null, litros: 32.5, categoria_sugerida: "Abastecimento", forma_pagamento_sugerida: null, motivo_ilegivel: null };

test("parseQuickReadResponse aceita ok:true com leitura legível", () => {
  assert.deepEqual(parseQuickReadResponse({ ok: true, leitura }), { kind: "lido", leitura });
});
test("parseQuickReadResponse trata legivel=false como ilegível", () => {
  assert.equal(parseQuickReadResponse({ ok: true, leitura: { ...leitura, legivel: false } }).kind, "ilegivel");
});
test("parseQuickReadResponse trata ok:false e corpo inválido como falha", () => {
  assert.equal(parseQuickReadResponse({ ok: false, erro: "x" }).kind, "falha");
  assert.equal(parseQuickReadResponse("texto").kind, "falha");
  assert.equal(parseQuickReadResponse({ ok: true, leitura: { legivel: "sim" } }).kind, "falha");
});

import { applyQuickReadToDraft } from "../src/lib/receiptQuickRead.ts";
import { DEFAULT_EXPENSE_REFERENCE_DATA, type ExpenseDraft } from "../src/lib/expenses.ts";

const vazio: ExpenseDraft = { categoriaId: "", veiculoId: "", valor: "", dataGasto: "", formaPagamentoId: "", cidadeId: "", estabelecimento: "", descricao: "", kmInformado: "", litros: "" };

test("applyQuickReadToDraft preenche só campos vazios e casa categoria e pagamento por nome", () => {
  const draft = applyQuickReadToDraft({ ...vazio, valor: "90,00" }, { ...leitura, forma_pagamento_sugerida: "TicketLog" }, DEFAULT_EXPENSE_REFERENCE_DATA);
  assert.equal(draft.valor, "90,00");
  assert.equal(draft.dataGasto, "2026-10-12");
  assert.equal(draft.estabelecimento, "Posto X");
  assert.equal(draft.categoriaId, "local-abastecimento");
  assert.equal(draft.formaPagamentoId, "local-ticketlog");
  assert.equal(draft.litros, "32,5");
});
test("applyQuickReadToDraft formata valor em pt-BR e ignora litros quando a categoria não exige", () => {
  const draft = applyQuickReadToDraft(vazio, { ...leitura, categoria_sugerida: "Pedágio", valor: 12.3 }, DEFAULT_EXPENSE_REFERENCE_DATA);
  assert.equal(draft.valor, "12,30");
  assert.equal(draft.litros, "");
});
test("applyQuickReadToDraft ignora sugestão fora da lista", () => {
  assert.equal(applyQuickReadToDraft(vazio, { ...leitura, categoria_sugerida: "Bebida" }, DEFAULT_EXPENSE_REFERENCE_DATA).categoriaId, "");
});
