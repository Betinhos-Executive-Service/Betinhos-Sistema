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

import { INITIAL_QUICK_READ, nextQuickReadState, shouldRunQuickRead } from "../src/lib/receiptQuickRead.ts";

test("terceira foto ilegível libera manual e para de ler", () => {
  let s = nextQuickReadState(INITIAL_QUICK_READ, { kind: "ilegivel" });
  assert.deepEqual(s, { status: "ilegivel", tentativas: 1 });
  s = nextQuickReadState(s, { kind: "ilegivel" });
  s = nextQuickReadState(s, { kind: "ilegivel" });
  assert.deepEqual(s, { status: "manual", tentativas: 3 });
  assert.equal(shouldRunQuickRead(s), false);
});
test("falha vai para manual sem contar tentativa; lido encerra", () => {
  assert.deepEqual(nextQuickReadState(INITIAL_QUICK_READ, { kind: "falha" }), { status: "manual", tentativas: 0 });
  assert.deepEqual(nextQuickReadState(INITIAL_QUICK_READ, { kind: "lido", leitura }), { status: "preenchido", tentativas: 1 });
});
test("shouldRunQuickRead só em idle ou ilegivel", () => {
  assert.equal(shouldRunQuickRead(INITIAL_QUICK_READ), true);
  assert.equal(shouldRunQuickRead({ status: "ilegivel", tentativas: 2 }), true);
  assert.equal(shouldRunQuickRead({ status: "preenchido", tentativas: 1 }), false);
});

import { quickReadTargetSize } from "../src/lib/receiptQuickRead.ts";

test("quickReadTargetSize limita o maior lado a 1600 mantendo proporção", () => {
  assert.deepEqual(quickReadTargetSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(quickReadTargetSize(800, 600), { width: 800, height: 600 });
});
