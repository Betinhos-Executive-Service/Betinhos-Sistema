// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { RestrictedVisibilityMark, StatusBadge } from '../components/Badges'
import { FilterBar } from '../components/FilterBar'
import PageHeader from '../components/PageHeader'
import { TaskScopeSelector, TaskViewSelector } from '../components/TaskSelectors'
import { CALENDAR_WEEKDAY_FORMATTER } from '../constants'
import { filterTasks, formatDate, getDueBucketForEmployee, sortTasks, taskDisplayDueDate } from '../domain/domain'
import { calendarDateFromKey, calendarDateKey, calendarDaysBetween, shiftCalendarDate, tasksForView } from '../pageHelpers'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'


export function CalendarView({
  state,
  onOpen,
  onCreate,
  filters,
  setFilters,
  onNavigate,
  currentEmployee,
  taskScope,
  onScopeChange,
  personalTags,
  onCreatePersonalTag,
  onUpdatePersonalTag,
  onArchivePersonalTag,
  onReorderPersonalTags,
}: any) {
  const today = new Date();
  const todayKey = calendarDateKey(today);
  const [windowStartDate, setWindowStartDate] = useState<any>(todayKey);
  const [selectedDate, setSelectedDate] = useState<any>(todayKey);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => calendarDateFromKey(shiftCalendarDate(windowStartDate, index))),
    [windowStartDate],
  );
  const statusFilters = Array.isArray(filters.status)
    ? filters.status
    : filters.status
      ? [filters.status]
      : [];
  const openTasks = useMemo(() => {
    const filteredTasks = filterTasks(
      (tasksForView as any)(state.tasks, filters),
      filters,
      currentEmployee,
      state.teams,
    );
    const visibleTasks = statusFilters.includes("done")
      ? filteredTasks
      : filteredTasks.filter((taskItem) => taskItem.status !== "done");
    return sortTasks(visibleTasks, currentEmployee, state.teams);
  }, [state.tasks, state.teams, filters, currentEmployee, statusFilters]);
  const isCurrentWindow = windowStartDate === todayKey;
  const overdueTasks = useMemo(
    () => isCurrentWindow
      ? openTasks.filter((taskItem) => getDueBucketForEmployee(taskItem, currentEmployee, state.teams) === "overdue")
      : [],
    [isCurrentWindow, openTasks, currentEmployee, state.teams],
  );
  const overdueTaskIds = useMemo(
    () => new Set(overdueTasks.map((taskItem) => taskItem.id)),
    [overdueTasks],
  );
  const taskCountByDate = useMemo(
    () => days.reduce((counts, date) => {
      const dateKey = calendarDateKey(date);
      (counts as any)[dateKey] = openTasks.filter(
        (taskItem) => taskDisplayDueDate(taskItem, currentEmployee, state.teams) === dateKey,
      ).length;
      return counts;
    }, {}),
    [days, openTasks, currentEmployee, state.teams],
  );
  const visibleTasks = openTasks.filter(
    (taskItem) => taskDisplayDueDate(taskItem, currentEmployee, state.teams) === selectedDate
      && !overdueTaskIds.has(taskItem.id),
  );
  const selectedDateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(calendarDateFromKey(selectedDate));
  const windowLabel = `${CALENDAR_WEEKDAY_FORMATTER.format(days[0]).replace(".", "")} ${days[0].getDate()} – ${CALENDAR_WEEKDAY_FORMATTER.format(days[6]).replace(".", "")} ${days[6].getDate()}`;
  const shiftWindow = (amount: any) => {
    setWindowStartDate((currentStart: any) => shiftCalendarDate(currentStart, amount));
    setSelectedDate((currentSelected: any) => shiftCalendarDate(currentSelected, amount));
  };
  const goToToday = () => {
    setWindowStartDate(todayKey);
    setSelectedDate(todayKey);
  };
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Tarefas"
        title="Agenda operacional"
        description="Uma visão simples dos compromissos que movem a operação."
      >
        <TaskScopeSelector
          active={taskScope}
          onSelect={onScopeChange}
          disabled={!currentEmployee?.name}
        />
        <TaskViewSelector active="calendar" onSelect={onNavigate} />
      </PageHeader>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        onCreate={() => onCreate("todo", { dueDate: selectedDate })}
        employees={state.employees}
        teams={state.teams}
        personalTags={personalTags}
        onCreatePersonalTag={onCreatePersonalTag}
        onUpdatePersonalTag={onUpdatePersonalTag}
        onArchivePersonalTag={onArchivePersonalTag}
        onReorderPersonalTags={onReorderPersonalTags}
      />
      <div className="calendar-navigation" aria-label="Navegação da agenda">
        <button
          className="icon-button"
          type="button"
          aria-label="Sete dias anteriores"
          title="Sete dias anteriores"
          onClick={() => shiftWindow(-7)}
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <strong>{windowLabel}</strong>
        <button
          className="button button-quiet button-small"
          type="button"
          onClick={goToToday}
          disabled={isCurrentWindow && selectedDate === todayKey}
        >
          Hoje
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Sete dias seguintes"
          title="Sete dias seguintes"
          onClick={() => shiftWindow(7)}
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="calendar-strip">
        {days.map((date) => (
          <button
            className={`calendar-day ${calendarDateKey(date) === todayKey ? "today" : ""} ${calendarDateKey(date) === selectedDate ? "selected" : ""}`}
            key={date.toISOString()}
            type="button"
            aria-label={`${CALENDAR_WEEKDAY_FORMATTER.format(date).replace(".", "")}, ${date.getDate()} de ${date.toLocaleDateString("pt-BR", { month: "long" })}. ${(taskCountByDate as any)[calendarDateKey(date)] || 0} tarefas`}
            aria-pressed={calendarDateKey(date) === selectedDate}
            onClick={() => setSelectedDate(calendarDateKey(date))}
          >
            <span>
              {CALENDAR_WEEKDAY_FORMATTER.format(date).replace(".", "")}
            </span>
            <strong>{date.getDate()}</strong>
            <small>{(taskCountByDate as any)[calendarDateKey(date)] || 0} {(taskCountByDate as any)[calendarDateKey(date)] === 1 ? "tarefa" : "tarefas"}</small>
          </button>
        ))}
      </div>
      {isCurrentWindow && (
        <section className="panel overdue-panel" aria-labelledby="calendar-overdue-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow danger-text">Atenção operacional</span>
              <h2 id="calendar-overdue-title">Tarefas atrasadas</h2>
            </div>
            <span className="panel-count panel-count-danger" aria-label={`${overdueTasks.length} tarefas atrasadas`}>{overdueTasks.length}</span>
          </div>
          {overdueTasks.length ? (
            <div className="overdue-list">
              {overdueTasks.map((taskItem) => {
                const dueDate = taskDisplayDueDate(taskItem, currentEmployee, state.teams);
                const overdueDays = calendarDaysBetween(dueDate, todayKey);
                return (
                  <button className="overdue-row" key={taskItem.id} type="button" onClick={() => onOpen(taskItem.id)}>
                    <span className="overdue-row-marker" aria-hidden="true" />
                    <span className="overdue-row-copy">
                      <strong>{taskItem.title}</strong>
                      <small>{overdueDays} {overdueDays === 1 ? "dia" : "dias"} em atraso · {taskItem.assigneeName || "Sem responsável"}</small>
                    </span>
                    <span className="overdue-row-date">{formatDate(dueDate)}</span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="calendar-empty calendar-empty-compact" role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              <strong>Nenhuma tarefa atrasada</strong>
              <span>A operação está em dia.</span>
            </div>
          )}
        </section>
      )}
      <section className="panel agenda-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Próximos 7 dias</span>
            <h2>{selectedDateLabel}</h2>
          </div>
          <span className="panel-count" aria-label={`${visibleTasks.length} tarefas no dia selecionado`}>{visibleTasks.length}</span>
        </div>
        {visibleTasks.length ? visibleTasks.map((taskItem) => (
          <button
            className="agenda-row"
            key={taskItem.id}
            onClick={() => onOpen(taskItem.id)}
          >
            <span className="agenda-time">{formatDate(taskDisplayDueDate(taskItem, currentEmployee, state.teams))}</span>
            <div className="agenda-line" />
            <div className="agenda-info">
              <div className="task-title-inline">
                <strong>{taskItem.title}</strong>
                {taskItem.restrictedVisibility && <RestrictedVisibilityMark />}
              </div>
              <span>
                {taskItem.quoteCode} · {taskItem.assigneeName}
              </span>
            </div>
            <StatusBadge status={taskItem.status} />
            <ChevronRight size={16} />
          </button>
        )) : (
          <div className="calendar-empty" role="status">
            <CalendarDays size={20} aria-hidden="true" />
            <strong>Nenhuma tarefa para este dia</strong>
            <span>Escolha outra data ou crie uma nova tarefa.</span>
            <button className="button button-secondary button-small" type="button" onClick={() => onCreate("todo", { dueDate: selectedDate })}>
              <Plus size={14} aria-hidden="true" />Criar tarefa
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
