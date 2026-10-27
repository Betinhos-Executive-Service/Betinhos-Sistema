import { expect, test } from 'vitest'

const g = globalThis as unknown as Record<string, unknown>
import { fetchPlannerExport, fetchPlannerPlans } from "./plannerGraph";

test("carrega planos do usuário, pagina e ordena pelo nome exibido", async () => {
  const originalFetch = g.fetch;
  const calls: string[] = [];
  g.fetch = async (url: unknown) => {
    calls.push(String(url));
    const payload = calls.length === 1
      ? { value: [{ id: "z", title: "Zeta" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/planner/plans?$skiptoken=next" }
      : { value: [{ id: "a", title: "Alpha" }, { id: "sem-nome" }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const plans = await fetchPlannerPlans({ token: "token" });
    expect(plans).toStrictEqual([
      { id: "a", displayName: "Alpha" },
      { id: "sem-nome", displayName: "Plano sem nome" },
      { id: "z", displayName: "Zeta" },
    ]);
    expect(calls).toStrictEqual([
      "https://graph.microsoft.com/v1.0/me/planner/plans",
      "https://graph.microsoft.com/v1.0/me/planner/plans?$skiptoken=next",
    ]);
  } finally {
    g.fetch = originalFetch;
  }
});

test("informa progresso de tarefas com contagem real após paginação", async () => {
  const originalFetch = g.fetch;
  const progress: Array<{ label: string; total: number; completed: number }> = [];
  g.fetch = async (url: unknown) => {
    const target = String(url);
    if (target.endsWith("/tasks")) return new Response(JSON.stringify({ value: [{ id: "task-1", planId: "plan-1", title: "Tarefa", appliedCategories: { category1: true }, assignments: {} }] }), { status: 200 });
    if (target.endsWith("/buckets")) return new Response(JSON.stringify({ value: [] }), { status: 200 });
    if (target.endsWith("/details")) return new Response(JSON.stringify({ categoryDescriptions: { category1: "Urgente" } }), { status: 200 });
    if (target.endsWith("/$batch")) return new Response(JSON.stringify({ responses: [] }), { status: 200 });
    throw new Error(`URL inesperada: ${target}`);
  };

  try {
    const exported = await fetchPlannerExport({ token: "token", planId: "plan-1", onProgress: (value) => progress.push(value) });
    expect(progress.some((value) => value.label === "Buscando página 1 de tarefas…" && value.total === 0)).toBeTruthy();
    expect(progress.some((value) => value.label === "1 tarefa(s) encontrada(s)." && value.completed === 1 && value.total === 1)).toBeTruthy();
    expect(exported.categoryDescriptions).toStrictEqual({ category1: "Urgente" });
  } finally {
    g.fetch = originalFetch;
  }
});

test("mantém exportação quando detalhes das categorias não estão disponíveis", async () => {
  const originalFetch = g.fetch;
  g.fetch = async (url: unknown) => {
    const target = String(url);
    if (target.endsWith("/tasks")) return new Response(JSON.stringify({ value: [{ id: "task-1", title: "Tarefa", assignments: {} }] }), { status: 200 });
    if (target.endsWith("/buckets")) return new Response(JSON.stringify({ value: [] }), { status: 200 });
    if (target.endsWith("/details")) return new Response(JSON.stringify({ error: { message: "Sem permissão" } }), { status: 403 });
    if (target.endsWith("/$batch")) return new Response(JSON.stringify({ responses: [] }), { status: 200 });
    throw new Error(`URL inesperada: ${target}`);
  };

  try {
    const exported = await fetchPlannerExport({ token: "token", planId: "plan-1" });
    expect(exported.categoryDescriptions).toStrictEqual({});
    expect(exported.userWarning).toMatch(/nomes das categorias/);
  } finally {
    g.fetch = originalFetch;
  }
});
