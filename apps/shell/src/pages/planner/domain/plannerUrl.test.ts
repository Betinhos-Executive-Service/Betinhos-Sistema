import { assert, test } from "vitest";

import { plannerNavigationWindow, plannerUrlForState, readPlannerUrlState } from "./plannerUrl";

test("usa a janela visível do Model-driven para atualizar a Query URL", () => {
  const shell = {
    location: {
      pathname: "/main.aspx",
      search: "?appid=APP-1&pagetype=webresource&webresourceName=new_TelaPlanner.html",
      hash: "",
    },
  };
  (shell as { parent?: unknown }).parent = shell;
  const iframe = { location: { pathname: "/WebResources/new_TelaPlanner.html", search: "", hash: "" }, parent: shell };

  assert.strictEqual(plannerNavigationWindow(iframe), shell);
});

test("mantém a própria janela quando não está no shell do Model-driven", () => {
  const standalone = { location: { pathname: "/", search: "", hash: "" } };
  (standalone as { parent?: unknown }).parent = standalone;
  assert.strictEqual(plannerNavigationWindow(standalone), standalone);
});

test("lê view e tarefa do envelope data do WebResource", () => {
  assert.deepEqual(readPlannerUrlState("?data=view%3Dcalendar%26taskId%3DTASK-1"), {
    view: "calendar",
    taskId: "TASK-1",
    contactId: "",
    quoteId: "",
  });
});

test("ignora view desconhecida para não renderizar tela vazia", () => {
  assert.strictEqual(readPlannerUrlState("?data=view%3Dinexistente").view, "board");
});

test("gera URL compartilhável e preserva parâmetros externos", () => {
  const url = plannerUrlForState(
    { pathname: "/WebResources/new_TelaPlanner.html", search: "?org=betinhos", hash: "#top" },
    { view: "management", taskId: "TASK-2" },
  );

  const parsed = new URL(url, "https://example.test");
  assert.strictEqual(parsed.searchParams.get("org"), "betinhos");
  assert.deepEqual(readPlannerUrlState(parsed.search), { view: "management", taskId: "TASK-2", contactId: "", quoteId: "" });
  assert.strictEqual(parsed.hash, "#top");
});

test("remove parâmetros de lançamento conflitantes ao abrir tarefa", () => {
  const url = plannerUrlForState(
    { pathname: "/WebResources/new_TelaPlanner.html", search: "?data=source%3Dquote%26sourceId%3DQ-1", hash: "" },
    { view: "board", taskId: "TASK-3" },
  );

  const parsed = new URL(url, "https://example.test");
  const data = new URLSearchParams(parsed.searchParams.get("data") ?? undefined);
  assert.strictEqual(data.get("taskId"), "TASK-3");
  assert.strictEqual(data.has("source"), false);
  assert.strictEqual(data.has("sourceId"), false);
});

test("lê e gera deep link de caso sem misturar com tarefa", () => {
  assert.deepEqual(readPlannerUrlState("?data=view%3Dcontacts%26contactId%3DC-9"), {
    view: "contacts",
    taskId: "",
    contactId: "C-9",
    quoteId: "",
  });
  const url = plannerUrlForState(
    { pathname: "/WebResources/new_TelaPlanner.html", search: "", hash: "" },
    { view: "contacts", contactId: "C-10" },
  );
  assert.deepEqual(readPlannerUrlState(new URL(url, "https://example.test").search), {
    view: "contacts",
    taskId: "",
    contactId: "C-10",
    quoteId: "",
  });
});

test("abrir tarefa remove vínculo de caso do envelope", () => {
  const url = plannerUrlForState(
    { pathname: "/WebResources/new_TelaPlanner.html", search: "?data=view%3Dcontacts%26contactId%3DC-1", hash: "" },
    { view: "board", taskId: "TASK-4" },
  );
  const state = readPlannerUrlState(new URL(url, "https://example.test").search);
  assert.deepEqual(state, { view: "board", taskId: "TASK-4", contactId: "", quoteId: "" });
});

test("infere a tela do registro e gera deep link de cotação", () => {
  assert.deepEqual(readPlannerUrlState("?data=contactId%3DC-11"), {
    view: "contacts",
    taskId: "",
    contactId: "C-11",
    quoteId: "",
  });

  const url = plannerUrlForState(
    { pathname: "/WebResources/new_TelaPlanner.html", search: "", hash: "" },
    { view: "quotes", quoteId: "Q-12" },
  );
  assert.deepEqual(readPlannerUrlState(new URL(url, "https://example.test").search), {
    view: "quotes",
    taskId: "",
    contactId: "",
    quoteId: "Q-12",
  });
});

test("troca IDs diretos conflitantes por um único registro no envelope", () => {
  const url = plannerUrlForState(
    { pathname: "/WebResources/new_TelaPlanner.html", search: "?taskId=T-1&contactId=C-1&quoteId=Q-1", hash: "" },
    { view: "contacts", contactId: "C-2" },
  );
  const parsed = new URL(url, "https://example.test");
  assert.strictEqual(parsed.searchParams.has("taskId"), false);
  assert.strictEqual(parsed.searchParams.has("contactId"), false);
  assert.strictEqual(parsed.searchParams.has("quoteId"), false);
  assert.deepEqual(readPlannerUrlState(parsed.search), {
    view: "contacts",
    taskId: "",
    contactId: "C-2",
    quoteId: "",
  });
});
