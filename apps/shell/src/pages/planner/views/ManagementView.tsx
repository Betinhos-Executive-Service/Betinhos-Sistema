// Porte de Tela Planner/src/ManagementView.jsx (sem mudança de comportamento).
import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, Clock3, EyeOff, RotateCcw, Users, UserRound } from "lucide-react";
import { formatDate, getDueBucket, isTaskVisibleToEmployee, priorityById } from '../domain/domain';
import { collectionRows, localDateKey, overviewCollections, overviewWorkload, waitingRows, workloadGroups, workloadTotals } from '../domain/management';

function daysLabel(days: any) {
  return days === 1 ? "1 dia" : `${days} dias`;
}

function duePresentation(task: any) {
  const bucket = getDueBucket(task);
  if (bucket === "overdue") return { accessibleLabel: "Atrasada", className: "is-overdue", Icon: AlertTriangle };
  if (bucket === "today") return { accessibleLabel: "Vence hoje", className: "is-today", Icon: CalendarDays };
  if (bucket === "tomorrow") return { accessibleLabel: "Vence amanhã", className: "is-tomorrow", Icon: Clock3 };
  if (bucket === "upcoming") return { accessibleLabel: "Prazo próximo", className: "is-upcoming", Icon: Clock3 };
  return { accessibleLabel: "Sem prazo", className: "is-no-due", Icon: CalendarDays };
}

export default function ManagementView({ state, currentEmployee, onOpenTask, onCollect, onRegisterWaitingReturn }: any) {
  const [view, setView] = useState<any>("overview");
  const visibleTasks = useMemo(() => (state.tasks || []).filter((task: any) => isTaskVisibleToEmployee(task, currentEmployee, state.teams)), [state.tasks, state.teams, currentEmployee]);
  const collections = useMemo(() => collectionRows(visibleTasks, state.employees, state.teams, state.collectionEvents, new Date()), [visibleTasks, state.employees, state.teams, state.collectionEvents]);
  const workload = useMemo(() => workloadGroups(visibleTasks, state.teams, new Date()), [visibleTasks, state.teams]);
  const workloadTotal = useMemo(() => workloadTotals(visibleTasks, new Date()), [visibleTasks]);
  const waiting = useMemo(() => waitingRows(visibleTasks, state.teams, new Date()), [visibleTasks, state.teams]);
  const collectionToday = localDateKey();
  const detail = view !== "overview";
  const detailTitle = view === "collection" ? "Cobranças prioritárias" : view === "workload" ? "Peso por pessoa/equipe" : "Retornos pendentes";
  return <div className="page-content management-page">
    <div className="page-header">
      <div>{detail && <button className="management-back-link" type="button" onClick={() => setView("overview")}><ArrowLeft size={15} />Voltar ao resumo</button>}<span className="eyebrow">GESTÃO OPERACIONAL</span><h1>{detail ? detailTitle : "Acompanhamento"}</h1><p>{detail ? "Consulte os detalhes sem perder o contexto da operação." : "Identifique o que exige atenção e onde a carga está concentrada."}</p></div>
    </div>
    {!detail && <>
      <ManagementMetrics overdue={collections.length} open={workloadTotal.unique} waiting={waiting.length} onOverdue={() => setView("collection")} onWorkload={() => setView("workload")} onWaiting={() => setView("waiting")} />
      <div className="management-overview">
        <CollectionFocus rows={overviewCollections(collections)} employees={state.employees} today={collectionToday} onOpenTask={onOpenTask} onCollect={onCollect} onViewAll={() => setView("collection")} />
        <WorkloadFocus groups={overviewWorkload(workload, 5)} onOpenTask={onOpenTask} onViewAll={() => setView("workload")} />
      </div>
      <button className="management-return-link" type="button" onClick={() => setView("waiting")}><RotateCcw size={15} />Ver retornos pendentes <b>{waiting.length}</b><ChevronRight size={15} /></button>
    </>}
    {view === "collection" && <CollectionTable rows={collections} employees={state.employees} today={collectionToday} onOpenTask={onOpenTask} onCollect={onCollect} />}
    {view === "workload" && <WorkloadTable groups={workload} totals={workloadTotal} onOpenTask={onOpenTask} />}
    {view === "waiting" && <WaitingTable rows={waiting} onOpenTask={onOpenTask} onRegisterWaitingReturn={onRegisterWaitingReturn} />}
  </div>;
}

