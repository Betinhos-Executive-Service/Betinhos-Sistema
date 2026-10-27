// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { FilterBar } from '../components/FilterBar'
import PageHeader from '../components/PageHeader'
import { filterTasks, formatDate, normalizeText } from '../domain/domain'
import { useMemo } from 'react'


export function QualityView({ state, currentEmployee, onCreate, onCreateTask, filters, setFilters }: any) {
  const quality = state.quality || [];
  const query = normalizeText(filters.query);
  const taskFilters = useMemo(() => ({ ...filters, query: "" }), [filters]);
  const taskBySourceId = useMemo(
    () => new Map(state.tasks.map((taskItem: any) => [taskItem.sourceId, taskItem])),
    [state.tasks],
  );
  const filteredQuality = useMemo(
    () =>
      quality.filter((item: any) => {
        const linkedTask = taskBySourceId.get(item.id);
        const matchesQuery =
          !query ||
          [
            item.code,
            item.title,
            item.type,
            item.status,
            (linkedTask as any)?.title,
          ].some((value) => normalizeText(value).includes(query));
        const matchesTaskFilters = linkedTask
          ? filterTasks([linkedTask], taskFilters, currentEmployee, state.teams).length > 0
          : !filters.assignee?.length &&
            !filters.priority?.length &&
            !filters.source?.length &&
            !filters.team?.length;
        return matchesQuery && matchesTaskFilters;
      }),
    [quality, taskBySourceId, query, taskFilters, filters, currentEmployee, state.teams],
  );
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Origem operacional"
        title="Qualidade"
        description="Transforme erros e ações operacionais em tarefas do Planner interno."
      />
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        onCreate={onCreateTask}
        employees={state.employees}
        teams={state.teams}
      />
      <section className="panel task-table">
        <div className="table-header">
          <span>Registro</span>
          <span>Tipo</span>
          <span>Prazo</span>
          <span>Status</span>
          <span>Ação</span>
        </div>
        {filteredQuality.map((item: any) => {
          const linked = taskBySourceId.has(item.id);
          return (
            <div className="table-row" key={`${item.type}-${item.id}`}>
              <div className="table-task">
                <span className="table-status status-waiting" />
                <strong>
                  {item.code ? `${item.code} · ` : ""}
                  {item.title}
                </strong>
              </div>
              <span>
                {item.type === "error"
                  ? "Erro operacional"
                  : "Ação operacional"}
              </span>
              <span>{formatDate(item.dueDate)}</span>
              <span>{item.status || "Ativo"}</span>
              {linked ? (
                <span className="linked-label">Tarefa criada</span>
              ) : (
                <button className="small-button" onClick={() => onCreate(item)}>
                  Criar tarefa
                </button>
              )}
            </div>
          );
        })}
        {!filteredQuality.length && (
          <div className="empty-inline">
            Nenhum erro ou ação operacional disponível.
          </div>
        )}
      </section>
    </div>
  );
}
