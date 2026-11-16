import assert from "node:assert/strict";
import test from "node:test";
import { motivoDaRecusaDaNota } from "../src/features/despesas/remoto.ts";

test("recusa do plugin da chave é reconhecida pelo Xrm e pelo fetch; outros erros seguem como antes", () => {
  // Xrm.WebApi: errorCode numérico do InvalidPluginExecutionException.
  assert.equal(motivoDaRecusaDaNota({ errorCode: -2147220891, message: "Esta nota já foi usada em outra despesa, lançada em 10/11/2026." }), "Esta nota já foi usada em outra despesa, lançada em 10/11/2026.");
  // fetch do envio assíncrono: "Despesa: HTTP 400. <json>".
  const corpo = JSON.stringify({ error: { code: "0x80040265", message: "Chave da nota inválida: o dígito verificador não confere." } });
  assert.equal(motivoDaRecusaDaNota(new Error(`Despesa: HTTP 400. ${corpo}`)), "Chave da nota inválida: o dígito verificador não confere.");
  // Plugin de outra regra, rede e permissão: não é recusa da nota.
  assert.equal(motivoDaRecusaDaNota({ errorCode: -2147220891, message: "Seu usuário não está vinculado a um motorista ativo." }), null);
  assert.equal(motivoDaRecusaDaNota(new TypeError("Failed to fetch")), null);
  assert.equal(motivoDaRecusaDaNota(new Error("Despesa: HTTP 403. {\"error\":{\"code\":\"0x80040220\",\"message\":\"Sem privilégio na chave\"}}")), null);
});