function ManagementMetrics({ overdue, open, waiting, onOverdue, onWorkload, onWaiting }: any) {
  return <section className="management-metrics" aria-label="Resumo da operação">
    <button className={`management-metric metric-overdue${overdue ? " has-value" : ""}`} type="button" onClick={onOverdue}>
      <span className="management-metric-label">Atrasadas</span><strong>{overdue}</strong><span className="management-metric-action">{overdue ? "Ver cobrança" : "Operação em dia"}<ChevronRight size={14} /></span>
    </button>
    <button className="management-metric" type="button" onClick={onWorkload}>
      <span className="management-metric-label">Peso aberto</span><strong>{open}</strong><span className="management-metric-action">Ver distribuição <ChevronRight size={14} /></span>
    </button>
    <button className="management-metric" type="button" onClick={onWaiting}>
      <span className="management-metric-label">Retornos travados</span><strong>{waiting}</strong><span className="management-metric-action">Ver dependências <ChevronRight size={14} /></span>
    </button>
  </section>;
}

function CollectionFocus({ rows, employees, today, onOpenTask, onCollect, onViewAll }: any) {
  return <section className="panel management-focus-panel management-overdue-panel" aria-labelledby="management-focus-collection-title"><div className="panel-heading"><div><span className="eyebrow">PRIORIDADE AGORA</span><h2 id="management-focus-collection-title">O que está atrasado</h2><p className="panel-subtitle">Ordenado pelo maior tempo fora do prazo.</p></div><button className="management-focus-link" type="button" onClick={onViewAll}>Ver todas <ChevronRight size={15} /></button></div>{rows.length ? <div className="management-focus-list">{rows.map((row: any) => <CollectionFocusRow key={row.id} row={row} employees={employees} today={today} onOpenTask={onOpenTask} onCollect={onCollect} />)}</div> : <EmptyState icon={CheckCircle2} title="Nenhuma tarefa atrasada" detail="A operação está em dia." />}</section>;
}

function CollectionFocusRow({ row, employees, today, onOpenTask, onCollect }: any) {
  const priority = priorityById(row.priority);
  return <article className="management-focus-row"><div className="management-focus-row-copy"><div className="task-title-inline"><strong>{row.title}</strong>{row.restrictedVisibility && <span className="task-visibility-mark" role="img" title="Visível somente para responsáveis e criador" aria-label="Tarefa oculta: visível somente para responsáveis e criador"><EyeOff size={13} strokeWidth={2.2} aria-hidden="true" /></span>}<span className={`priority priority-${priority.tone}`}>{priority.label}</span></div><ResponsibleDisplay row={row} employees={employees} /><span className="management-focus-due"><AlertTriangle size={13} />{daysLabel(row.overdueDays)} em atraso · {formatDate(row.dueDate)}</span></div><div className="management-focus-actions"><button className="button button-secondary button-small" type="button" onClick={() => onOpenTask(row.id)}>Abrir</button><button className="button button-primary button-small" type="button" disabled={row.collectionDate === today} onClick={() => onCollect(row.id)}>{row.collectionDate === today ? "Cobrada hoje" : "Cobrar"}</button></div></article>;
}

function WorkloadFocus({ groups, onOpenTask, onViewAll }: any) {
  const maxTotal = Math.max(...groups.map((group: any) => group.total), 1);
  return <section className="panel management-focus-panel" aria-labelledby="management-focus-workload-title"><div className="panel-heading"><div><span className="eyebrow">DISTRIBUIÇÃO</span><h2 id="management-focus-workload-title">Peso por pessoa/equipe</h2><p className="panel-subtitle">Quem concentra mais tarefas abertas.</p></div><button className="management-focus-link" type="button" onClick={onViewAll}>Ver carga completa <ChevronRight size={15} /></button></div>{groups.length ? <div className="management-workload-list">{groups.map((group: any) => <WorkloadFocusRow key={group.key} group={group} maxTotal={maxTotal} onOpenTask={onOpenTask} />)}</div> : <EmptyState icon={Users} title="Sem carga ativa" detail="As tarefas abertas aparecerão aqui." />}</section>;
}

