import React, { useMemo, useState } from "react";
import {
  AlertOctagon, BarChart3, CalendarDays, ChevronRight, ClipboardCheck, Clock3, LayoutDashboard,
  PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal, Target, Timer, TrendingUp, Users,
} from "lucide-react";
import { OPTIONS, agendaActions, choiceEntries, formatDate, isOpenAction, isOverdue } from "./domain";
import SearchableSelect, { SearchableMultiSelect } from "./SearchableSelect";


function countByValue(items, field) {
  const counts = new Map();
  for (const item of items) {
    const value = Number(item[field]);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "short" });

function shortMonth(value) {
  return SHORT_MONTH_FORMATTER.format(value).replace(".", "");
}

export function StatusBadge({ value, type = "error" }) {
  const source = type === "action" ? OPTIONS.actionStatus : OPTIONS.errorStatus;
  return <span className={`status-badge status-${type}-${value}`}>{source[value] || "Sem status"}</span>;
}

export function AppShell({ embedded, active, onNavigate, onCreate, canRegister, canConfigure, children, mockMode, loading, onRefresh }) {
  // Dentro do Sistema Betinhos o shell já tem a barra lateral: a desta tela começa recolhida.
  const [sidebarExpanded, setSidebarExpanded] = useState(() => !embedded);
  const items = [
    ["dashboard", "Visão geral", LayoutDashboard],
    ["occurrences", "Ocorrências", AlertOctagon],
    ["agenda", "Agenda", CalendarDays],
    ["reports", "Relatórios", BarChart3],
    ...(canConfigure ? [["settings", "Configurações", Settings]] : []),
  ];
  return (
    <div className={`app-shell ${sidebarExpanded ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <button
          className="sidebar-toggle"
          type="button"
          onClick={() => setSidebarExpanded((expanded) => !expanded)}
          aria-label={sidebarExpanded ? "Recolher menu lateral" : "Expandir menu lateral"}
          title={sidebarExpanded ? "Recolher menu lateral" : "Expandir menu lateral"}
        >
          {sidebarExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <div className="brand-block">
          <div className="brand-mark"><ShieldCheck size={22} /></div>
          <div><strong>Betinhos</strong><span>Erros Operacionais</span></div>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          {items.map(([id, label, Icon]) => (
            <button key={id} className={active === id ? "active" : ""} onClick={() => onNavigate(id)} title={label}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
        {canRegister && <button className="primary-button sidebar-create" onClick={onCreate} title="Registrar erro"><Plus size={18} />Registrar erro</button>}
        <div className="sidebar-foot">
          <span className={`connection-dot ${mockMode ? "mock" : "live"}`} title={mockMode ? "Mock persistente" : "Dados em tempo real"} />
          <div><strong>{mockMode ? "Ambiente local" : "Dataverse conectado"}</strong><span>{mockMode ? "Mock persistente" : "Dados em tempo real"}</span></div>
        </div>
      </aside>
      <main className="app-main">
        <header className="mobile-header">
          <div className="brand-mark"><ShieldCheck size={20} /></div>
          <strong>Erros Operacionais</strong>
          <button className="icon-button" onClick={onRefresh} disabled={loading} aria-label={loading ? "Atualizando" : "Atualizar"} aria-busy={loading}><RefreshCw size={18} className={loading ? "spin" : ""} /></button>
        </header>
        <div className="content-wrap">
          <div className="desktop-actions" aria-label="Ações do ambiente">
            {mockMode && <span className="environment-pill">Mock local realista</span>}
            <button className="icon-button" onClick={onRefresh} disabled={loading} aria-busy={loading}><RefreshCw size={17} className={loading ? "spin" : ""} />{loading ? "Atualizando..." : "Atualizar"}</button>
          </div>
          {children}
        </div>
      </main>
      <nav className="bottom-nav" aria-label="Navegação mobile" style={{ "--nav-count": items.length + (canRegister ? 1 : 0) }}>
        {items.map(([id, label, Icon]) => (
          <button key={id} className={active === id ? "active" : ""} onClick={() => onNavigate(id)}><Icon size={20} /><span>{label}</span></button>
        ))}
        {canRegister && <button className="bottom-create" onClick={onCreate}><Plus size={21} /><span>Novo</span></button>}
      </nav>
    </div>
  );
}

function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function MetricCard({ icon: Icon, label, value, hint, tone = "navy" }) {
  return <article className={`metric-card tone-${tone}`}><div className="metric-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>;
}

export function Dashboard({ errors, actions, stats, onSelect, onNavigate }) {
  const { openPriority, upcoming, categories, errorsById } = useMemo(() => {
    const categoryCounts = countByValue(errors, "cr40f_categoria");
    return {
      openPriority: errors.filter((item) => ![100000004, 100000005, 100000006].includes(Number(item.cr40f_status)))
        .sort((a, b) => Number(b.cr40f_gravidade) - Number(a.cr40f_gravidade)).slice(0, 5),
      upcoming: agendaActions(actions, "week").filter(isOpenAction).slice(0, 5),
      categories: choiceEntries(OPTIONS.category).map((entry) => ({ ...entry, count: categoryCounts.get(entry.value) || 0 }))
        .filter((entry) => entry.count).sort((a, b) => b.count - a.count).slice(0, 5),
      errorsById: new Map(errors.map((item) => [item.cr40f_errooperacionalid, item])),
    };
  }, [actions, errors]);
  const maxCategory = Math.max(1, ...categories.map((entry) => entry.count));

  return <section className="page-section">
    <PageTitle eyebrow="Central de operações" title="Visão geral" description="Prioridades, prazos e evolução dos erros operacionais." />
    <div className="metrics-grid">
      <MetricCard icon={AlertOctagon} label="Erros abertos" value={stats.open} hint="Exigem acompanhamento" tone="blue" />
      <MetricCard icon={ShieldCheck} label="Críticos" value={stats.critical} hint="Prioridade máxima" tone="red" />
      <MetricCard icon={Clock3} label="Ações vencidas" value={stats.overdue} hint="Prazo ultrapassado" tone="amber" />
      <MetricCard icon={BarChart3} label="Resolvidos em 30 dias" value={stats.resolved30} hint={`${stats.averageDays.toFixed(1)} dias em média`} tone="green" />
    </div>
    <div className="dashboard-grid">
      <article className="surface priority-panel">
        <div className="surface-head"><div><span>Fila de prioridade</span><h2>Casos que pedem atenção</h2></div><button className="text-button" onClick={() => onNavigate("occurrences")}>Ver todos <ChevronRight size={16} /></button></div>
        <div className="priority-list">
          {openPriority.map((item) => <button className="priority-row" key={item.cr40f_errooperacionalid} onClick={() => onSelect(item)}>
            <span className={`severity-dot severity-${item.cr40f_gravidade}`} />
            <div><strong>{item.cr40f_titulo}</strong><span>{item.cr40f_codigo} · {OPTIONS.category[item.cr40f_categoria]}</span></div>
            <StatusBadge value={item.cr40f_status} /><ChevronRight size={18} />
          </button>)}
          {!openPriority.length && <div className="empty-small">Nenhum erro aberto.</div>}
        </div>
      </article>
      <article className="surface category-panel">
        <div className="surface-head"><div><span>Distribuição</span><h2>Erros por categoria</h2></div></div>
        <div className="bar-list">
          {categories.map((item) => <div className="bar-row" key={item.value}><div><span>{item.label}</span><strong>{item.count}</strong></div><div className="bar-track"><span style={{ transform: `scaleX(${item.count / maxCategory})` }} /></div></div>)}
        </div>
      </article>
      <article className="surface upcoming-panel">
        <div className="surface-head"><div><span>Agenda</span><h2>Próximos compromissos</h2></div><button className="text-button" onClick={() => onNavigate("agenda")}>Abrir agenda <ChevronRight size={16} /></button></div>
        <div className="upcoming-list">
          {upcoming.map((item) => <button key={item.cr40f_acaooperacionalid} onClick={() => onSelect(errorsById.get(item.cr40f_erroid))}>
            <div className="date-tile"><strong>{new Date(item.cr40f_agendadoem || item.cr40f_prazo).getDate()}</strong><span>{shortMonth(new Date(item.cr40f_agendadoem || item.cr40f_prazo))}</span></div>
            <div><strong>{item.cr40f_titulo}</strong><span>{formatDate(item.cr40f_agendadoem || item.cr40f_prazo, true)} · {item.cr40f_responsavelnome}</span></div>
          </button>)}
          {!upcoming.length && <div className="empty-small">Nenhuma ação nos próximos dias.</div>}
        </div>
      </article>
    </div>
  </section>;
}

export function OccurrencesView({ errors, employees, filters, setFilters, sort, setSort, page, setPage, pageSize, onSelect, onExport }) {
  const pages = Math.max(1, Math.ceil(errors.length / pageSize));
  const visible = errors.slice((page - 1) * pageSize, page * pageSize);
  const employeeOptions = useMemo(
    () => employees.map((item) => ({ value: item.id, label: item.name })),
    [employees],
  );
  const update = (field, value) => { setFilters((current) => ({ ...current, [field]: value })); setPage(1); };
  return <section className="page-section">
    <PageTitle eyebrow="Consulta e gestão" title="Ocorrências" description={`${errors.length} registros encontrados`} action={<button className="secondary-button" onClick={onExport}>Exportar CSV</button>} />
    <div className="surface filter-surface">
      <div className="search-box"><Search size={18} /><input value={filters.query} onChange={(event) => update("query", event.target.value)} placeholder="Buscar código, título, reserva, motorista..." /></div>
      <div className="filter-grid">
        <label><span>Status</span><SearchableMultiSelect value={filters.status} onChange={(value) => update("status", value)} placeholder="Todos os status" options={choiceEntries(OPTIONS.errorStatus)} /></label>
        <label><span>Categoria</span><SearchableMultiSelect value={filters.category} onChange={(value) => update("category", value)} placeholder="Todas as categorias" options={choiceEntries(OPTIONS.category)} /></label>
        <label><span>Gravidade</span><SearchableMultiSelect value={filters.severity} onChange={(value) => update("severity", value)} placeholder="Todas as gravidades" options={choiceEntries(OPTIONS.severity)} /></label>
        <label><span>Responsável</span><SearchableMultiSelect value={filters.responsible} onChange={(value) => update("responsible", value)} placeholder="Todos os responsáveis" options={employeeOptions} /></label>
        <label><span>Data inicial</span><input type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
        <label><span>Data final</span><input type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} /></label>
        <label><span>Ordenar</span><SearchableSelect value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={[{ value: "recent", label: "Mais recentes" }, { value: "severity", label: "Maior gravidade" }, { value: "deadline", label: "Prazo mais próximo" }]} clearable={false} /></label>
      </div>
    </div>
    <div className="surface table-surface">
      <div className="table-head"><span>Ocorrência</span><span>Categoria</span><span>Responsável</span><span>Prazo</span><span>Status</span><span /></div>
      <div className="occurrence-list">
        {visible.map((item) => <button className="occurrence-row" key={item.cr40f_errooperacionalid} onClick={() => onSelect(item)}>
          <div className="occurrence-main"><span className={`severity-line severity-bg-${item.cr40f_gravidade}`} /><div><strong>{item.cr40f_titulo}</strong><span>{item.cr40f_codigo} · {formatDate(item.cr40f_dataocorrencia, true)}</span></div></div>
          <span>{OPTIONS.category[item.cr40f_categoria]}</span><span>{item.cr40f_responsavelnome || "Não atribuído"}</span><span className={item.cr40f_prazoresolucao && new Date(item.cr40f_prazoresolucao) < new Date() ? "overdue-text" : ""}>{formatDate(item.cr40f_prazoresolucao)}</span><StatusBadge value={item.cr40f_status} /><ChevronRight size={18} />
        </button>)}
        {!visible.length && <div className="empty-state"><SlidersHorizontal size={28} /><strong>Nenhum registro encontrado</strong><span>Ajuste os filtros ou registre um novo erro.</span></div>}
      </div>
      <div className="pagination"><span>Página {page} de {pages}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button></div></div>
    </div>
  </section>;
}

export function AgendaView({ actions, errors, mode, setMode, status, setStatus, assignee, setAssignee, currentUserId, onSelect, onCreateAction, canManage }) {
  const { visible, errorsById, summary } = useMemo(() => ({
    visible: agendaActions(actions, mode, new Date(), status, assignee, currentUserId),
    errorsById: new Map(errors.map((item) => [item.cr40f_errooperacionalid, item])),
    summary: actions.reduce((result, item) => {
      if (isOpenAction(item)) result.open += 1;
      if (isOverdue(item)) result.overdue += 1;
      if (Number(item.cr40f_status) === 100000003) result.completed += 1;
      return result;
    }, { open: 0, overdue: 0, completed: 0 }),
  }), [actions, assignee, currentUserId, errors, mode, status]);
  const modes = [["today", "Hoje"], ["week", "Próximos 7 dias"], ["all", "Todas"]];
  const statuses = [["pending", "Pendentes"], ["overdue", "Atrasadas"], ["all", "Todos"]];
  const assignees = [["all", "Todos"], ["mine", "Atribu\u00eddo a mim"]];
  return <section className="page-section">
    <PageTitle eyebrow="Tratamento e prazos" title="Agenda" description="Compromissos vinculados aos erros operacionais." action={canManage ? <button className="primary-button compact" onClick={() => onCreateAction(null)}><Plus size={18} />Nova ação</button> : null} />
    <div className="agenda-filters"><div className="agenda-filter-group"><span>Per&#237;odo</span><div className="segmented-control">{modes.map(([id, label]) => <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}>{label}</button>)}</div></div><div className="agenda-filter-group"><span>Status</span><div className="segmented-control">{statuses.map(([id, label]) => <button key={id} className={status === id ? "active" : ""} onClick={() => setStatus(id)}>{label}</button>)}</div></div><div className="agenda-filter-group"><span>Respons&#225;vel</span><div className="segmented-control">{assignees.map(([id, label]) => <button key={id} className={assignee === id ? "active" : ""} onClick={() => setAssignee(id)}>{label}</button>)}</div></div></div>
    <div className="agenda-layout">
      <div className="surface agenda-list">
        {visible.map((item) => {
          const error = errorsById.get(item.cr40f_erroid);
          const target = item.cr40f_agendadoem || item.cr40f_prazo;
          return <button className={`agenda-card ${isOverdue(item) ? "overdue" : ""}`} key={item.cr40f_acaooperacionalid} onClick={() => onSelect(error)}>
            <div className="agenda-date"><strong>{new Date(target).getDate()}</strong><span>{shortMonth(new Date(target))}</span></div>
            <div className="agenda-card-main"><div><span>{OPTIONS.actionType[item.cr40f_tipoacao]}</span><StatusBadge type="action" value={item.cr40f_status} /></div><strong>{item.cr40f_titulo}</strong><p>{item.cr40f_erronome}</p><small><Users size={14} />{item.cr40f_responsavelnome} <Clock3 size={14} />{formatDate(target, true)}</small></div>
            <ChevronRight size={18} />
          </button>;
        })}
        {!visible.length && <div className="empty-state"><CalendarDays size={30} /><strong>Agenda livre</strong><span>Nenhuma ação neste período.</span></div>}
      </div>
      <aside className="surface agenda-summary"><span>Resumo</span><h2>Compromissos</h2><div><strong>{summary.open}</strong><span>ações abertas</span></div><div><strong>{summary.overdue}</strong><span>atrasadas</span></div><div><strong>{summary.completed}</strong><span>concluídas</span></div></aside>
    </div>
  </section>;
}

export function ReportsView({ errors, actions, stats }) {
  const {
    categories, severities, origins, responsibles, months, maxMonth,
    actionCoverage, resolutionRate, openWithoutAction, completedActions, total,
  } = useMemo(() => {
    const categoryCounts = countByValue(errors, "cr40f_categoria");
    const severityCounts = countByValue(errors, "cr40f_gravidade");
    const originCounts = countByValue(errors, "cr40f_origem");
    const nextCategories = choiceEntries(OPTIONS.category).map((entry) => ({ ...entry, count: categoryCounts.get(entry.value) || 0 })).filter((item) => item.count);
    const nextSeverities = choiceEntries(OPTIONS.severity).map((entry) => ({ ...entry, count: severityCounts.get(entry.value) || 0 }));
    const nextOrigins = choiceEntries(OPTIONS.origin).map((entry) => ({ ...entry, count: originCounts.get(entry.value) || 0 })).filter((item) => item.count).sort((a, b) => b.count - a.count);
    const responsibleCounts = new Map();
    errors.forEach((item) => {
      const name = item.cr40f_responsavelnome || "Sem responsável";
      responsibleCounts.set(name, (responsibleCounts.get(name) || 0) + 1);
    });
    const nextResponsibles = [...responsibleCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    const actionErrorIds = new Set(actions.map((item) => item.cr40f_erroid).filter(Boolean));
    const errorsWithAction = errors.filter((item) => actionErrorIds.has(item.cr40f_errooperacionalid)).length;
    const resolved = errors.filter((item) => [100000004, 100000005].includes(Number(item.cr40f_status))).length;
    const nextOpenWithoutAction = errors.filter((item) => ![100000004, 100000005, 100000006].includes(Number(item.cr40f_status)) && !actionErrorIds.has(item.cr40f_errooperacionalid)).length;
    const now = new Date();
    const monthCounts = new Map();
    errors.forEach((item) => {
      const value = new Date(item.cr40f_dataocorrencia);
      const key = `${value.getFullYear()}-${value.getMonth()}`;
      monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
    });
    const nextMonths = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      return { label: shortMonth(date), count: monthCounts.get(key) || 0 };
    });
    return {
      categories: nextCategories,
      severities: nextSeverities,
      origins: nextOrigins,
      responsibles: nextResponsibles,
      months: nextMonths,
      maxMonth: Math.max(1, ...nextMonths.map((item) => item.count)),
      actionCoverage: errors.length ? Math.round((errorsWithAction / errors.length) * 100) : 0,
      resolutionRate: errors.length ? Math.round((resolved / errors.length) * 100) : 0,
      openWithoutAction: nextOpenWithoutAction,
      completedActions: actions.filter((item) => Number(item.cr40f_status) === 100000003).length,
      total: Math.max(1, errors.length),
    };
  }, [actions, errors]);
  return <section className="page-section">
    <PageTitle eyebrow="Indicadores operacionais" title="Relatórios" description="Uma leitura executiva da recorrência, do risco e da capacidade de resposta da operação." />
    <div className="report-overview surface"><div className="report-overview-copy"><span>Painel de controle</span><h2>Onde a operação precisa de atenção</h2><p>Use os indicadores para priorizar investigação, cobrança de prazos e ações preventivas.</p></div><div className="report-health"><div><strong>{resolutionRate}%</strong><span>registros resolvidos</span></div><div><strong>{actionCoverage}%</strong><span>com plano de ação</span></div><div><strong>{stats.critical}</strong><span>críticos em aberto</span></div></div></div>
    <div className="report-metric-grid"><div className="report-metric"><span className="report-metric-icon blue"><TrendingUp size={17} /></span><div><strong>{errors.length}</strong><span>Ocorrências registradas</span><small>base atual</small></div></div><div className="report-metric"><span className="report-metric-icon amber"><Timer size={17} /></span><div><strong>{stats.averageDays.toFixed(1)}d</strong><span>Tempo médio de resolução</span><small>entre registros resolvidos</small></div></div><div className="report-metric"><span className="report-metric-icon red"><Target size={17} /></span><div><strong>{stats.overdue}</strong><span>Ações atrasadas</span><small>exigem cobrança</small></div></div><div className="report-metric"><span className="report-metric-icon green"><ClipboardCheck size={17} /></span><div><strong>{actions.length}</strong><span>Ações operacionais</span><small>{completedActions} concluídas</small></div></div></div>
    <div className="report-grid">
      <article className="surface report-card"><span>Volume</span><h2>Ocorrências por mês</h2><div className="trend-chart">{months.map((item) => <div key={item.label}><span className="trend-value">{item.count}</span><div className="trend-track"><i style={{ height: `${Math.max(8, (item.count / maxMonth) * 100)}%` }} /></div><small>{item.label}</small></div>)}</div></article>
      <article className="surface report-card"><span>Gravidade</span><h2>Perfil dos registros</h2><div className="severity-report">{severities.map((item) => <div key={item.value}><span className={`severity-dot severity-${item.value}`} /><div><strong>{item.count}</strong><span>{item.label}</span></div><em>{Math.round((item.count / total) * 100)}%</em></div>)}</div></article>
      <article className="surface report-card"><span>SLA e resposta</span><h2>Capacidade de tratamento</h2><div className="progress-report"><div><div><span>Com plano de ação</span><strong>{actionCoverage}%</strong></div><div className="progress-track"><i style={{ width: `${actionCoverage}%` }} /></div></div><div><div><span>Resolvidos ou encerrados</span><strong>{resolutionRate}%</strong></div><div className="progress-track green"><i style={{ width: `${resolutionRate}%` }} /></div></div><div className="report-callout"><Timer size={16} /><span><strong>{openWithoutAction}</strong> ocorrência(s) aberta(s) sem ação vinculada.</span></div></div></article>
      <article className="surface report-card"><span>Responsabilidade</span><h2>Quem concentra os registros</h2><div className="rank-report">{responsibles.map((item, index) => <div key={item.label}><b>{index + 1}</b><span>{item.label}</span><strong>{item.count}</strong></div>)}{!responsibles.length && <div className="empty-small">Sem responsáveis registrados.</div>}</div></article>
      <article className="surface report-card report-wide"><span>Recorrência</span><h2>Categorias mais frequentes</h2><div className="category-report">{categories.sort((a, b) => b.count - a.count).map((item) => <div key={item.value}><span>{item.label}</span><div><i style={{ transform: `scaleX(${item.count / total})` }} /></div><strong>{item.count}</strong></div>)}{!categories.length && <div className="empty-small">Ainda não há ocorrências para classificar.</div>}</div></article>
      <article className="surface report-card"><span>Origem</span><h2>De onde os alertas chegam</h2><div className="origin-report">{origins.map((item) => <div key={item.value}><span>{item.label}</span><strong>{item.count}</strong><small>{Math.round((item.count / total) * 100)}%</small></div>)}{!origins.length && <div className="empty-small">Sem origem registrada.</div>}</div></article>
      <article className="surface report-card"><span>Próximo passo</span><h2>Foco recomendado</h2><div className="focus-report"><div><span className="focus-icon red"><AlertOctagon size={16} /></span><p><strong>{stats.critical} críticos abertos</strong><span>Priorize contenção e responsável.</span></p></div><div><span className="focus-icon amber"><Clock3 size={16} /></span><p><strong>{stats.overdue} ações atrasadas</strong><span>Revise prazo e próximo marco.</span></p></div><div><span className="focus-icon blue"><Users size={16} /></span><p><strong>{openWithoutAction} sem ação</strong><span>Converta diagnóstico em tarefa.</span></p></div></div></article>
    </div>
  </section>;
}
