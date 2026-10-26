import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_OBSERVATION,
  buildOrganizedObservation,
  mockOrganizeObservation,
  parseOrganizeResult,
  prepareObservationReview
} from "../src/lib/observacaoOrganizada.ts";

const okJson = (topicos: string[]) => JSON.stringify({ ok: true, topicos, motivo: null, ms: 900, input_tokens: 200, output_tokens: 40 });

test("com texto chama a API e devolve os tópicos para conferência", async () => {
  const calls: string[] = [];
  const review = await prepareObservationReview("  passageiro atrasou, paguei pedágio  ", async (text) => {
    calls.push(text);
    return okJson(["Atraso do passageiro.", "Pedágio pago."]);
  });
  assert.deepEqual(calls, ["passageiro atrasou, paguei pedágio"]);
  assert.deepEqual(review, { kind: "review", original: "passageiro atrasou, paguei pedágio", topicos: ["Atraso do passageiro.", "Pedágio pago."] });
});

test("sem texto não chama a API e grava como hoje", async () => {
  let called = false;
  const review = await prepareObservationReview("   ", async () => {
    called = true;
    return okJson(["x"]);
  });
  assert.equal(called, false);
  assert.deepEqual(review, { kind: "direct", value: NO_OBSERVATION });
});

test("falha, resposta ok=false ou timeout gravam o texto original", async () => {
  assert.deepEqual(await prepareObservationReview("texto", async () => { throw new Error("rede"); }), { kind: "direct", value: "texto" });
  assert.deepEqual(await prepareObservationReview("texto", async () => JSON.stringify({ ok: false, topicos: [], motivo: "sem_chave" })), { kind: "direct", value: "texto" });
  const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve(okJson(["x"])), 200));
  assert.deepEqual(await prepareObservationReview("texto", slow, 20), { kind: "direct", value: "texto" });
});

test("confirmar grava tópicos e texto original no formato combinado", () => {
  assert.equal(buildOrganizedObservation(["Atraso de 20 min.", "Pedágio pago."], "atrasou 20 min, paguei pedágio"), "• Atraso de 20 min.\n• Pedágio pago.\n\nTexto original: atrasou 20 min, paguei pedágio");
});

test("parse limita a 8 tópicos de 140 caracteres e ignora vazios", () => {
  const many = ["", " ", "a".repeat(200), ...Array.from({ length: 10 }, (_, i) => `t${i}`)];
  const parsed = parseOrganizeResult(okJson(many));
  assert.equal(parsed.length, 8);
  assert.equal(parsed[0].length, 140);
  assert.deepEqual(parseOrganizeResult("não é json"), []);
});

test("mock local devolve tópicos a partir das frases", async () => {
  assert.deepEqual(parseOrganizeResult(await mockOrganizeObservation("Passageiro atrasou. Paguei pedágio")), ["Passageiro atrasou.", "Paguei pedágio."]);
});
