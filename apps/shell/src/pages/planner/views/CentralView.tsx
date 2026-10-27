// Porte de Tela Planner/src/CentralView.jsx (sem mudança de comportamento).
import React, { memo, useCallback, useMemo } from "react";
import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, EyeOff, Users } from "lucide-react";
import { formatDate } from '../domain/domain';
import AssigneeDisplay from '../components/AssigneeDisplay';
import { filterWorkItems, sortWorkItems, workItemStats } from '../domain/workItems';

const SOURCE_LABELS = { task: "Tarefa", quote_followup: "Acompanhamento de cotação", quality_error: "Ocorrência", quality_action: "Ação de qualidade" };
const STATUS_LABELS = { todo: "A fazer", doing: "Em andamento", waiting: "Aguardando", done: "Concluído", cancelled: "Cancelado" };
const SOURCE_OPTIONS = [
  { value: "all", label: "Todas as origens" },
  { value: "task", label: "Tarefas" },
  { value: "quote_followup", label: "Acompanhamentos" },
  { value: "quality_error", label: "Ocorrências" },
  { value: "quality_action", label: "Ações" },
];

function SourceBadge({ source }: any) {
  return <span className={`source-badge source-${source === "task" ? "neutral" : source === "quote_followup" ? "action" : "warning"}`}>{(SOURCE_LABELS as any)[source] || "Origem"}</span>;
}

function hasActiveFilters(filters: any) {
  return Boolean(filters?.query?.trim()) || Boolean(filters?.assignee?.length) || Boolean(filters?.status?.length) || Boolean(filters?.priority?.length) || Boolean(filters?.source?.length) || Boolean(filters?.team);
}

export default function CentralView({ state, mode = "mine", currentEmployee, filters, filterBar, onClearFilters, onChangeMode, onOpenTask, onOpenSource, onCompleteTask }: any) {
  const mineOnly = mode === "mine";
  const allItems = state.workItems || [];
  const scopedItems = mineOnly && !currentEmployee ? [] : allItems;
  const activeItems = useMemo(() => filterWorkItems(scopedItems), [scopedItems]);
  const filteredItems = useMemo(() => sortWorkItems(filterWorkItems(scopedItems, filters)), [scopedItems, filters]);
  const items = useMemo(() => mineOnly ? filteredItems.filter((item) => item.dueBucket !== "none") : filteredItems, [filteredItems, mineOnly]);
  const stats = useMemo(() => workItemStats(activeItems), [activeItems]);
  const deadlineSections = useMemo(() => {
    const sections = new Map<string, any>([
      ["overdue", { key: "overdue", label: "Atrasadas", items: [] }],
      ["today", { key: "today", label: "Vencem hoje", items: [] }],
      ["tomorrow", { key: "tomorrow", label: "Vencem amanhã", items: [] }],
      ["upcoming", { key: "upcoming", label: "Próximas tarefas", items: [] }],
    ]);
    items.forEach((item) => sections.get((item.dueBucket as any))?.items.push((item as any)));
    return [...sections.values()];
  }, [items]);
  const open = useCallback((item: any) => item.source === "task" || item.source === "quote_followup" ? onOpenTask(item.sourceRecordId) : onOpenSource(item), [onOpenSource, onOpenTask]);
  const emptyMessage = !currentEmployee && mineOnly
    ? { title: "Usuário sem vínculo", detail: "Seu usuário Dataverse ainda não está associado a um funcionário administrativo." }
    : mineOnly && !items.length && activeItems.length
      ? { title: "Nenhuma tarefa com prazo", detail: "Tarefas sem prazo continuam disponíveis no Quadro e na Lista." }
    : !activeItems.length
      ? { title: "Nenhuma pendência ativa", detail: "Quando surgir uma nova obrigação, ela aparecerá aqui." }
      : { title: "Nenhum resultado", detail: "Tente remover um filtro ou buscar por outro termo." };

  return <div className="page-content">
    <PageHeader mode={mode} onChangeMode={onChangeMode} />
    {filterBar}
    <div className="metric-grid central-metrics"><Metric label="Pendências abertas" value={stats.open} icon={CheckCircle2} /><Metric label="Atrasadas" value={stats.overdue} icon={Clock3} tone="danger" /><Metric label="Em andamento" value={stats.doing} icon={ArrowUpRight} tone="action" /><Metric label="Aguardando" value={stats.waiting} icon={Users} tone="warning" /></div>
    <section className="panel central-panel">
      <div className="panel-heading"><div><span className="eyebrow">{mineOnly ? "MINHAS PENDÊNCIAS" : "EQUIPE ADMINISTRATIVA"}</span><h2>{mineOnly ? "Próximos movimentos" : "Pendências da equipe"}</h2></div><span className="panel-count">{items.length}</span></div>
      {items.length > 0 && <div className="central-table-head" aria-hidden="true"><span>Item</span><span>Responsável</span><span>Prazo</span><span>Status</span><span>Ações</span></div>}
      {mineOnly ? <div className="central-deadline-sections">
        {deadlineSections.filter((section) => section.items.length > 0).map((section) => <section className={`central-deadline-section central-deadline-${section.key}`} key={section.key}>
          <div className="central-section-heading"><h3>{section.label}</h3><span className="section-count">{section.items.length}</span></div>
          <div className="central-list">{section.items.map((item: any) => <CentralRow key={(item as any).id} item={item} onOpen={open} onComplete={onCompleteTask} />)}</div>
        </section>)}
        {!items.length && <div className="central-empty"><strong>{emptyMessage.title}</strong><span>{emptyMessage.detail}</span>{hasActiveFilters(filters) && onClearFilters && <button className="button button-secondary" type="button" onClick={onClearFilters}>Limpar filtros</button>}</div>}
      </div> : <div className="central-list">
        {items.map((item) => <CentralRow key={item.id} item={item} onOpen={open} onComplete={onCompleteTask} />)}
        {!items.length && <div className="central-empty"><strong>{emptyMessage.title}</strong><span>{emptyMessage.detail}</span>{hasActiveFilters(filters) && onClearFilters && <button className="button button-secondary" type="button" onClick={onClearFilters}>Limpar filtros</button>}</div>}
      </div>}
    </section>
  </div>;
}

