import { assert, test } from "vitest";
import { taskHistoryDetails, visibleTaskHistory } from "./taskHistory";

test("histórico mantém mudanças úteis em ordem recente e remove notificações internas", () => {
  const result = visibleTaskHistory([
    { id: "old", createdAt: "2026-09-15T12:00:00Z", field: "status" },
    { id: "push", createdAt: "2026-09-16T12:00:00Z", field: "notification:waiting" },
    { id: "deadline", createdAt: "2026-09-16T13:00:00Z", field: "notification:deadline" },
  ]);
  assert.deepEqual(result.map((item) => item.id), ["deadline", "old"]);
});

test("histórico explica status, prazo e atribuição com dados existentes", () => {
  assert.deepEqual(taskHistoryDetails({ field: "status", previousValue: "todo", nextValue: "doing" }), { title: "Status alterado", before: "A fazer", after: "Em andamento" });
  assert.deepEqual(taskHistoryDetails({ field: "notification:deadline", previousValue: "2026-09-15", nextValue: JSON.stringify({ nextDueDate: "2026-09-20", reason: "Cliente solicitou" }) }), { title: "Prazo alterado", before: "15/09/2026", after: "20/09/2026", detail: "Motivo: Cliente solicitou" });
  assert.deepEqual(taskHistoryDetails({ field: "notification:assignees", nextValue: JSON.stringify({ addedAssigneeIds: ["1"], removedAssigneeIds: ["2"] }) }, [{ id: "1", name: "Ana" }, { id: "2", name: "Bruno" }]), { title: "Responsáveis alterados", detail: "Adicionados: Ana · Removidos: Bruno" });
});
