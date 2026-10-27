import { expect, test } from 'vitest'
import { businessDaysSince, dailyReminderRows, deadlineReminderType, deadlineRole, groupDailyDigest, isTaskWaitingForEmployee, notificationDedupeKey, notificationRecipients, previousBusinessDay, unreadCount, validateDeadlineChange } from "./notifications";

test("D-1 útil de segunda-feira cai na sexta-feira", () => {
  expect(previousBusinessDay("2026-08-24")).toBe("2026-08-21");
  expect(deadlineReminderType({ dueDate: "2026-08-24", status: "todo" }, "2026-08-21")).toBe("due_soon");
});

test("classifica vencimento, atraso e ignora status terminal", () => {
  expect(deadlineReminderType({ dueDate: "2026-08-24", status: "doing" }, "2026-08-24")).toBe("due_today");
  expect(deadlineReminderType({ dueDate: "2026-08-23", status: "waiting" }, "2026-08-24")).toBe("overdue");
  expect(deadlineReminderType({ dueDate: "2026-08-23", status: "done" }, "2026-08-24")).toBe("");
  expect(deadlineReminderType({ dueDate: "2026-08-23", status: "cancelled" }, "2026-08-24")).toBe("");
});

test("criador altera prazo sem motivo e demais usuários justificam a mudança", () => {
  const task = { dueDate: "2026-08-24", creatorUserId: "user-owner", assigneeIds: ["employee-assignee"] };
  expect(deadlineRole(task, { userId: "user-owner", id: "employee-assignee" })).toBe("creator");
  expect(validateDeadlineChange({ task, employee: { userId: "user-owner" }, nextDueDate: "2026-08-25" }).allowed).toBe(true);
  expect(validateDeadlineChange({ task, employee: { id: "employee-assignee" }, nextDueDate: "2026-08-25" }).allowed).toBe(false);
  expect(validateDeadlineChange({ task, employee: { id: "employee-assignee" }, nextDueDate: "2026-08-25", reason: "Cliente pediu nova data" }).allowed).toBe(true);
  expect(validateDeadlineChange({ task, employee: { id: "employee-other" }, nextDueDate: "2026-08-25" }).allowed).toBe(false);
  expect(validateDeadlineChange({ task, employee: { id: "employee-other" }, nextDueDate: "2026-08-25", reason: "Ajuste operacional" }).allowed).toBe(true);
});

test("destinatários removem ator, duplicados e atribuições antigas", () => {
  expect(notificationRecipients({ type: "assignment", assigneeIds: ["a", "b"], previousAssigneeIds: ["a"], actorEmployeeId: "x" })).toStrictEqual(["b"]);
  expect(notificationRecipients({ type: "status", creatorEmployeeId: "c", assigneeIds: ["a", "b"], previousAssigneeIds: ["a"], nextStatus: "done", actorEmployeeId: "a" })).toStrictEqual(["c", "b"]);
  expect(notificationRecipients({ type: "status", creatorEmployeeId: "c", assigneeIds: ["a", "b"], previousAssigneeIds: ["a"], nextStatus: "doing", actorEmployeeId: "a" })).toStrictEqual([]);
  expect(notificationRecipients({ type: "assignees", assigneeIds: ["a", "b"], previousAssigneeIds: ["a", "c"], actorEmployeeId: "a" })).toStrictEqual(["b", "c"]);
  expect(notificationRecipients({ type: "mention", mentionedEmployeeIds: ["a", "a", "b"], actorEmployeeId: "b" })).toStrictEqual(["a"]);
  expect(notificationRecipients({ type: "waiting", creatorEmployeeId: "c", assigneeIds: ["a"], mentionedEmployeeIds: ["b"], actorEmployeeId: "a" })).toStrictEqual(["c", "b"]);
  expect(notificationRecipients({ type: "waiting_return", creatorEmployeeId: "c", assigneeIds: ["a", "b"], actorEmployeeId: "a" })).toStrictEqual(["c", "b"]);
});

test("sinaliza Aguardando apenas para criador ou responsável", () => {
  const task = { status: "waiting", creatorEmployeeId: "creator", assigneeIds: ["assignee"] };
  expect(isTaskWaitingForEmployee(task, { id: "assignee" })).toBe(true);
  expect(isTaskWaitingForEmployee(task, { id: "creator" })).toBe(true);
  expect(isTaskWaitingForEmployee(task, { id: "viewer" })).toBe(false);
  expect(isTaskWaitingForEmployee({ ...task, status: "doing" }, { id: "assignee" })).toBe(false);
});

test("chave idempotente e badge de não lidas são determinísticos", () => {
  const input = { recipientId: "EMP-1", taskId: "TASK-1", type: "due_today", referenceDate: "2026-08-24" };
  expect(notificationDedupeKey(input)).toBe(notificationDedupeKey(input));
  expect(unreadCount([{ readAt: "" }, { readAt: "2026-08-24T10:00:00Z" }, {}])).toBe(2);
});

test("resumo diário cobra o principal e sinaliza identidade ausente", () => {
  const tasks = [{ id: "t1", dueDate: "2026-08-24", status: "doing", assigneeIds: ["a", "a", "b"] }];
  const employees = [{ id: "a", externalNotificationsAvailable: true }, { id: "b", externalNotificationsAvailable: false }];
  const rows = dailyReminderRows(tasks, employees, "2026-08-24");
  expect(rows.length).toBe(1);
  expect(rows[0].recipientEmployeeId).toBe("a");
  const groups = groupDailyDigest(rows);
  expect(Object.keys(groups).sort()).toStrictEqual(["a"]);
  expect(groups.a.due_today.length).toBe(1);
});

test("cobrança diária inclui criador no primeiro dia útil e não dispara D-1", () => {
  expect(businessDaysSince("2026-08-21", "2026-08-24")).toBe(1);
  const tasks = [
    { id: "late", dueDate: "2026-08-21", status: "doing", assigneeIds: ["a"], creatorEmployeeId: "c" },
    { id: "tomorrow", dueDate: "2026-08-25", status: "doing", assigneeIds: ["a"], creatorEmployeeId: "c" },
  ];
  const rows = dailyReminderRows(tasks, [], "2026-08-24");
  expect(rows.filter((row) => row.taskId === "late").map((row) => row.recipientEmployeeId).sort()).toStrictEqual(["a", "c"]);
  expect(rows.some((row) => row.taskId === "tomorrow")).toBe(false);
});