const CentralRow = memo(function CentralRow({ item, onOpen, onComplete }: any) {
  const statusLabel = item.statusLabel || (STATUS_LABELS as any)[item.statusGroup] || item.sourceStatus || "A fazer";
  const canComplete = Boolean(onComplete) && ["task", "quote_followup"].includes(item.source) && !item.isTerminal;
  return <article className="central-row">
    <button className="central-row-open" type="button" onClick={() => onOpen(item)} aria-label={`Abrir ${item.title}`}>
      <div className="central-row-main"><SourceBadge source={item.source} /><div className="task-title-inline"><strong>{item.title}</strong>{item.restrictedVisibility && <span className="task-visibility-mark" role="img" title="Visível somente para responsáveis e criador" aria-label="Tarefa oculta: visível somente para responsáveis e criador"><EyeOff size={13} strokeWidth={2.2} aria-hidden="true" /></span>}</div><span>{item.context}</span></div>
      <div className="central-row-meta"><AssigneeDisplay value={item.assigneeProfiles?.length ? item.assigneeProfiles : item.assigneeNames || item.assigneeName} small primaryName={item.primaryAssigneeName} consultantNames={item.consultantNames || []} /><span className={item.isOverdue ? "danger-text" : ""}><CalendarDays size={13} aria-hidden="true" />{formatDate(item.dueAt)}</span><span className={`central-status central-${item.statusGroup}`}>{statusLabel}</span><ArrowUpRight size={16} aria-hidden="true" /></div>
    </button>
    {canComplete && <button className="central-row-complete" type="button" onClick={() => onComplete(item.sourceRecordId)} aria-label={`Concluir ${item.title}`}><CheckCircle2 size={15} />Concluir</button>}
  </article>;
});

function PageHeader({ mode, onChangeMode }: any) {
  const mine = mode === "mine";
  return <div className="page-header"><div><span className="eyebrow">OPERAÇÃO ADMINISTRATIVA</span><h1>{mine ? "Minhas pendências" : "Equipe"}</h1><p>{mine ? "Veja o que precisa da sua atenção e qual é o próximo movimento." : "Acompanhe atrasos, responsáveis e obrigações da equipe."}</p></div><div className="header-actions"><div className="task-scope-selector" aria-label="Escopo das pendências"><button className={mine ? "task-scope-button active" : "task-scope-button"} type="button" onClick={() => onChangeMode("mine")} aria-pressed={mine}><CheckCircle2 size={15} />Minhas</button><button className={!mine ? "task-scope-button active" : "task-scope-button"} type="button" onClick={() => onChangeMode("team")} aria-pressed={!mine}><Users size={15} />Equipe</button></div></div></div>;
}

function Metric({ label, value, icon: Icon, tone = "neutral" }: any) {
  return <div className={`metric-card metric-${tone}`}><div className="metric-icon"><Icon size={18} /></div><div><span>{label}</span><strong>{value}</strong></div></div>;
}
