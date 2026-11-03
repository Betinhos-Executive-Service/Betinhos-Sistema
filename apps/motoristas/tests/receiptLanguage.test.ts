import assert from "node:assert/strict";
import test from "node:test";
import {
  RECEIPT_LANGUAGE,
  RECEIPT_LANGUAGE_OPTIONS,
  formatReceiptCurrencyByLanguage,
  formatReceiptDateByLanguage,
  getDefaultReceiptPaymentMethod,
  getReceiptCopy,
  getReceiptDisplayClient,
  getReceiptDisplayPaymentMethod,
  normalizeReceiptLanguage
} from "../src/lib/receiptLanguage.ts";

test("normalizeReceiptLanguage cai em português para valor ausente ou desconhecido", () => {
  assert.equal(normalizeReceiptLanguage("en-US"), "en-US");
  assert.equal(normalizeReceiptLanguage("es-ES"), "es-ES");
  for (const value of [undefined, null, "", "fr-FR", "en-us", "pt-BR"]) {
    assert.equal(normalizeReceiptLanguage(value), "pt-BR", String(value));
  }
});

test("cada idioma oferecido tem textos completos e sem campos vazios", () => {
  assert.equal(RECEIPT_LANGUAGE_OPTIONS.length, 3);
  const keys = Object.keys(getReceiptCopy("pt-BR")).sort();
  for (const { value } of RECEIPT_LANGUAGE_OPTIONS) {
    const copy = getReceiptCopy(value);
    assert.deepEqual(Object.keys(copy).sort(), keys, value);
    for (const [key, text] of Object.entries(copy)) assert.ok(String(text).trim(), `${value}.${key}`);
  }
  assert.equal(getReceiptCopy("xx"), getReceiptCopy("pt-BR"));
});

test("getReceiptDisplayClient traduz só 'Particular' e preserva o restante", () => {
  assert.equal(getReceiptDisplayClient("  ", "en-US"), "");
  assert.equal(getReceiptDisplayClient("Particular", "en-US"), "Private");
  assert.equal(getReceiptDisplayClient(" PARTICULAR ", "en-US"), "Private");
  assert.equal(getReceiptDisplayClient("particular", "pt-BR"), "Particular");
  assert.equal(getReceiptDisplayClient("particular", "es-ES"), "Particular");
  assert.equal(getReceiptDisplayClient("  Acme Ltda ", "en-US"), "Acme Ltda");
});

test("forma de pagamento cartão de crédito é traduzida em qualquer grafia conhecida", () => {
  assert.equal(getDefaultReceiptPaymentMethod("en-US"), "Credit Card");
  assert.equal(getDefaultReceiptPaymentMethod(undefined), "Cartão de Crédito");
  for (const value of ["Cartão de crédito", "CARTAO DE CREDITO", "credit card", "Tarjeta de Crédito", "  cartao  de  credito "]) {
    assert.equal(getReceiptDisplayPaymentMethod(value, "es-ES"), "Tarjeta de Crédito", value);
  }
  assert.equal(getReceiptDisplayPaymentMethod("Faturado", "en-US"), "Faturado");
  assert.equal(getReceiptDisplayPaymentMethod("   ", "en-US"), "");
});

test("formatReceiptDateByLanguage aceita ISO, dd/mm/aaaa e devolve texto inválido sem alterar", () => {
  assert.equal(formatReceiptDateByLanguage("2026-03-05", "pt-BR"), "05/03/2026");
  assert.equal(formatReceiptDateByLanguage("2026-03-05T23:59:00Z", "pt-BR"), "05/03/2026");
  assert.equal(formatReceiptDateByLanguage("05/03/2026", "pt-BR"), "05/03/2026");
  assert.equal(formatReceiptDateByLanguage("2026-03-05", "en-US"), "3/5/2026");
  assert.equal(formatReceiptDateByLanguage("31/02/2026x", "pt-BR"), "31/02/2026x");
  assert.equal(formatReceiptDateByLanguage("sem data", "pt-BR"), "sem data");
  assert.equal(formatReceiptDateByLanguage("  ", "pt-BR"), "");
});

test("formatReceiptCurrencyByLanguage sempre em BRL, com separadores do idioma", () => {
  const normalize = (s: string) => s.replace(/ /g, " ");
  assert.equal(normalize(formatReceiptCurrencyByLanguage(1234.5, RECEIPT_LANGUAGE.portuguese)), "R$ 1.234,50");
  assert.equal(normalize(formatReceiptCurrencyByLanguage(1234.5, RECEIPT_LANGUAGE.english)), "R$1,234.50");
  assert.equal(normalize(formatReceiptCurrencyByLanguage(0, undefined)), "R$ 0,00");
});
