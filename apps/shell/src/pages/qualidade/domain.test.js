import { test } from "vitest";
import assert from "node:assert/strict";
import { agendaActions, applyChoiceDefinitions, calculateStats, defaultChoiceDefinitions, filterErrors, formatDate, OPTIONS, validateAction, validateChoiceLabel, validateError } from "./domain.js";

test("formata datas válidas e retorna travessão para valores ausentes ou inválidos", () => {
  assert.equal(formatDate("2026-07-13T12:34:00"), "13/07/2026");
  assert.equal(formatDate("2026-07-13T12:34:00", true), "13/07/2026, 12:34");
  assert.equal(formatDate("inválida"), "—");
  assert.equal(formatDate(null, true), "—");
});

test("calcula indicadores abertos, críticos e vencidos", () => {
  const now = new Date("2026-07-13T12:00:00");
  const errors = [
    { cr40f_status: 100000000, cr40f_gravidade: 100000003, cr40f_dataocorrencia: "2026-07-10T10:00:00" },
    { cr40f_status: 100000004, cr40f_gravidade: 100000001, cr40f_dataocorrencia: "2026-07-01T10:00:00", cr40f_dataresolucao: "2026-07-03T10:00:00" },
  ];
  const actions = [{ cr40f_status: 100000000, cr40f_prazo: "2026-07-12T10:00:00" }];
  assert.deepEqual(calculateStats(errors, actions, now), { open: 1, critical: 1, overdue: 1, resolved30: 1, averageDays: 2 });
});