function WorkloadFocusRow({ group, maxTotal, onOpenTask }: any) {
  return <article className="management-workload-row"><div className="management-workload-heading"><span className="workload-icon" aria-hidden="true">{group.type === "team" ? <Users size={16} /> : <UserRound size={16} />}</span><div><strong>{group.label}</strong><small>{group.type === "team" ? "Equipe" : "Pessoa"}</small></div><b>{group.total}</b></div><div className="management-loadbar" aria-label={`${group.total} de ${maxTotal} tarefas abertas`}><span style={{ width: `${Math.max(10, (group.total / maxTotal) * 100)}%` }} /></div><div className="management-workload-stats"><span>{group.open} abertas</span><span className={group.today ? "is-today" : ""}>{group.today} hoje</span><span className={group.overdue ? "is-overdue" : ""}>{group.overdue} atrasadas</span></div>{group.tasks[0] && <button className="management-inline-link" type="button" onClick={() => onOpenTask(group.tasks[0].id)}>Abrir mais urgente <ArrowUpRight size={14} /></button>}</article>;
}

function CollectionTable({ rows, employees = [], today, onOpenTask, onCollect }: any) {
  return <section className="panel management-panel"><div className="panel-heading"><div><span className="eyebrow">PRAZO ESTOURADO</span><h2>Central de cobrança</h2></div><span className="panel-count">{rows.length}</span></div>{rows.length ? <div className="management-list">{rows.map((row: any) => { const priority = priorityById(row.priority); return <article className="management-row" key={row.id}><div className="management-row-main"><div className="management-row-title task-title-inline"><strong>{row.title}</strong>{row.restrictedVisibility && <span className="task-visibility-mark" title="Visível somente para responsáveis e criador" aria-label="Tarefa oculta: visível somente para responsáveis e criador"><EyeOff size={13} strokeWidth={2.2} aria-hidden="true" /></span>}<span className={`priority priority-${priority.tone}`}>{priority.label}</span></div><ResponsibleDisplay row={row} employees={employees} /><small>Criada por <strong>{row.creatorName}</strong></small></div><div className="management-row-due"><strong className="danger-text">{daysLabel(row.overdueDays)} em atraso</strong><span><CalendarDays size={14} />{formatDate(row.dueDate)}</span>{row.lastCollectionAt && <small>Última cobrança: {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(row.lastCollectionAt))}</small>}</div><div className="management-row-actions"><button className="button button-secondary button-small" type="button" onClick={() => onOpenTask(row.id)}><ArrowUpRight size={14} />Abrir</button><button className="button button-primary button-small" type="button" disabled={row.collectionDate === today} onClick={() => onCollect(row.id)}>{row.collectionDate === today ? "Cobrada hoje" : "Cobrar agora"}</button></div></article>; })}</div> : <EmptyState icon={CheckCircle2} title="Nenhuma tarefa atrasada" detail="A Central de cobrança está em dia." />}</section>;
}

function ResponsibleDisplay({ row, employees }: any) {
  const employeeById = new Map(employees.map((employee: any) => [String(employee.id), employee]));
  const profiles = (row.assigneeIds || []).map((id: any) => employeeById.get(String(id))).filter(Boolean);
  const fallbackNames = row.assignmentMode === "team" ? [] : (row.assigneeNames || []);
  const names = profiles.length ? profiles.map((employee: any) => employee.name) : fallbackNames;
  const visibleNames = names.slice(0, 4);
  const hiddenCount = names.length - visibleNames.length;
  const label = names.length ? names.join(", ") : "Sem responsável";
  return <div className="responsible-display" title={label} aria-label={`${row.assignmentMode === "team" ? "Responsáveis da equipe" : "Responsáveis"}: ${label}`}>{row.assignmentMode !== "team" && <span className="responsible-display-label">Responsáveis</span>}{names.length ? <span className="responsible-chip-list">{visibleNames.map((name: any, index: any) => <span className="responsible-chip" key={`${name}-${index}`}><span className="avatar avatar-small" aria-hidden="true">{initials(name)}</span>{name}</span>)}{hiddenCount > 0 && <span className="responsible-chip responsible-chip-more">+{hiddenCount}</span>}</span> : <span className="responsible-empty">Sem responsável</span>}</div>;
}

