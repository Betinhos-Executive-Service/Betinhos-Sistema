import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRepeatSignature,
  classifyErrorCause,
  compactErrorChain,
  createRepeatTracker,
  dropRepeatedError,
  limitPayload,
  withCauseLabel
} from "../src/shared/errorLogGrouping.ts";

const entry = (message: string, error: unknown, action = "agenda") => {
  const cause = classifyErrorCause(error);
  return { signature: buildRepeatSignature({ source: "dataverse", action, phase: "fallback", message, cause }), message, source: "dataverse", action, phase: "fallback", cause };
};

test("40 falhas iguais viram 1 gravação completa e 1 resumo com a contagem", () => {
  let clock = 1_000;
  const tracker = createRepeatTracker(() => clock);
  const error = Object.assign(new Error("Falha ao enriquecer"), { cause: new TypeError("Failed to fetch") });
  const decisions = Array.from({ length: 40 }, () => {
    clock += 500;
    return tracker.record(entry("Falha ao enriquecer", error));
  });
  assert.equal(decisions.filter((item) => item.log).length, 1);
  const [summary, ...others] = tracker.drain();
  assert.equal(others.length, 0);
  assert.equal(summary.suppressed, 39);
  assert.equal(summary.cause.kind, "rede");
  assert.equal(tracker.drain().length, 0, "O resumo é entregue uma vez.");
});

test("causas diferentes da mesma mensagem continuam em grupos separados", () => {
  const tracker = createRepeatTracker(() => 1);
  const rede = Object.assign(new Error("retrieveRecord falhou."), { cause: { error: { message: "Failed to fetch" } } });
  const timeout = Object.assign(new Error("retrieveRecord falhou."), { cause: { error: { raw: new Error("The request timed out") } } });
  const permissao = Object.assign(new Error("retrieveRecord falhou."), { cause: { error: { message: "Sem privilégio", errorCode: "0x80040220" } } });
  assert.equal(tracker.record(entry("retrieveRecord falhou.", rede)).log, true);
  assert.equal(tracker.record(entry("retrieveRecord falhou.", timeout)).log, true);
  assert.equal(tracker.record(entry("retrieveRecord falhou.", permissao)).log, true);
  assert.equal(tracker.record(entry("retrieveRecord falhou.", rede)).log, false);
  assert.deepEqual([classifyErrorCause(rede).kind, classifyErrorCause(timeout).kind, classifyErrorCause(permissao).kind], ["rede", "timeout", "outro"]);
  assert.equal(withCauseLabel("retrieveRecord falhou.", classifyErrorCause(rede)), "retrieveRecord falhou. [causa: rede]");
  assert.equal(withCauseLabel("retrieveRecord falhou.", classifyErrorCause(permissao)), "retrieveRecord falhou.");
});

test("falha que volta depois de 5 min de silêncio é gravada completa de novo e fecha o resumo anterior", () => {
  let clock = 0;
  const tracker = createRepeatTracker(() => clock);
  const error = new Error("Load failed");
  tracker.record(entry("Load failed", error));
  clock += 1000;
  tracker.record(entry("Load failed", error));
  clock += 6 * 60 * 1000;
  const again = tracker.record(entry("Load failed", error));
  assert.equal(again.log, true);
  assert.equal(again.closed?.suppressed, 1);
});

test("assinatura ignora GUIDs e números longos da mensagem", () => {
  const cause = { kind: "outro" as const, code: "" };
  const a = buildRepeatSignature({ message: "Falha 11111111-1111-1111-1111-111111111111 OT 202410001", cause });
  const b = buildRepeatSignature({ message: "Falha 22222222-2222-2222-2222-222222222222 OT 202410002", cause });
  assert.equal(a, b);
});

test("cadeia de causas não repete a mesma mensagem e mantém contexto e código", () => {
  const inner = new TypeError("Failed to fetch");
  const data = { entitySetName: "cr40f_bancodedadoses", id: "x", durationMs: 120, error: { message: "Failed to fetch", errorCode: "", raw: inner } };
  const chain = compactErrorChain(Object.assign(new Error("retrieveRecord falhou."), { cause: data }));
  assert.deepEqual(chain.causas.map((hop) => hop.message), ["retrieveRecord falhou.", "Failed to fetch"]);
  assert.equal(chain.contexto?.entitySetName, "cr40f_bancodedadoses");
  assert.equal(chain.contexto?.durationMs, 120);
});

test("dropRepeatedError tira do contexto o erro que já está na cadeia", () => {
  const cause = new Error("Failed to fetch");
  const error = Object.assign(new Error("Falha ao enriquecer"), { cause });
  assert.deepEqual(dropRepeatedError({ serviceId: "s1", error: cause }, error), { serviceId: "s1" });
});

test("payload acima do limite é reduzido e continua dentro do tamanho", () => {
  const big = { eventId: "e", payload: { texto: "x".repeat(20_000), lista: Array.from({ length: 500 }, (_, i) => `item-${i}`) }, error: { causas: [{ message: "Failed to fetch" }] } };
  const limited = limitPayload(big, 6000) as typeof big;
  assert.ok(JSON.stringify(limited).length <= 6000);
  assert.equal(limited.eventId, "e");
  assert.equal(limited.error.causas[0].message, "Failed to fetch");
  const small = { a: 1 };
  assert.equal(limitPayload(small, 6000), small, "Payload pequeno passa sem mudança.");
});
