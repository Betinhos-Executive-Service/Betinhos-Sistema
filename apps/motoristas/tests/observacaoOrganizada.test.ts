import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_OBSERVATION,
  buildOrganizedObservation,
  mockOrganizeObservation,
  canFinalizeReview,
  isReviewStale,
  parseOrganizeResult,
  prepareObservationReview,
  refreshReview,
  reviewFinalValue,
  topicKind,
  type ReviewState
} from "../src/lib/observacaoOrganizada.ts";

const okJson = (topicos: string[]) => JSON.stringify({ ok: true, topicos, motivo: null, ms: 900, input_tokens: 200, output_tokens: 40 });

test("com texto chama a API e devolve os tópicos para conferência", async () => {
  const calls: string[] = [];
  const review = await prepareObservationReview("  passageiro atrasou, paguei pedágio  ", async (text) => {
    calls.push(text);
    return okJson(["Atraso do passageiro.", "Pedágio pago."]);
  });
  assert.deepEqual(calls, ["passageiro atrasou, paguei pedágio"]);
  assert.deepEqual(review, { kind: "review", original: "passageiro atrasou, paguei pedágio", summarizedFrom: "passageiro atrasou, paguei pedágio", topicos: ["Atraso do passageiro.", "Pedágio pago."], status: "ready" });
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

test("falha, resposta ok=false ou timeout abrem a conferência com aviso e gravam só o original", async () => {
  const failed = (value: unknown) => {
    assert.equal((value as ReviewState).status, "failed");
    assert.equal(reviewFinalValue(value as ReviewState), "texto");
    assert.equal(canFinalizeReview(value as ReviewState), true);
  };
  failed(await prepareObservationReview("texto", async () => { throw new Error("rede"); }));
  failed(await prepareObservationReview("texto", async () => JSON.stringify({ ok: false, topicos: [], motivo: "sem_chave" })));
  const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve(okJson(["x"])), 200));
  failed(await prepareObservationReview("texto", slow, 20));
});

const ready: ReviewState = { original: "atrasou 20 min", summarizedFrom: "atrasou 20 min", topicos: ["Atraso de 20 min."], status: "ready" };

test("finalizar sempre envia o resumo com o texto original", () => {
  assert.equal(canFinalizeReview(ready), true);
  assert.equal(reviewFinalValue(ready), "• Atraso de 20 min.\n\nTexto original: atrasou 20 min");
});

test("texto original alterado bloqueia finalizar até atualizar o resumo", async () => {
  const edited = { ...ready, original: "atrasou 30 min" };
  assert.equal(isReviewStale(edited), true);
  assert.equal(canFinalizeReview(edited), false);
  assert.equal(canFinalizeReview({ ...ready, status: "updating" }), false);
  const calls: string[] = [];
  const updated = await refreshReview(edited, async (text) => { calls.push(text); return okJson(["Atraso de 30 min."]); });
  assert.deepEqual(calls, ["atrasou 30 min"]);
  assert.deepEqual(updated, { original: "atrasou 30 min", summarizedFrom: "atrasou 30 min", topicos: ["Atraso de 30 min."], status: "ready" });
  assert.equal(reviewFinalValue(updated), "• Atraso de 30 min.\n\nTexto original: atrasou 30 min");
});

test("falha ao atualizar mostra aviso e grava só o original", async () => {
  const failed = await refreshReview({ ...ready, original: "atrasou 30 min" }, async () => { throw new Error("timeout"); });
  assert.equal(failed.status, "failed");
  assert.equal(canFinalizeReview(failed), true);
  assert.equal(reviewFinalValue(failed), "atrasou 30 min");
});

test("ícone por tipo do tópico, sem ícone quando não casa", () => {
  assert.equal(topicKind("Atraso de 20 minutos na saída."), "atraso");
  assert.equal(topicKind("Espera de 15 min no hotel."), "espera");
  assert.equal(topicKind("Pedágio pago na Dutra."), "pedagio");
  assert.equal(topicKind("Estacionamento no aeroporto."), "pedagio");
  assert.equal(topicKind("Abasteci o carro."), "combustivel");
  assert.equal(topicKind("Pneu furou na marginal."), "ocorrencia");
  assert.equal(topicKind("Passageiro elogiou o serviço."), "passageiro");
  assert.equal(topicKind("Tudo tranquilo."), null);
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