function initials(name: any) {
  return String(name || "?").split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function WorkloadTable({ groups, totals, onOpenTask }: any) {
  const [expandedGroups, setExpandedGroups] = useState<any>({});
  return <section className="panel management-panel"><div className="panel-heading"><div><span className="eyebrow">VOLUME ATIVO</span><h2>Carga por responsabilidade</h2><p className="panel-subtitle">Total geral: <strong>{totals.unique} tarefas únicas</strong> · {totals.today} vencem hoje · {totals.overdue} atrasadas. Uma tarefa compartilhada aparece em cada responsável.</p></div></div>{groups.length ? <div className="workload-grid">{groups.map((group: any) => { const isExpanded = Boolean(expandedGroups[group.key]); const visibleTasks = isExpanded ? group.tasks : group.tasks.slice(0, 5); const remaining = group.tasks.length - visibleTasks.length; return <article className={`workload-card${isExpanded ? " is-expanded" : ""}`} key={group.key}><div className="workload-card-heading"><span className="workload-icon">{group.type === "team" ? <Users size={17} /> : <UserRound size={17} />}</span><div><strong>{group.label}</strong><small>{group.type === "team" ? "Equipe" : "Pessoa"}</small></div><b aria-label={`${group.total} tarefas abertas`}>{group.total}</b></div><div className="workload-stats"><span><strong>{group.open}</strong> abertas</span><span><strong>{group.today}</strong> hoje</span><span className={group.overdue ? "danger-text" : ""}><strong>{group.overdue}</strong> atrasadas</span></div><div className="workload-task-list">{visibleTasks.map((task: any) => { const due = duePresentation(task); const DueIcon = due.Icon; const dateText = task.dueDate ? formatDate(task.dueDate) : "—"; return <button className={`management-inline-link workload-task-link ${due.className}`} key={task.id} title={`Abrir tarefa: ${task.title}`} aria-label={`Abrir tarefa ${task.title}. ${due.accessibleLabel}${task.dueDate ? `, ${dateText}` : ""}`} type="button" onClick={() => onOpenTask(task.id)}><span className="workload-task-copy"><span className="workload-task-icon" aria-hidden="true"><DueIcon size={14} /></span><span className="workload-task-title">{task.title}</span></span><span className="workload-task-due">{dateText}</span><ArrowUpRight size={14} /></button>; })}</div>{group.tasks.length > 5 && <button className="workload-more" type="button" aria-expanded={isExpanded} onClick={() => setExpandedGroups((current: any) => ({ ...current, [group.key]: !isExpanded }))}>{isExpanded ? "Mostrar menos" : `Ver mais ${remaining} ${remaining === 1 ? "tarefa" : "tarefas"}`}<ArrowUpRight size={14} /></button>}</article>; })}</div> : <EmptyState icon={Users} title="Nenhuma carga ativa" detail="As tarefas abertas aparecerão por pessoa ou equipe." />}</section>;
}

function WaitingTable({ rows, onOpenTask, onRegisterWaitingReturn }: any) {
  return <section className="panel management-panel"><div className="panel-heading"><div><span className="eyebrow">DEPENDÊNCIAS</span><h2>Retornos vencidos e sem previsão</h2></div><span className="panel-count">{rows.length}</span></div>{rows.length ? <div className="management-list">{rows.map((row: any) => <article className="management-row" key={row.id}><div className="management-row-main"><div className="task-title-inline"><strong>{row.title}</strong>{row.restrictedVisibility && <span className="task-visibility-mark" title="Visível somente para responsáveis e criador" aria-label="Tarefa oculta: visível somente para responsáveis e criador"><EyeOff size={13} strokeWidth={2.2} aria-hidden="true" /></span>}</div><span>Aguardando {row.waitingTarget}</span><small>{row.waitingTargetType === "external" ? "Parte externa" : "Parte interna"}</small></div><div className="management-row-due"><strong className={row.waitingExpectedDate ? "danger-text" : "warning-text"}>{row.waitingExpectedDate ? `${daysLabel(row.waitingOverdueDays)} vencido` : "Sem previsão"}</strong><span>{row.waitingExpectedDate ? formatDate(row.waitingExpectedDate) : "Defina uma data"}</span></div><div className="management-row-actions"><button className="button button-secondary button-small" type="button" onClick={() => onOpenTask(row.id)}><ArrowUpRight size={14} />Abrir</button>{onRegisterWaitingReturn && <button className="button button-primary button-small" type="button" onClick={() => onRegisterWaitingReturn(row.id)}>Registrar retorno</button>}</div></article>)}</div> : <EmptyState icon={CheckCircle2} title="Nenhum retorno pendente" detail="Dependências vencidas e sem previsão aparecerão aqui." />}</section>;
}

function EmptyState({ icon: Icon, title, detail }: any) {
  return <div className="management-empty"><Icon size={26} /><strong>{title}</strong><span>{detail}</span></div>;
}
