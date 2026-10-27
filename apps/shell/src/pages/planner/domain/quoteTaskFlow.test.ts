import { assert, test } from "vitest";
import {
  CLIENT_DECISION_SUBJECT,
  QUOTE_STATUS_FLOW,
  QUOTE_TERMINAL_STATUSES,
  clientDecisionWaitingContext,
  startQuotePatch,
  waitingContextForStatusChange,
  isQuoteTask,
  taskStatusForQuoteStatus,
  quoteStatusForTaskStatus,
} from "./quoteTaskFlow";

test("define o fluxo comercial único da cotação", () => {
  assert.deepEqual(QUOTE_STATUS_FLOW, [
    "Nova",
    "Em análise pelo financeiro",
    "Aguardando informação",
    "Cotada",
    "Respondida ao cliente",
  ]);
  assert.deepEqual(QUOTE_TERMINAL_STATUSES, [
    "Aceita pelo cliente",
    "Perdida",
    "Cancelada",
  ]);
});

test("mantém a tarefa aberta até a decisão do cliente", () => {
  assert.strictEqual(taskStatusForQuoteStatus("Nova"), "todo");
  assert.strictEqual(taskStatusForQuoteStatus("Em análise pelo financeiro"), "doing");
  assert.strictEqual(taskStatusForQuoteStatus("Aguardando informação"), "waiting");
  assert.strictEqual(taskStatusForQuoteStatus("Cotada"), "doing");
  assert.strictEqual(taskStatusForQuoteStatus("Respondida ao cliente"), "waiting");
  assert.strictEqual(taskStatusForQuoteStatus("Aceita pelo cliente"), "done");
  assert.strictEqual(taskStatusForQuoteStatus("Perdida"), "done");
});

test("preserva etapa comercial ao reabrir ou cancelar uma tarefa", () => {
  assert.strictEqual(quoteStatusForTaskStatus("done", "Perdida"), "Perdida");
  assert.strictEqual(quoteStatusForTaskStatus("done", "Cotada"), "Cotada");
  assert.strictEqual(quoteStatusForTaskStatus("done", "Nova"), "Nova");
  assert.strictEqual(quoteStatusForTaskStatus("cancelled", "Em análise pelo financeiro"), "Em análise pelo financeiro");
  assert.strictEqual(quoteStatusForTaskStatus("waiting", "Respondida ao cliente"), "Respondida ao cliente");
  assert.strictEqual(quoteStatusForTaskStatus("todo", ""), "Nova");
  assert.strictEqual(isQuoteTask({ quoteId: "quote-1" }), true);
  assert.strictEqual(isQuoteTask({ sourceType: "manual" }), false);
});

test("contexto de espera do envio cobra o contato do cliente em 2 dias úteis", () => {
  const context = clientDecisionWaitingContext({ clientContact: "Iara", client: "Acme" }, "2026-10-23T18:00:00.000Z");
  assert.strictEqual(context.subject, CLIENT_DECISION_SUBJECT);
  assert.strictEqual(context.onType, "external");
  assert.deepEqual(context.onNames, ["Iara"]);
  assert.strictEqual(context.expectedDate, "2026-10-27");
  assert.strictEqual(clientDecisionWaitingContext({ client: "Acme" }, "2026-10-19T12:00:00.000Z").expectedDate, "2026-10-21");
  assert.deepEqual(waitingContextForStatusChange("Cotada", "Respondida ao cliente", { client: "Acme" }, "2026-10-19T12:00:00.000Z")!.expectedDate, "2026-10-21");
  assert.deepEqual(waitingContextForStatusChange("Respondida ao cliente", "Aceita pelo cliente", {}, ""), {});
  assert.deepEqual(waitingContextForStatusChange("Respondida ao cliente", "Cotada", {}, ""), {});
  assert.strictEqual(waitingContextForStatusChange("Nova", "Em análise pelo financeiro", {}, ""), undefined);
  assert.strictEqual(waitingContextForStatusChange("Cotada", "Cotada", {}, ""), undefined);
  assert.deepEqual(startQuotePatch({ assigneeIds: [] }, { id: "e1", name: "Renan" }), { status: "Em análise pelo financeiro", assigneeIds: ["e1"], assigneeNames: ["Renan"] });
  assert.deepEqual(startQuotePatch({ assigneeIds: ["e2"] }, { id: "e1", name: "Renan" }), { status: "Em análise pelo financeiro" });
});

