// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { PRIORITIES, STATUSES } from './domain/domain'
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, LayoutDashboard, Lightbulb, ListFilter, Menu, Play, Settings, Target, Users } from 'lucide-react'


// No Sistema Betinhos a barra do shell já navega: a do Planner começa recolhida, com a preferência
// própria que o Tela Planner usava quando aberto com `?host=shell`.
export const EMBEDDED_IN_SHELL = true;
export const SIDEBAR_EXPANDED_KEY = EMBEDDED_IN_SHELL ? "betinhos-tela-planner-sidebar-expanded-shell-v1" : "betinhos-tela-planner-sidebar-expanded-v1";

export const QUOTE_WORKSPACE_V2_ENABLED = import.meta.env.VITE_QUOTES_WORKSPACE_V2 !== "false";
export const QUOTE_HYBRID_V3_ENABLED = import.meta.env.VITE_QUOTES_HYBRID_V3 !== "false";

export const CENTRAL_NAV_ITEMS = [
  ["dashboard", "Início", LayoutDashboard],
  ["board", "Tarefas", ClipboardList],
  ["management", "Gestão", Target],
  ["ideas", "Boas ideias", Lightbulb],
  ["contacts", "Contatos", Users],
  ["quotes", "Cotações", FileText],
  ["settings", "Configurações", Settings],
];

export const MOBILE_NAV_ITEMS = [
  ["dashboard", "Hoje", LayoutDashboard],
  ["board", "Tarefas", ClipboardList],
  ["quotes", "Cotações", FileText],
  ["more", "Mais", Menu],
];

export const TASK_VIEW_ITEMS = [
  ["board", "Quadro", LayoutDashboard],
  ["list", "Lista", ListFilter],
  ["calendar", "Agenda", CalendarDays],
];

export const STATUS_OPTIONS = STATUSES.map((item) => ({
  value: item.id,
  label: item.label,
}));
export const TASK_FILTER_STATUS_OPTIONS = [
  ...STATUS_OPTIONS,
  { value: "cancelled", label: "Cancelada" },
];
export const STATUS_ICONS = {
  todo: ClipboardList,
  doing: Play,
  waiting: Clock3,
  done: CheckCircle2,
};
export const PRIORITY_OPTIONS = PRIORITIES.map((item) => ({
  value: item.id,
  label: item.label,
}));
export const TEAM_OPTIONS = ["Comercial", "Financeiro", "Operação", "Qualidade"];
export const BOARD_GROUP_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "team", label: "Equipe" },
  { value: "assignee", label: "Responsável" },
  { value: "priority", label: "Prioridade" },
  { value: "personalTag", label: "Tag" },
];
export const BOARD_GROUP_STORAGE_KEY = "betinhos-tela-planner-board-group-v1";
export const CALENDAR_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
});
export const TODAY_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});
export const CHECKLIST_VISIBILITY_STORAGE_KEY =
  "betinhos-tela-planner-checklist-visibility-v1";
// Busca de cotações registrada pelo usePlanner (no App.jsx era um `let` de módulo reatribuído).
export const plannerQuoteSearchRef: { current: any } = { current: null };

export const BOARD_SORT_OPTIONS = [
  ["dueDate", "Prazo", "Mais próximo primeiro", "Mais distante primeiro"],
  ["priority", "Prioridade", "Mais alta primeiro", "Mais baixa primeiro"],
  ["updatedAt", "Atualização", "Mais antiga primeiro", "Mais recente primeiro"],
  ["createdAt", "Criação", "Mais antiga primeiro", "Mais recente primeiro"],
  ["title", "Título", "A–Z", "Z–A"],
];
export const BOARD_SORT_DEFAULT = { key: "dueDate", direction: "asc" };
export const BOARD_SORT_STORAGE_KEY = "betinhos-tela-planner-board-sort-v1";

export const LIST_SORT_COLUMNS = [
  ["title", "Tarefa"],
  ["quoteCode", "Vínculo"],
  ["assigneeName", "Responsável"],
  ["dueDate", "Prazo"],
  ["status", "Status"],
];