test("calcula indicadores em fixture sintética maior sem alterar regras", () => {
  const now = new Date("2026-07-13T12:00:00");
  const errors = [
    ...Array.from({ length: 20 }, (_, index) => ({
      cr40f_status: 100000000,
      cr40f_gravidade: 100000001,
      cr40f_dataocorrencia: `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00`,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      cr40f_status: 100000001,
      cr40f_gravidade: 100000003,
      cr40f_dataocorrencia: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00`,
    })),
    { cr40f_status: 100000004, cr40f_gravidade: 100000001, cr40f_dataocorrencia: "2026-07-01T10:00:00", cr40f_dataresolucao: "2026-07-03T10:00:00" },
    { cr40f_status: 100000004, cr40f_gravidade: 100000001, cr40f_dataocorrencia: "2026-07-01T10:00:00", cr40f_dataresolucao: "2026-07-05T10:00:00" },
    { cr40f_status: 100000004, cr40f_gravidade: 100000001, cr40f_dataocorrencia: "2026-07-01T10:00:00", cr40f_dataresolucao: "2026-07-07T10:00:00" },
    { cr40f_status: 100000004, cr40f_gravidade: 100000001, cr40f_dataocorrencia: "2026-07-01T10:00:00", cr40f_dataresolucao: "2026-07-09T10:00:00" },
    { cr40f_status: 100000004, cr40f_gravidade: 100000001, cr40f_dataocorrencia: "inválida", cr40f_dataresolucao: "2026-07-10T10:00:00" },
    { cr40f_status: 100000004, cr40f_gravidade: 100000001, cr40f_dataocorrencia: "2026-05-01T10:00:00", cr40f_dataresolucao: "2026-06-01T10:00:00" },
    { cr40f_status: 100000005, cr40f_gravidade: 100000002, cr40f_dataocorrencia: "2026-05-10T10:00:00", cr40f_dataresolucao: "2026-06-10T10:00:00" },
  ];
  const actions = [
    ...Array.from({ length: 7 }, (_, index) => ({
      cr40f_status: 100000000,
      cr40f_prazo: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00`,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      cr40f_status: 100000003,
      cr40f_prazo: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00`,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      cr40f_status: 100000001,
      cr40f_prazo: `2026-07-${String(index + 14).padStart(2, "0")}T09:00:00`,
    })),
  ];

  assert.deepEqual(calculateStats(errors, actions, now), {
    open: 25,
    critical: 5,
    overdue: 7,
    resolved30: 5,
    averageDays: 5,
  });
});

test("filtra ocorrência por texto e status", () => {
  const errors = [
    { cr40f_codigo: "ERR-000001", cr40f_titulo: "Atraso no aeroporto", cr40f_status: 100000000 },
    { cr40f_codigo: "ERR-000002", cr40f_titulo: "Falha sistêmica", cr40f_status: 100000004 },
  ];
  assert.equal(filterErrors(errors, { query: "aeroporto", status: 100000000 }).length, 1);
});

test("filtros múltiplos aplicam OR e lista vazia mantém todos os registros", () => {
  const errors = [
    { id: "a", cr40f_status: 100000000, cr40f_categoria: 100000000, cr40f_gravidade: 100000001, cr40f_responsavelid: "ana" },
    { id: "b", cr40f_status: 100000001, cr40f_categoria: 100000001, cr40f_gravidade: 100000002, cr40f_responsavelid: "bia" },
    { id: "c", cr40f_status: 100000004, cr40f_categoria: 100000002, cr40f_gravidade: 100000003, cr40f_responsavelid: "caio" },
  ];

  assert.deepEqual(
    filterErrors(errors, { status: [100000000, 100000004], responsible: ["ana", "caio"] }).map((item) => item.id),
    ["a", "c"],
  );
  assert.equal(filterErrors(errors, { status: [], category: [], severity: [], responsible: [] }).length, 3);
});

test("agenda separa ações de hoje e atrasadas", () => {
  const now = new Date("2026-07-13T12:00:00");
  const actions = [
    { cr40f_status: 100000000, cr40f_agendadoem: "2026-07-13T15:00:00", cr40f_prazo: "2026-07-14T10:00:00" },
    { cr40f_status: 100000001, cr40f_agendadoem: "2026-07-11T10:00:00", cr40f_prazo: "2026-07-12T10:00:00" },
  ];
  assert.equal(agendaActions(actions, "today", now).length, 1);
  assert.equal(agendaActions(actions, "all", now, "overdue").length, 1);
});

test("agenda prioriza pendentes e ordena por data crescente", () => {
  const actions = [
    { cr40f_status: 100000003, cr40f_agendadoem: "2026-07-15T10:00:00" },
    { cr40f_status: 100000000, cr40f_agendadoem: "2026-07-14T10:00:00" },
    { cr40f_status: 100000001, cr40f_agendadoem: "2026-07-13T10:00:00" },
  ];
  const pending = agendaActions(actions, "all", new Date("2026-07-13T12:00:00"), "pending");
  assert.deepEqual(pending.map((item) => item.cr40f_agendadoem), ["2026-07-13T10:00:00", "2026-07-14T10:00:00"]);
  assert.equal(agendaActions([
    { cr40f_status: 100000000, cr40f_responsavelid: "employee-1", cr40f_agendadoem: "2026-07-13T10:00:00" },
    { cr40f_status: 100000000, _ownerid_value: "owner-2", cr40f_agendadoem: "2026-07-14T10:00:00" },
  ], "all", new Date("2026-07-13T12:00:00"), "pending", "mine", "employee-1").length, 1);
});

test("agenda preserva fallback de prazo e combina filtros sem mudar saída", () => {
  const now = new Date("2026-07-13T12:00:00");
  const actions = [
    { id: "due-only", cr40f_status: 100000000, cr40f_prazo: "2026-07-13T09:00:00", cr40f_responsavelid: "employee-1" },
    { id: "today", cr40f_status: 100000001, cr40f_agendadoem: "2026-07-13T13:00:00", cr40f_prazo: "2026-07-14T10:00:00", _ownerid_value: "employee-1" },
    { id: "week", cr40f_status: 100000000, cr40f_agendadoem: "2026-07-15T10:00:00", cr40f_prazo: "2026-07-15T10:00:00", _cr40f_responsavel_value: "employee-1" },
    { id: "done", cr40f_status: 100000003, cr40f_agendadoem: "2026-07-14T08:00:00", cr40f_prazo: "2026-07-12T10:00:00", cr40f_responsavelid: "employee-1" },
    { id: "other-user", cr40f_status: 100000000, cr40f_agendadoem: "2026-07-14T09:00:00", cr40f_prazo: "2026-07-14T09:00:00", cr40f_responsavelid: "employee-2" },
    { id: "later", cr40f_status: 100000000, cr40f_agendadoem: "2026-07-21T10:00:00", cr40f_prazo: "2026-07-21T10:00:00", cr40f_responsavelid: "employee-1" },
  ];

  assert.deepEqual(
    agendaActions(actions, "week", now, "pending", "mine", "employee-1").map((item) => item.id),
    ["due-only", "today", "week"],
  );
  assert.deepEqual(
    agendaActions(actions, "overdue", now, "all", "mine", "employee-1").map((item) => item.id),
    ["due-only"],
  );
});

test("agenda ignora datas inválidas ou ausentes em janelas e mantém itens sem data em modo all", () => {
  const now = new Date("2026-07-13T12:00:00");
  const actions = [
    { id: "scheduled", cr40f_status: 100000000, cr40f_agendadoem: "2026-07-13T13:00:00" },
    { id: "invalid", cr40f_status: 100000000, cr40f_agendadoem: "inválida", cr40f_prazo: "também inválida" },
    { id: "empty", cr40f_status: 100000000 },
  ];

  assert.deepEqual(agendaActions(actions, "today", now).map((item) => item.id), ["scheduled"]);
  assert.deepEqual(agendaActions(actions, "all", now).map((item) => item.id), ["scheduled", "invalid", "empty"]);
});

test("valida solução e resultado obrigatórios", () => {
  assert.match(validateError({ cr40f_titulo: "Erro", cr40f_dataocorrencia: "2026-07-13", cr40f_descricao: "Falha", cr40f_status: 100000004 }), /solução/);
  assert.match(validateAction({ cr40f_titulo: "Ação", cr40f_descricao: "Tratar", cr40f_prazo: "2026-07-14", responsavelId: "1", cr40f_status: 100000003 }), /resultado/);
});

test("valida nomes duplicados e aplica metadata dinâmica", () => {
  const definitions = defaultChoiceDefinitions();
  const categories = definitions.find((item) => item.key === "category");
  assert.match(validateChoiceLabel("Planejamento", categories.options), /existe/);
  assert.equal(validateChoiceLabel("Risco climático", categories.options), "");
  categories.options = [...categories.options, { value: 100001000, label: "Risco climático", locked: false }];
  applyChoiceDefinitions(definitions);
  assert.equal(OPTIONS.category[100001000], "Risco climático");
  delete OPTIONS.category[100001000];
});
