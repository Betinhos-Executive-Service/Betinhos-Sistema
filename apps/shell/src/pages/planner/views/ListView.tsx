// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import AssigneeDisplay from '../components/AssigneeDisplay'
import { PriorityBadge, RestrictedVisibilityMark, StatusBadge } from '../components/Badges'
import { FilterBar } from '../components/FilterBar'
import PageHeader from '../components/PageHeader'
import { TaskScopeSelector, TaskViewSelector } from '../components/TaskSelectors'
import { LIST_SORT_COLUMNS } from '../constants'
import { filterTasks, formatDate, getDueBucketForEmployee, sortTasks, taskDisplayDueDate, waitingContextSummary } from '../domain/domain'
import { isTaskWaitingForEmployee } from '../domain/notifications'
import { sortListTasks, tasksForView } from '../pageHelpers'
import { BellRing, ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'


export function ListView({
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
  const [sort, setSort] = useState<any>({ key: "", direction: "asc" });
  const filtered = useMemo(() => {
    const tasks = filterTasks((tasksForView as any)(state.tasks, filters), filters, currentEmployee, state.teams);
    return sort.key ? sortListTasks(tasks, sort, currentEmployee, state.teams) : sortTasks(tasks, currentEmployee, state.teams);
  }, [state.tasks, state.teams, filters, sort, currentEmployee]);
  const selectSort = (key: any) =>
    setSort((current: any) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Tarefas"
        title="Lista operacional"
        description="Encontre rapidamente o próximo responsável por cada tarefa."
      >
        <TaskScopeSelector
          active={taskScope}
          onSelect={onScopeChange}
          disabled={!currentEmployee?.name}
        />
        <TaskViewSelector active="list" onSelect={onNavigate} />
      </PageHeader>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        onCreate={onCreate}
        employees={state.employees}
        teams={state.teams}
        personalTags={personalTags}
        onCreatePersonalTag={onCreatePersonalTag}
        onUpdatePersonalTag={onUpdatePersonalTag}
        onArchivePersonalTag={onArchivePersonalTag}
        onReorderPersonalTags={onReorderPersonalTags}
      />
      <section className="panel task-table">
        <div className="table-header" role="row">
          {LIST_SORT_COLUMNS.map(([key, label]: any) => (
            <div
              key={key}
              role="columnheader"
              aria-sort={(sort.key === key ? `${sort.direction}ending` : "none") as any}
            >
              <button
                className={
                  sort.key === key
                    ? "table-sort-button active"
                    : "table-sort-button"
                }
                type="button"
                onClick={() => selectSort(key)}
              >
                <span>{label}</span>
                {sort.key === key && (
                  <ChevronDown
                    className={
                      sort.direction === "asc"
                        ? "sort-icon ascending"
                        : "sort-icon"
                    }
                    size={14}
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
          ))}
        </div>
        {filtered.map((taskItem) => (
          <button
            className="table-row"
            key={taskItem.id}
            onClick={() => onOpen(taskItem.id)}
          >
            <div className="table-task">
              <span className={`table-status status-${taskItem.status}`} />
              {isTaskWaitingForEmployee(taskItem, currentEmployee) && (
                <span className="table-waiting-action" title="Aguardando sua atuação" aria-label="Aguardando sua atuação">
                  <BellRing size={14} aria-hidden="true" />
                </span>
              )}
              <div className="table-task-copy">
                <div className="task-title-inline">
                  <strong>{taskItem.title}</strong>
                  {taskItem.restrictedVisibility && <RestrictedVisibilityMark />}
                </div>
                {taskItem.status === "waiting" && waitingContextSummary(taskItem.waitingContext) && (
                  <small>{waitingContextSummary(taskItem.waitingContext)}</small>
                )}
              </div>
            </div>
            <span>{taskItem.quoteCode || "—"}</span>
            <AssigneeDisplay
              value={
                taskItem.assigneeProfiles?.length
                  ? taskItem.assigneeProfiles
                  : taskItem.assigneeNames || taskItem.assigneeName
              }
              small
              primaryName={taskItem.primaryAssigneeName}
              consultantNames={taskItem.consultantNames || []}
            />
            <span className={getDueBucketForEmployee(taskItem, currentEmployee, state.teams) === "overdue" ? "danger-text" : ""}>
              {formatDate(taskDisplayDueDate(taskItem, currentEmployee, state.teams))}
            </span>
            <div className="table-row-tags">
              <PriorityBadge priority={taskItem.priority} />
              <StatusBadge status={taskItem.status} />
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
