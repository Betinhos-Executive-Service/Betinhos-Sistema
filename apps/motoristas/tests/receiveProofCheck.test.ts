import assert from "node:assert/strict";
import test from "node:test";
import { getReceiveSummaryState, proofsCoverBalance, quickReadValueCents } from "../src/features/recebimento/receiveProofCheck.ts";

const lido = (valor: number | null) => ({
  kind: "lido" as const,
  leitura: { legivel: true, valor, data: null, hora: null, estabelecimento: null, cnpj: null, litros: null, categoria_sugerida: null, forma_pagamento_sugerida: null, motivo_ilegivel: null }
});

test("estado do quadro: sem valor, a receber, parcial e quitado", () => {
  assert.equal(getReceiveSummaryState(0, 0), "semValor");
  assert.equal(getReceiveSummaryState(18000, 0), "aReceber");
  assert.equal(getReceiveSummaryState(18000, 10000), "parcial");
  assert.equal(getReceiveSummaryState(18000, 18000), "quitado");
});

test("valor lido vira centavos; ilegível, falha e valor vazio não contam", () => {
  assert.equal(quickReadValueCents(lido(80)), 8000);
  assert.equal(quickReadValueCents(lido(51.9)), 5190);
  assert.equal(quickReadValueCents(lido(null)), null);
  assert.equal(quickReadValueCents(lido(0)), null);
  assert.equal(quickReadValueCents({ kind: "ilegivel" }), null);
  assert.equal(quickReadValueCents({ kind: "falha" }), null);
});

test("comprovantes cobrem o que falta pela soma das leituras", () => {
  assert.equal(proofsCoverBalance([8000], 8000), true);
  assert.equal(proofsCoverBalance([5000, 3000], 8000), true);
  assert.equal(proofsCoverBalance([5190], 8000), false);
  assert.equal(proofsCoverBalance([null], 8000), false);
  assert.equal(proofsCoverBalance([], 8000), false);
  assert.equal(proofsCoverBalance([], 0), true);
});
