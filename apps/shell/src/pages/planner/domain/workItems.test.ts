import { assert, test } from "vitest";
import { filterWorkItems, isAssignedToEmployee, normalizeWorkItems, sortWorkItems, workItemStats } from "./workItems";

test("normaliza tarefas, ocorrências e ações como itens agregados", () => {
  const items = normalizeWorkItems({ tasks: [{ id: "t1", title: "Cotação", status: "todo", priority: "high", dueDate: "2026-01-01", sourceType: "quote", quoteId: "q1" }], quality: [{ id: "e1", type: "error", title: "Avaria", status: "Em tratamento", dueDate: "2026-01-02" }] });
  assert.deepEqual(items.map((item) => item.source), ["quote_followup", "quality_error"]);
  assert.strictEqual(items[1].statusGroup, "doing");
});

test("ordena vencidos antes de prazo e prioridade", () => {
  const items = [{ id: "a", title: "Depois", dueAt: "2099-01-01", priorityRank: 0, statusGroup: "todo", isOverdue: false }, { id: "b", title: "Vencido", dueAt: "2020-01-01", priorityRank: 3, statusGroup: "todo", isOverdue: true }];
  assert.strictEqual(sortWorkItems(items)[0].id, "b");
});

test("filtra origem e calcula pendências", () => {
  const items = [{ id: "a", source: "task", title: "A", context: "", assigneeName: "Renan", statusGroup: "todo", isOverdue: true }, { id: "b", source: "quality_action", title: "B", context: "", assigneeName: "Outro", statusGroup: "waiting", isOverdue: false }];
  assert.strictEqual(filterWorkItems(items, { source: "task" }).length, 1);
  assert.deepEqual(workItemStats(items), { open: 2, overdue: 1, today: 0, tomorrow: 0, doing: 0, waiting: 1, alertCount: 1 });
});

test("status vazio significa todos e uma seleção explícita continua disponível", () => {
  const items = normalizeWorkItems({
    tasks: [
      { id: "done", title: "Concluída", status: "done", priority: "low" },
      { id: "open", title: "Acompanhar undefined", status: "waiting", sourceType: "quote", quoteCode: "COT-9", priority: "medium" },
    ],
    quality: [{ id: "q1", type: "error", title: "Resolvida", status: "Resolvido" }],
  });
  const allStatuses = filterWorkItems(items, { status: [] });
  assert.strictEqual(allStatuses.length, 3);
  const visible = filterWorkItems(items, { status: ["todo", "doing", "waiting"] });
  assert.strictEqual(visible.length, 1);
  assert.strictEqual(visible[0].title, "Acompanhar COT-9");
  assert.strictEqual(visible[0].statusLabel, "Aguardando");
  assert.strictEqual(items.find((item) => item.sourceRecordId === "done")!.isTerminal, true);
});

test("inclui responsável do retorno em Minhas e usa seu prazo", () => {
  const items = normalizeWorkItems({
    teams: [],
    tasks: [{
      id: "waiting-return",
      title: "Aguardar fornecedor",
      status: "waiting",
      dueDate: "2026-08-20",
      waitingContext: { subject: "confirmação", onType: "employee", onIds: ["e2"], onNames: ["Marina"], expectedDate: "2026-08-28" },
    }],
  }, { id: "e2", name: "Marina" });

  assert.strictEqual(items[0].dueAt, "2026-08-28");
  assert.strictEqual(isAssignedToEmployee(items[0], { id: "e2", name: "Marina" }), true);
});

test("escopa itens por responsável sem perder itens não atribuídos na equipe", () => {
  const items = [
    { id: "mine", assigneeEmployeeId: "e1", assigneeName: "Renan", statusGroup: "todo", isTerminal: false },
    { id: "unassigned", assigneeEmployeeId: "", assigneeName: "Não atribuído", statusGroup: "todo", isTerminal: false },
  ];
  assert.strictEqual(items.filter((item) => item.assigneeEmployeeId === "e1").length, 1);
  assert.strictEqual(filterWorkItems(items).length, 2);
});

test("expõe e aplica prioridade, equipe e status nos itens agregados", () => {
  const items = normalizeWorkItems({ tasks: [
    { id: "waiting", title: "Retorno", status: "waiting", priority: "high", teamName: "Operação" },
    { id: "open", title: "Contato", status: "todo", priority: "low", teamName: "Comercial" },
  ] });
  assert.strictEqual(items[0].priority, "high");
  assert.strictEqual(items[0].teamName, "Operação");
  assert.strictEqual(items[0].statusGroup, "waiting");
  assert.deepEqual(filterWorkItems(items, { priority: ["high"], team: "Operação", status: ["waiting"] }).map((item) => item.sourceRecordId), ["waiting"]);
  assert.deepEqual(filterWorkItems(items, { team: ["Operação", "Comercial"] }).map((item) => item.sourceRecordId), ["waiting", "open"]);
});

test("inclui tarefa compartilhada nas pendências de cada responsável", () => {
  const items = normalizeWorkItems({ tasks: [{ id: "shared", title: "Tarefa compartilhada", status: "todo", assigneeIds: ["e1", "e2"], assigneeNames: ["Renan", "Marina"], assigneeName: "Renan, Marina" }] });
  assert.strictEqual(isAssignedToEmployee(items[0], { id: "e1", name: "Renan" }), true);
  assert.strictEqual(isAssignedToEmployee(items[0], { id: "e2", name: "Marina" }), true);
  assert.strictEqual(isAssignedToEmployee(items[0], { id: "e3", name: "Outro" }), false);
});

test("remove tarefa restrita do resumo para usuário sem vínculo e mantém para o criador", () => {
  const state = {
    teams: [{ id: "team-op", name: "Operação", memberIds: ["e2"] }],
    tasks: [{
      id: "restricted",
      title: "Alinhamento reservado",
      status: "todo",
      restrictedVisibility: true,
      creatorEmployeeId: "e1",
      assigneeIds: [],
      assigneeNames: [],
      teamIds: ["team-op"],
      teamNames: ["Operação"],
    }],
  };

  assert.strictEqual(normalizeWorkItems(state, { id: "e1" }).length, 1);
  assert.strictEqual(normalizeWorkItems(state, { id: "e2" }).length, 1);
  assert.strictEqual(normalizeWorkItems(state, { id: "e3" }).length, 0);
});
