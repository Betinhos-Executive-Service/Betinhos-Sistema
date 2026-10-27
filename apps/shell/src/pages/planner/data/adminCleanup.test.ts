import { afterEach, beforeEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { adminCleanup, seedState, type MockState } from "./mock";

// Fixtures parciais, como no teste original em JS.
const fixture = (value: unknown): MockState => value as MockState;

beforeEach(() => { vi.stubGlobal("localStorage", { setItem() {}, getItem() { return null; } }); });
afterEach(() => { vi.unstubAllGlobals(); });

test("limpeza administrativa remove somente tasks concluídas", () => {
  const state = seedState();
  const next = adminCleanup(state, "completed_tasks");
  assert.ok(next.tasks.length < state.tasks.length);
  assert.ok(next.tasks.every((task) => task.status !== "done"));
});

test("limpeza administrativa remove tasks, tags e notificações por ação", () => {
  const state = fixture({ ...seedState(), personalTags: [{ id: "tag-1" }], personalTagAssignments: [{ id: "relation-1" }], notifications: [{ id: "notification-1" }], tasks: [{ id: "task-1", status: "todo", personalTagIds: ["tag-1"] }] });
  assert.deepEqual(adminCleanup(state, "all_tasks").tasks, []);
  const withoutTags = adminCleanup(state, "all_tags");
  assert.deepEqual(withoutTags.personalTags, []);
  assert.deepEqual(withoutTags.personalTagAssignments, []);
  assert.deepEqual(withoutTags.tasks[0].personalTagIds, []);
  assert.deepEqual(adminCleanup(state, "notifications").notifications, []);
});

test("limpeza administrativa rejeita ação desconhecida", () => {
  assert.throws(() => adminCleanup(seedState(), "unknown"), /inválida/);
});

test("limpeza por usuário respeita usuário, status e equipe", () => {
  const state = fixture({ ...seedState(), employees: [{ id: "user-a", name: "Ana", userId: "system-a" }, { id: "user-b", name: "Bia", userId: "system-b" }], teams: [{ id: "team-a", name: "A" }], tasks: [
    { id: "keep-status", status: "done", assigneeIds: ["user-a"], teamIds: ["team-a"] },
    { id: "remove", status: "todo", assigneeIds: ["user-a", "user-b"], teamIds: ["team-a"] },
    { id: "keep-user", status: "todo", assigneeIds: ["user-b"], teamIds: ["team-a"] },
  ] });
  const request = { action: "user_tasks", employeeId: "user-a", status: "todo", teamId: "team-a" };
  assert.deepEqual(adminCleanup(state, request).tasks.map((task) => task.id), ["keep-status", "keep-user"]);
  const unassigned = adminCleanup(state, { ...request, action: "remove_user_assignments" });
  assert.deepEqual(unassigned.tasks.find((task) => task.id === "remove")!.assigneeIds, ["user-b"]);
});

test("limpeza por usuário remove notificações, tags e contatos do alvo", () => {
  const state = fixture({ ...seedState(), personalTags: [{ id: "tag-a", ownerUserId: "system-a" }, { id: "tag-b", ownerUserId: "system-b" }], personalTagAssignments: [{ tagId: "tag-a" }, { tagId: "tag-b" }], notifications: [{ id: "n-a", recipientEmployeeId: "user-a" }, { id: "n-b", recipientEmployeeId: "user-b" }], contacts: [{ id: "c-a", assigneeIds: ["user-a"] }, { id: "c-b", ownerEmployeeId: "user-b" }] });
  assert.deepEqual(adminCleanup(state, { action: "user_notifications", employeeId: "user-a" }).notifications!.map((item) => item.id), ["n-b"]);
  assert.deepEqual(adminCleanup(state, { action: "user_tags", userId: "system-a" }).personalTags!.map((item) => item.id), ["tag-b"]);
  assert.deepEqual(adminCleanup(state, { action: "user_contacts", employeeId: "user-a" }).contacts!.map((item) => item.id), ["c-b"]);
});

test("limpeza global cobre equipes, atividade, anexos, vínculos, prazos e todos os dados", () => {
  const state = fixture({ ...seedState(), personalTags: [{ id: "tag" }], tasks: [{ id: "task", dueDate: "2026-09-09", assigneeIds: ["user-a"], teamIds: ["team-a"], comments: [{}], returns: [{}], history: [{}], attachments: [{}] }] });
  assert.deepEqual(adminCleanup(state, "all_teams").teams, []);
  assert.deepEqual(adminCleanup(state, "task_activity").tasks[0].history, []);
  assert.deepEqual(adminCleanup(state, "task_attachments").tasks[0].attachments, []);
  assert.deepEqual(adminCleanup(state, "task_assignments").tasks[0].assigneeIds, []);
  assert.equal(adminCleanup(state, "task_due_dates").tasks[0].dueDate, "");
  assert.deepEqual(adminCleanup(state, "all_planner_data").tasks, []);
});
