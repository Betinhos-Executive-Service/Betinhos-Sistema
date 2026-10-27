// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { BOARD_GROUP_OPTIONS, BOARD_GROUP_STORAGE_KEY, BOARD_SORT_DEFAULT, BOARD_SORT_OPTIONS, BOARD_SORT_STORAGE_KEY, CHECKLIST_VISIBILITY_STORAGE_KEY } from './constants'
import { PRIORITIES, STATUSES, normalizeAssigneeNames, normalizePersonalTagIds, normalizeText, sortTasks, taskDisplayDueDate } from './domain/domain'
import { useEffect, useState } from 'react'


export function readBoardGroupPreference() {
  try {
    const saved = localStorage.getItem(BOARD_GROUP_STORAGE_KEY);
    return BOARD_GROUP_OPTIONS.some((option) => option.value === saved) ? saved : "status";
  } catch {
    return "status";
  }
}

export function boardGroupValues(task: any, groupBy: any) {
  if (groupBy === "status") return [task.status];
  if (groupBy === "team") return task.teamNames?.length ? task.teamNames : [task.teamName || "Sem equipe"];
  if (groupBy === "assignee") return task.assigneeNames?.length ? task.assigneeNames : [task.assigneeName || "Não atribuído"];
  if (groupBy === "priority") return [task.priority || "medium"];
  const tagIds = normalizePersonalTagIds(task.personalTagIds);
  return tagIds.length ? tagIds : ["__none__"];
}

export function boardColumns(groupBy: any, tasks: any, teams: any = [], personalTags: any = [], employees: any = []) {
  if (groupBy === "status") return STATUSES.map((status) => ({ ...status, groupValue: status.id }));
  if (groupBy === "priority") return PRIORITIES.map((priority) => ({ ...priority, groupValue: priority.id }));
  if (groupBy === "team") {
    const names = [...new Set([
      ...teams.map((team: any) => team.name),
      ...tasks.flatMap((task: any) => boardGroupValues(task, groupBy)),
    ].filter(Boolean))];
    return names.map((name) => ({ id: `team:${name}`, label: name, groupValue: name }));
  }
  if (groupBy === "assignee") {
    const names = [...new Set([
      ...employees.map((employee: any) => employee.name),
      ...tasks.flatMap((task: any) => boardGroupValues(task, groupBy)),
    ].filter(Boolean))];
    return names.map((name) => ({ id: `assignee:${name}`, label: name, groupValue: name }));
  }
  const tags = personalTags.filter((tag: any) => !tag.archived);
  return [
    ...tags.map((tag: any) => ({ id: `tag:${tag.id}`, label: tag.name, groupValue: tag.id, color: tag.color })),
    { id: "tag:__none__", label: "Sem tag", groupValue: "__none__" },
  ];
}

export function createDefaultFilters() {
  return {
    query: "",
    assignee: [],
    status: [],
    priority: [],
    source: [],
    team: [],
    personalTag: [],
  };
}

export function readChecklistVisibility() {
  try {
    return JSON.parse(
      localStorage.getItem(CHECKLIST_VISIBILITY_STORAGE_KEY) || "{}",
    );
  } catch {
    return {};
  }
}

export function launchQuoteId(search = window.location.search) {
  const params = new URLSearchParams(search);
  const data = new URLSearchParams(
    (params.get("data") || "").replace(/^\?/, ""),
  );
  const source = params.get("source") || data.get("source") || "";
  if (source !== "quote") return "";
  return params.get("sourceId") || data.get("sourceId") || "";
}

export function resolveCurrentEmployee(employees: any, live: any, currentUserEmail = "") {
  if (!live)
    return (
      (employees || []).find((employee: any) => employee.isMockCurrentUser) || null
    );
  const normalizedEmail = String(currentUserEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  return (
    (employees || []).find(
      (employee: any) =>
        String(employee.emailMicrosoft || "").trim().toLowerCase() ===
        normalizedEmail,
    ) || null
  );
}

export function useMediaQuery(query: any) {
  const getMatches = () =>
    typeof window !== "undefined" && window.matchMedia?.(query).matches;
  const [matches, setMatches] = useState<any>(getMatches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, [query]);

  return matches;
}

export function shortAssigneeName(name = "Não atribuído") {
  const value = String(name || "Não atribuído").trim();
  if (!value || /^não atribuído$/i.test(value)) return value || "Não atribuído";
  const names = value.split(/\s*,\s*/).filter(Boolean);
  const first = names[0];
  const parts = first.split(/\s+/);
  const shortName =
    parts.length > 1
      ? `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
      : first;
  return names.length > 1 ? `${shortName} +${names.length - 1}` : shortName;
}

export function readBoardSortPreference() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOARD_SORT_STORAGE_KEY) || "null");
    if (BOARD_SORT_OPTIONS.some(([key]: any) => key === saved?.key) && ["asc", "desc"].includes(saved?.direction)) return saved;
  } catch {}
  return BOARD_SORT_DEFAULT;
}

export function tasksForView(tasks: any) {
  return tasks;
}

export function compareListTasks(left: any, right: any, key: any, employee: any, teams: any) {
  if (key === "dueDate") {
    const leftDate = taskDisplayDueDate(left, employee, teams) || "9999-12-31";
    const rightDate = taskDisplayDueDate(right, employee, teams) || "9999-12-31";
    return leftDate.localeCompare(rightDate);
  }
  if (key === "status")
    return (
      STATUSES.findIndex((item) => item.id === left.status) -
      STATUSES.findIndex((item) => item.id === right.status)
    );
  const value = (task: any) =>
    key === "assigneeName"
      ? normalizeAssigneeNames(task.assigneeNames || task.assigneeName).join(
          ", ",
        )
      : task[key];
  return normalizeText(value(left)).localeCompare(normalizeText(value(right)));
}

export function sortListTasks(tasks: any, sort: any, employee: any, teams: any) {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...tasks].sort(
    (left, right) =>
      compareListTasks(left, right, sort.key, employee, teams) * direction ||
      String(left.id).localeCompare(String(right.id)),
  );
}

export function getDropIndex(tasksByColumn: any, columnId: any, draggedTask: any, employee: any, teams: any) {
  if (!draggedTask) return 0;
  const destination = tasksByColumn[columnId] || [];
  return sortTasks(
    [...destination, { ...draggedTask }],
    employee,
    teams,
  ).findIndex((taskItem) => taskItem.id === draggedTask.id);
}

export function calendarDateKey(date: any) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function calendarDateFromKey(value: any) {
  return new Date(`${value}T12:00:00`);
}

export function shiftCalendarDate(value: any, amount: any) {
  const date = calendarDateFromKey(value);
  date.setDate(date.getDate() + amount);
  return calendarDateKey(date);
}

export function calendarDaysBetween(startKey: any, endKey: any) {
  const start = calendarDateFromKey(startKey);
  const end = calendarDateFromKey(endKey);
  return Math.max(0, Math.round(((end as any) - (start as any)) / 86400000));
}

export function formatCommentTimestamp(value: any) {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatRelativeTimestamp(value: any) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "agora";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

export function formatExecutionDay(value: any) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "RECENTE";
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "HOJE";
  if (date.toDateString() === yesterday.toDateString()) return "ONTEM";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
