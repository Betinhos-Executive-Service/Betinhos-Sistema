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
