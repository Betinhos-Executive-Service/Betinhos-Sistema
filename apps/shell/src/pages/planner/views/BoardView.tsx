// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { Avatar, StatusIcon } from '../components/Badges'
import { FilterBar } from '../components/FilterBar'
import KanbanBoard from '../components/KanbanBoard'
import PageHeader from '../components/PageHeader'
import SearchableSelect from '../components/SearchableSelect'
import { TaskCard } from '../components/TaskCard'
import { BoardSortSelector, TaskScopeSelector, TaskViewSelector } from '../components/TaskSelectors'
import { BOARD_GROUP_OPTIONS, BOARD_GROUP_STORAGE_KEY, BOARD_SORT_STORAGE_KEY } from '../constants'
import { filterTasks, formatDate, getDueBucketForEmployee, sortBoardTasks, statusById, taskDisplayDueDate } from '../domain/domain'
import { isQuoteTask } from '../domain/quoteTaskFlow'
import { boardColumns, boardGroupValues, getDropIndex, readBoardGroupPreference, readBoardSortPreference, useMediaQuery } from '../pageHelpers'
import { ChevronRight, Columns3 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'


export const Board = memo(function Board({
  tasks,
  employees = [],
  columns,
  tasksByColumn,
  groupBy,
  subtasksByParent,
  currentEmployee,
  checklistVisibility,
  teams = [],
  personalTags = [],
  unreadMentionTaskIds,
  onOpen,
  onToggleSubtask,
  onRegisterWaitingReturn,
  onMove,
  onCreate,
}: any) {
  const getSourceColumnId = useCallback(
    (taskItem: any) => groupBy === "status"
      ? taskItem?.status || ""
      : `${groupBy}:${boardGroupValues(taskItem, groupBy)[0] || "__none__"}`,
    [groupBy],
  );
  const getTaskDropIndex = useCallback(
    (grouped: any, columnId: any, draggedTask: any) => getDropIndex(
      grouped,
      columnId,
      draggedTask,
      currentEmployee,
      teams,
    ),
    [currentEmployee, teams],
  );
  const moveTask = useCallback(
    (taskId: any, column: any) => onMove(taskId, column?.groupValue, groupBy),
    [groupBy, onMove],
  );
  return (
    <KanbanBoard
      items={tasks}
      columns={columns}
      itemsByColumn={tasksByColumn}
      getSourceColumnId={getSourceColumnId}
      getDropIndex={getTaskDropIndex}
      canMove={(taskItem: any) => !taskItem.id.startsWith("optimistic-")}
      canCreate={() => groupBy === "status"}
      onMove={moveTask}
      onCreate={(column: any) => onCreate(column.id)}
      itemLabel="tarefa"
      itemLabelPlural="tarefas"
      transferType="text/task-id"
      renderColumnIcon={groupBy === "status"
        ? (column: any) => <StatusIcon
            status={column.id}
            className={`status-column-icon status-column-icon-${column.tone}`}
            size={17}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        : undefined}
      renderCard={(taskItem: any, dragProps: any) => (
        <TaskCard
          task={taskItem}
          employees={employees}
          subtasks={subtasksByParent.get(taskItem.id) || []}
          currentEmployee={currentEmployee}
          teams={teams}
          personalTags={personalTags}
          hasUnreadMention={unreadMentionTaskIds.has(taskItem.id)}
          showChecklistOnCard={checklistVisibility[taskItem.id]}
          onOpen={onOpen}
          onToggleSubtask={onToggleSubtask}
          onRegisterWaitingReturn={onRegisterWaitingReturn}
          isDragging={dragProps.isDragging}
          onDragStart={(_: any, event: any) => dragProps.onDragStart(event)}
          onDragEnd={dragProps.onDragEnd}
          enableDrag={dragProps.draggable}
        />
      )}
    />
  );
});

export function MobileBoardList({
  columns,
  employees = [],
  tasksByColumn,
  subtasksByParent,
  currentEmployee,
  checklistVisibility,
  teams = [],
  personalTags = [],
  unreadMentionTaskIds,
  onOpen,
  onToggleSubtask,
  onComplete,
  onRegisterWaitingReturn,
}: any) {
  return (
    <div className="mobile-board-list">
      {columns.map((column: any) => (
        <section className="mobile-status-group" key={column.id}>
          <div className="mobile-status-heading">
            <StatusIcon
              status={column.id}
              className={`status-column-icon status-column-icon-${column.tone || "neutral"}`}
              size={17}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            <h2>{column.label}</h2>
            <span className="column-count">
              {tasksByColumn[column.id].length}
            </span>
          </div>
          {(tasksByColumn[column.id] || []).map((taskItem: any) => (
            <TaskCard
              key={taskItem.id}
              task={taskItem}
              employees={employees}
              subtasks={subtasksByParent.get(taskItem.id) || []}
              currentEmployee={currentEmployee}
              teams={teams}
              personalTags={personalTags}
              hasUnreadMention={unreadMentionTaskIds.has(taskItem.id)}
              showChecklistOnCard={checklistVisibility[taskItem.id]}
              onOpen={onOpen}
              onToggleSubtask={onToggleSubtask}
              onComplete={onComplete}
              onRegisterWaitingReturn={onRegisterWaitingReturn}
              showQuickComplete
              enableDrag={false}
              compact
            />
          ))}
        </section>
      ))}
    </div>
  );
}

export function MobileTaskListView({ tasks, currentEmployee, teams = [], onOpen }: any) {
  const [tab, setTab] = useState<any>("today");
  const tabs = [["today", "Hoje"], ["next", "Próximas"], ["done", "Concluídas"]];
  const visibleTasks = tasks.filter((taskItem: any) => {
    if (tab === "done") return taskItem.status === "done";
    if (["done", "cancelled"].includes(taskItem.status)) return false;
    const bucket = getDueBucketForEmployee(taskItem, currentEmployee, teams);
    return tab === "today"
      ? ["overdue", "today", "none"].includes(bucket)
      : !["overdue", "today", "none"].includes(bucket);
  });
  return (
    <section className="mobile-task-list" aria-label="Lista de tarefas mobile">
      <div className="mobile-task-tabs" role="tablist" aria-label="Período das tarefas">
        {tabs.map(([id, label]: any) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <p className="mobile-task-summary">{visibleTasks.length} {tab === "done" ? "concluída(s)" : "tarefa(s)"}</p>
      <div className="mobile-task-rows">
        {visibleTasks.length ? visibleTasks.map((taskItem: any) => {
          const status = statusById(taskItem.status);
          const dueDate = taskDisplayDueDate(taskItem, currentEmployee, teams);
          const overdue = getDueBucketForEmployee(taskItem, currentEmployee, teams) === "overdue";
          const assignee = taskItem.primaryAssigneeName || taskItem.assigneeName || "Sem responsável";
          return <button className={`mobile-task-row${overdue ? " is-overdue" : ""}`} key={taskItem.id} type="button" onClick={() => onOpen(taskItem.id)}>
            <span className={`mobile-task-status-dot status-${taskItem.status}`} aria-hidden="true" />
            <span className="mobile-task-row-main"><strong>{taskItem.title}</strong><span><Avatar name={assignee} small />{assignee}</span></span>
            <span className="mobile-task-row-meta"><time>{dueDate ? formatDate(dueDate) : "Sem prazo"}</time><small>{status?.label || "Sem status"}</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>;
        }) : <div className="mobile-task-empty">Nenhuma tarefa nesta aba.</div>}
      </div>
    </section>
  );
}

export function BoardView({
  state,
  currentEmployee,
  checklistVisibility,
  onOpen,
  onToggleSubtask,
  onMove,
  onComplete,
  onRegisterWaitingReturn,
  onCreate,
  filters,
  setFilters,
  onNavigate,
  taskScope,
  onScopeChange,
  personalTags,
  onCreatePersonalTag,
  onUpdatePersonalTag,
  onArchivePersonalTag,
  onReorderPersonalTags,
}: any) {
  const [groupBy, setGroupBy] = useState<any>(readBoardGroupPreference);
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_GROUP_STORAGE_KEY, groupBy);
    } catch {}
  }, [groupBy]);
  const [sort, setSort] = useState<any>(readBoardSortPreference);
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_SORT_STORAGE_KEY, JSON.stringify(sort));
    } catch {}
  }, [sort]);
  const unreadMentionTaskIds = useMemo(
    () => new Set((state.notifications || []).filter((item: any) => item.type === "mention" && !item.readAt && item.taskId).map((item: any) => item.taskId)),
    [state.notifications],
  );
  const filtered = useMemo(
    () =>
      sortBoardTasks(
        filterTasks(state.tasks.filter((taskItem: any) => !taskItem.parentTaskId), filters, currentEmployee, state.teams),
        sort,
        currentEmployee,
        state.teams,
      ),
    [state.tasks, state.teams, filters, currentEmployee?.id, sort],
  );
  const columns = useMemo(
    () => boardColumns(groupBy, filtered, state.teams, personalTags, state.employees),
    [filtered, groupBy, personalTags, state.employees, state.teams],
  );
  const tasksByColumn = useMemo(
    () => {
      const grouped = Object.fromEntries(columns.map((column) => [column.id, []]));
      filtered.forEach((taskItem) => {
        boardGroupValues(taskItem, groupBy).forEach((value: any) => {
          const column = columns.find((item) => item.groupValue === value);
          if (column) grouped[column.id].push(taskItem);
        });
      });
      return grouped;
    },
    [columns, filtered, groupBy],
  );
  const isMobile = useMediaQuery(
    "(max-width: 820px), (max-width: 900px) and (max-height: 600px)",
  );
  const subtasksByParent = useMemo(
    () =>
      state.tasks.reduce((index: any, taskItem: any) => {
        if (!taskItem.parentTaskId) return index;
        const parent = state.tasks.find((candidate: any) => candidate.id === taskItem.parentTaskId);
        if (isQuoteTask(parent || {})) return index;
        const siblings = index.get(taskItem.parentTaskId) || [];
        siblings.push(taskItem);
        index.set(taskItem.parentTaskId, siblings);
        return index;
      }, new Map()),
    [state.tasks],
  );
  return (
    <div className="page-content board-page-content">
      {!isMobile && <PageHeader
        eyebrow="Tarefas"
        title="Operação em movimento"
        description={
          isMobile
            ? "Escolha a próxima ação e atualize o andamento da tarefa."
            : "Arraste os cartões para atualizar o agrupamento selecionado."
        }
      >
        <BoardSortSelector sort={sort} onChange={setSort} />
        <SearchableSelect value={groupBy} onChange={setGroupBy} options={BOARD_GROUP_OPTIONS} placeholder="Escolher agrupamento" displayPrefix="Agrupar: " icon={<Columns3 size={15} aria-hidden="true" />} aria-label="Agrupar colunas por" className="board-group-select" />
        <TaskScopeSelector
          active={taskScope}
          onSelect={onScopeChange}
          disabled={!currentEmployee?.name}
        />
        <TaskViewSelector active="board" onSelect={onNavigate} />
      </PageHeader>}
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
      {isMobile ? (
        <MobileTaskListView
          tasks={filtered}
          currentEmployee={currentEmployee}
          teams={state.teams}
          onOpen={onOpen}
        />
      ) : (
        <Board
          tasks={filtered}
          employees={state.employees}
          columns={columns}
          tasksByColumn={tasksByColumn}
          groupBy={groupBy}
          subtasksByParent={subtasksByParent}
          currentEmployee={currentEmployee}
          checklistVisibility={checklistVisibility}
          teams={state.teams}
          personalTags={personalTags}
          unreadMentionTaskIds={unreadMentionTaskIds}
          onOpen={onOpen}
          onToggleSubtask={onToggleSubtask}
          onRegisterWaitingReturn={onRegisterWaitingReturn}
          onMove={onMove}
          onCreate={onCreate}
        />
      )}
    </div>
  );
}
