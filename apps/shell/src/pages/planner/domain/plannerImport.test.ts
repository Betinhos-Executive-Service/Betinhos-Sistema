import { expect, test } from 'vitest'
import { analyzePlannerImport, graphQueryUrls, plannerDetailBatches } from "./plannerImport";

test("analisa tarefas do Graph, converte choices e exige detalhes e responsáveis", () => {
  const result = analyzePlannerImport({
    planId: "plan-1",
    tasksText: JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", percentComplete: 50, priority: 1, hasDescription: true, checklistItemCount: 1, assignments: { "graph-1": {}, "graph-2": {} } }] }),
    detailsText: JSON.stringify([{ taskId: "task-1", details: { description: "Descrição", checklist: { "check-1": { title: "Conferir", isChecked: true } } } }]),
    employeeMapText: JSON.stringify({ "graph-1": "employee-1", "graph-2": "employee-2" }),
  });
  expect(result.canImport).toBe(true);
  expect(result.rows[0].status).toBe("doing");
  expect(result.rows[0].priority).toBe("urgent");
  expect(result.rows[0].checklist).toStrictEqual([{ id: "check-1", title: "Conferir", done: true }]);
  expect(result.rows[0].sourceType).toBe("manual");
  expect(result.rows[0].assignments.map((item) => item.employeeId)).toStrictEqual(["employee-1", "employee-2"]);
});

test("bloqueia paginação pendente e responsável sem mapeamento", () => {
  const result = analyzePlannerImport({
    planId: "plan-1",
    tasksText: JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", assignments: { "graph-1": {} } }], "@odata.nextLink": "next" }),
  });
  expect(result.canImport).toBe(false);
  expect(result.errors.join(" ")).toMatch(/nextLink/);
  expect(result.errors.join(" ")).toMatch(/usuário/);
});

test("gera links diretos para as consultas do plano", () => {
  const urls = graphQueryUrls("plan 1");
  expect(urls.tasks).toMatch(/plan%201/);
  expect(urls.buckets).toMatch(/\/buckets$/);
  expect(urls.batch).toMatch(/\/\$batch$/);
});

test("monta lotes de detalhes com no máximo 20 consultas", () => {
  const tasks = Array.from({ length: 21 }, (_, index) => ({ id: `task-${index}`, hasDescription: true }));
  const result = plannerDetailBatches(JSON.stringify({ value: tasks }));
  expect(result.detailTaskCount).toBe(21);
  expect(result.batches.length).toBe(2);
  expect(result.batches[0].payload.requests.length).toBe(20);
  expect(result.batches[1].payload.requests.length).toBe(1);
  expect(result.batches[0].payload.requests[0].id).toBe("task-0");
});

test("lê respostas de detalhes no formato retornado pelo Graph batch", () => {
  const result = analyzePlannerImport({
    planId: "plan-1",
    tasksText: JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", hasDescription: true }] }),
    detailsText: JSON.stringify([{ responses: [{ id: "task-1", status: 200, body: { description: "Descrição" } }] }]),
  });
  expect(result.canImport).toBe(true);
  expect(result.rows[0].description).toBe("Descrição");
});

test("lê também um único JSON de resposta batch colado pelo usuário", () => {
  const result = analyzePlannerImport({
    planId: "plan-1",
    tasksText: JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", hasDescription: true }] }),
    detailsText: JSON.stringify({ responses: [{ id: "task-1", status: 200, body: { description: "Descrição" } }] }),
  });
  expect(result.canImport).toBe(true);
  expect(result.rows[0].description).toBe("Descrição");
});

test("avisa detalhes ausentes sem bloquear a importação", () => {
  const result = analyzePlannerImport({
    planId: "plan-1",
    tasksText: JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", hasDescription: true, checklistItemCount: 1 }] }),
  });
  expect(result.canImport).toBe(true);
  expect(result.rows[0].description).toBe("");
  expect(result.rows[0].checklist).toStrictEqual([]);
  expect(result.warnings.join(" ")).toMatch(/Faltam detalhes de 1 tarefa/);
});

test("converte categorias aplicadas em tags e ignora categorias sem descrição", () => {
  const result = analyzePlannerImport({
    planId: "plan-1",
    categoryDescriptions: { category1: "  VIP  ", category2: "", category3: "vip" },
    tasksText: JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", appliedCategories: { category1: true, category2: true, category3: true } }] }),
  });
  expect(result.rows[0].tags).toStrictEqual(["VIP"]);
  expect(result.stats.taggedTaskCount).toBe(1);
});

test("aceita booleanos serializados em tags e checklist", () => {
  const result = analyzePlannerImport({
    planId: "plan-1",
    categoryDescriptions: { category1: "VIP" },
    tasksText: JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", appliedCategories: { category1: "true" }, hasDescription: true }] }),
    detailsText: JSON.stringify([{ taskId: "task-1", details: { checklist: { "check-1": { title: "Conferir", isChecked: "false" } } } }]),
  });
  expect(result.rows[0].tags).toStrictEqual(["VIP"]);
  expect(result.rows[0].checklist).toStrictEqual([{ id: "check-1", title: "Conferir", done: false }]);
});

test("aceita descrições de categorias coladas no formato do Planner", () => {
  const result = analyzePlannerImport({
    planId: "plan-1",
    categoryDescriptionsText: JSON.stringify({ categoryDescriptions: { category1: "VIP" } }),
    tasksText: JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", appliedCategories: { category1: true } }] }),
  });
  expect(result.rows[0].tags).toStrictEqual(["VIP"]);
});
