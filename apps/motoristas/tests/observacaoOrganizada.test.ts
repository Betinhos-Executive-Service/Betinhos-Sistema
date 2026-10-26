import assert from "node:assert/strict";
import test from "node:test";
import {
  activeSummary,
  buildOrganizedObservation,
  generateSummary,
  mockOrganizeObservation,
  parseOrganizeResult,
  summaryFinalValue,
  topicKind
} from "../src/lib/observacaoOrganizada.ts";

const okJson = (topicos: string[]) => JSON.stringify({ ok: true, topicos, motivo: null, ms: 900, input_tokens: 200, output_tokens: 40 });

test("gerar resumo chama a API com o texto e devolve os tópicos", async () => {
  const calls: string[] = [];
  const summary = await generateSummary("  passageiro atrasou, paguei pedágio  ", async (text) => {
    calls.push(text);
    return okJson(["Atraso do passageiro.", "Pedágio pago."]);
  });
  assert.deepEqual(calls, ["passageiro atrasou, paguei pedágio"]);
  assert.deepEqual(summary, { from: "passageiro atrasou, paguei pedágio", topicos: ["Atraso do passageiro.", "Pedágio pago."], status: "ready" });
  assert.equal(summaryFinalValue(summary), "• Atraso do passageiro.\n• Pedágio pago.\n\nTexto original: passageiro atrasou, paguei pedágio");
});

test("texto vazio não chama a API", async () => {
  let called = false;
  const summary = await generateSummary("   ", async () => { called = true; return okJson(["x"]); });
  assert.equal(called, false);
  assert.equal(activeSummary(summary, ""), null);
});

test("alterar o texto depois do resumo volta à etapa Gerar resumo", () => {
  const summary = { from: "atrasou 20 min", topicos: ["Atraso de 20 min."], status: "ready" as const };
  assert.equal(activeSummary(summary, " atrasou 20 min "), summary);
  assert.equal(activeSummary(summary, "atrasou 30 min"), null);
  assert.equal(activeSummary(null, "x"), null);
});

test("falha, ok=false ou timeout: Enviar grava só o original", async () => {
  const check = async (summaryPromise: ReturnType<typeof generateSummary>) => {
    const summary = await summaryPromise;
    assert.equal(summary.status, "failed");
    assert.equal(summaryFinalValue(summary), "texto");
  };
  await check(generateSummary("texto", async () => { throw new Error("rede"); }));
  await check(generateSummary("texto", async () => JSON.stringify({ ok: false, topicos: [], motivo: "sem_chave" })));
  await check(generateSummary("texto", () => new Promise<string>((resolve) => setTimeout(() => resolve(okJson(["x"])), 200)), 20));
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
