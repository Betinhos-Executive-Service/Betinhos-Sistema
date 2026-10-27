// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { canRegisterWaitingReturn, deriveExecutionActor, formatDate, getDueBucketForEmployee, normalizePersonalTagIds, taskDisplayDueDate, waitingContextSummary } from '../domain/domain'
import { isTaskWaitingForEmployee } from '../domain/notifications'
import { isQuoteTask, quoteStatusForTaskStatus } from '../domain/quoteTaskFlow'
import { formatCommentTimestamp, formatExecutionDay, formatRelativeTimestamp } from '../pageHelpers'
import AssigneeDisplay from './AssigneeDisplay'
import { PriorityBadge, RestrictedVisibilityMark } from './Badges'
import { ArrowUpRight, BellRing, Check, CheckCircle2, Clock3, ListChecks } from 'lucide-react'
import { memo } from 'react'


export const TaskCard = memo(function TaskCard({
  task: taskItem,
  employees = [],
  subtasks = [],
  currentEmployee,
  teams = [],
  personalTags = [],
  hasUnreadMention = false,
  showChecklistOnCard = false,
  onOpen,
  onToggleSubtask,
  onComplete,
  onRegisterWaitingReturn,
  showQuickComplete = false,
  compact = false,
  enableDrag = true,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: any) {
  const displayDueDate = taskDisplayDueDate(taskItem, currentEmployee, teams);
  const overdue = getDueBucketForEmployee(taskItem, currentEmployee, teams) === "overdue";
  const waitingActionRequired = isTaskWaitingForEmployee(taskItem, currentEmployee);
  const canRegisterReturn = canRegisterWaitingReturn(taskItem, currentEmployee, teams);
  const executionActor = deriveExecutionActor(taskItem, employees);
  const executionFirstName = executionActor?.name === "Executor não identificado"
    ? "Não identificado"
    : executionActor?.name.trim().split(/\s+/)[0];
  const canOpen = !taskItem.id.startsWith("optimistic-");
  const importedChecklist = Array.isArray(taskItem.checklist)
    ? taskItem.checklist.filter((item: any) => item?.title).map((item: any) => ({
        id: `planner-checklist-${item.id}`,
        title: item.title,
        done: Boolean(item.done),
        imported: true,
      }))
    : [];
  const checklistItems = subtasks.length ? subtasks : importedChecklist;
  const completedSubtasks = checklistItems.filter(
    (item: any) => item.status === "done" || item.done,
  ).length;
  const visibleSubtasks = checklistItems.slice(0, 3);
  const assignedTeam = taskItem.assignmentMode === "team"
    ? teams.find((team: any) => (taskItem.teamIds || [taskItem.teamId]).some((id: any) => String(id) === String(team.id)))
    : null;
  const taskPersonalTagIds = new Set(normalizePersonalTagIds(taskItem.personalTagIds));
  const visiblePersonalTags = personalTags.filter(
    (tag: any) => !tag.archived && taskPersonalTagIds.has(tag.id),
  );
  return (
    <article
      className={`task-card ${compact ? "task-card-compact" : ""} ${overdue ? "task-overdue" : ""} ${taskItem.syncStatus === "syncing" ? "task-syncing" : ""} ${isDragging ? "task-card-dragging" : ""}`}
      draggable={enableDrag && taskItem.syncStatus !== "syncing"}
      tabIndex={canOpen ? 0 : -1}
      data-task-id={taskItem.id}
      data-kanban-id={taskItem.id}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/task-id", taskItem.id);
        onDragStart?.(taskItem.id, event);
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (canOpen) onOpen(taskItem.id);
      }}
      onKeyDown={(event) => {
        if (canOpen && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen(taskItem.id);
        }
      }}
    >
      <div className="task-card-top">
        <PriorityBadge priority={taskItem.priority} />
        {isQuoteTask(taskItem) && <span className="task-quote-status">{taskItem.quoteStatus || quoteStatusForTaskStatus(taskItem.status)}</span>}
        {overdue && <span className="overdue-label">Vencida</span>}
        {waitingActionRequired && (
          <span className="task-waiting-action" title="Aguardando sua atuação" aria-label="Aguardando sua atuação">
            <BellRing size={13} aria-hidden="true" />
            <span>Pendente</span>
          </span>
        )}
        {canOpen && (
          <button
            className="card-open"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(taskItem.id);
            }}
            aria-label="Abrir tarefa"
          >
            <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      <div className="task-card-title-row">
        <h3>{taskItem.title}</h3>
        {taskItem.restrictedVisibility && <RestrictedVisibilityMark />}
      </div>
      {visiblePersonalTags.length > 0 && (
        <div className="task-card-tags" aria-label="Tags da tarefa">
          {visiblePersonalTags.map((tag: any) => (
            <span
              className="task-card-tag"
              key={tag.id}
              style={{ "--personal-tag-color": tag.color }}
              title={tag.name}
            >
              <span className="personal-tag-dot" aria-hidden="true" />
              {tag.name}
            </span>
          ))}
        </div>
      )}
      {hasUnreadMention && (
        <div className="task-mention-alert">
          <BellRing size={13} />
          <span>Você foi mencionado</span>
        </div>
      )}
      {taskItem.status === "waiting" && waitingContextSummary(taskItem.waitingContext) && (
        <div className="task-waiting-summary" title={waitingContextSummary(taskItem.waitingContext)}>
          <Clock3 size={13} />
          <span>{waitingContextSummary(taskItem.waitingContext)}</span>
        </div>
      )}
      {executionActor && (
        <div
          className="task-execution-chip"
          role="group"
          aria-label={`Em andamento por ${executionFirstName}, ${formatRelativeTimestamp(executionActor.occurredAt)}`}
        >
          <div className="task-execution-when">
            <span>{formatExecutionDay(executionActor.occurredAt)}</span>
            <time dateTime={executionActor.occurredAt} title={formatCommentTimestamp(executionActor.occurredAt)}>
              {formatRelativeTimestamp(executionActor.occurredAt).replace(/^há\s*/, "").replace(/\s+/g, "")}
            </time>
          </div>
          <div className="task-execution-description">
            <strong>Em andamento</strong>
            <span>{executionFirstName}</span>
          </div>
        </div>
      )}
      {(showChecklistOnCard || importedChecklist.length > 0) && checklistItems.length > 0 && (
        <div
          className="task-checklist"
          aria-label={`Checklist: ${completedSubtasks} de ${checklistItems.length} concluídas`}
        >
          <div className="task-checklist-heading">
            <span>
              <ListChecks size={13} />
              Checklist
            </span>
            <strong>
              {completedSubtasks}/{checklistItems.length}
            </strong>
          </div>
          <div className="task-checklist-items">
            {visibleSubtasks.map((subtask: any) => {
              const completed = subtask.status === "done" || subtask.done;
              const content = (
                <>
                  <span className="task-checklist-box">
                    {completed && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span>{subtask.title}</span>
                </>
              );
              return subtask.imported ? (
                <div className={`task-checklist-item ${completed ? "is-complete" : ""}`} key={subtask.id}>
                  {content}
                </div>
              ) : (
                <button
                  className={`task-checklist-item ${completed ? "is-complete" : ""}`}
                  key={subtask.id}
                  type="button"
                  aria-pressed={completed}
                  disabled={subtask.syncStatus === "syncing"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSubtask?.(subtask.id, {
                      status: completed ? "todo" : "done",
                    });
                  }}
                >
                  {content}
                </button>
              );
            })}
          </div>
          {checklistItems.length > visibleSubtasks.length && (
            <span className="task-checklist-more">
              +{checklistItems.length - visibleSubtasks.length} itens
            </span>
          )}
        </div>
      )}
      <div className="task-card-footer">
        <AssigneeDisplay
          value={
            taskItem.assigneeProfiles?.length
              ? taskItem.assigneeProfiles
              : taskItem.assigneeNames || taskItem.assigneeName
          }
          small
          team={assignedTeam}
          teamName={taskItem.assignmentMode === "team" ? taskItem.teamName : ""}
          primaryName={taskItem.primaryAssigneeName}
          consultantNames={taskItem.consultantNames || []}
        />
        {taskItem.syncStatus === "syncing" ? (
          <span className="sync-chip" role="status">
            Enviando...
          </span>
        ) : (
          <span className={overdue ? "date-chip overdue" : "date-chip"}>
            <Clock3 size={13} />
            {formatDate(displayDueDate)}
          </span>
        )}
        {showQuickComplete &&
          !["done", "cancelled"].includes(taskItem.status) && (
            <button
              className="task-quick-action"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onComplete?.(taskItem.id);
              }}
            >
              Concluir
            </button>
          )}
        {canRegisterReturn && (
          <button
            className="task-quick-action task-return-action"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRegisterWaitingReturn?.(taskItem.id);
            }}
          >
            Registrar retorno
          </button>
        )}
      </div>
      {taskItem.parentTaskId && (
        <div className="subtask-mark">
          <CheckCircle2 size={13} />
          Subtarefa
        </div>
      )}
    </article>
  );
});
