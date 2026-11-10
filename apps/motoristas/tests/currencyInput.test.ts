import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrencyInputOnBlur, sanitizeCurrencyInput } from "../src/shared/currencyInput.ts";

test("valor monetário descarta letras e símbolos digitados", () => {
  assert.equal(sanitizeCurrencyInput("1250,90sao jose dos"), "1250,90");
  assert.equal(sanitizeCurrencyInput("380abc,5"), "380,5");
  assert.equal(sanitizeCurrencyInput("R$ 45"), "45");
});

test("valor monetário mantém só o último separador como decimal, com até 2 casas", () => {
  assert.equal(sanitizeCurrencyInput("1.250,90"), "1250,90");
  assert.equal(sanitizeCurrencyInput("12,345"), "12,34");
  assert.equal(sanitizeCurrencyInput("12,"), "12,");
  assert.equal(sanitizeCurrencyInput("12.5"), "12.5");
});

test("ponto seguido de 3 dígitos é milhar, não centavos", () => {
  assert.equal(sanitizeCurrencyInput("1.250"), "1250");
  assert.equal(sanitizeCurrencyInput("12.345"), "12345");
});

test("ao sair do campo o valor ganha duas casas decimais no padrão pt-BR", () => {
  assert.equal(formatCurrencyInputOnBlur("12,5"), "12,50");
  assert.equal(formatCurrencyInputOnBlur("12"), "12,00");
  assert.equal(formatCurrencyInputOnBlur("1250.9"), "1250,90");
  assert.equal(formatCurrencyInputOnBlur("12,"), "12,00");
  assert.equal(formatCurrencyInputOnBlur(""), "");
});
