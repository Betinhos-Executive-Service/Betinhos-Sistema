// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { PRIORITIES, canRegisterWaitingReturn, deriveExecutionActor, formatDate, hasTaskResponsible, normalizeAssigneeNames, normalizePersonalTagIds, normalizeText, normalizeWaitingContext, resolveTaskAssignment, statusById, validateWaitingContext } from '../domain/domain'
import { deadlineRole, validateDeadlineChange } from '../domain/notifications'
import { isQuoteTask, quoteStatusForTaskStatus } from '../domain/quoteTaskFlow'
import { taskHistoryDetails, visibleTaskHistory } from '../domain/taskHistory'
import { formatCommentTimestamp, formatRelativeTimestamp } from '../pageHelpers'
import AssignmentFields from './AssignmentFields'
import { AttachmentSection, TaskReturnsSection } from './Attachments'
import { Avatar, StatusPicker } from './Badges'
import { DateInput } from './DateInput'
import { DeleteTaskDialog, QuoteCompletionDialog, UnassignedTaskDialog, UnsavedChangesDialog } from './Dialogs'
import { MentionableField } from './MentionableField'
import { PersonalTagPicker } from './PersonalTags'
import PriorityPicker from './PriorityPicker'
import { WaitingContextFields } from './WaitingContextFields'
import { createDraftAttachment, filesFromClipboard, releaseDraftAttachment, toAttachmentFiles, useDocumentPaste } from './attachmentFiles'
import { ArrowUpRight, BellRing, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, FileText, Flag, LoaderCircle, MessageCircle, Play, Plus, Send, Trash2, X } from 'lucide-react'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'


export function TaskDrawerContent({
  task: taskItem,
  state,
  teams = [],
  personalTags = [],
  onCreatePersonalTag,
  currentEmployee,
  loadAttachmentContent,
  showChecklistOnCard,
  onToggleChecklistOnCard,
  onClose,
  onRegisterWaitingReturn,
  onSave,
  onDelete,
  onComment,
  onAttachment,
  onDeleteAttachment,
  onOpenQuote,
  onAddSubtask,
  onRequestDelete,
  deleteState,
  showDeletePrompt,
  onCancelDelete,
  onConfirmDelete,
}: any) {
  const [form, setForm] = useState<any>(taskItem ? { ...taskItem } : null);
  const [comment, setComment] = useState<any>("");
  const [showAllComments, setShowAllComments] = useState<any>(false);
  const [showHistory, setShowHistory] = useState<any>(false);
  const [showAllHistory, setShowAllHistory] = useState<any>(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<any>("");
  const [isAddingSubtask, setIsAddingSubtask] = useState<any>(false);
  const [subtaskToDelete, setSubtaskToDelete] = useState<any>(null);
  const [saveState, setSaveState] = useState<any>("idle");
  const [showSaveOverlay, setShowSaveOverlay] = useState<any>(false);
  const [saveProgress, setSaveProgress] = useState<any>({
    label: "Salvando tarefa…",
    detail: "Validando alterações",
    current: 0,
    total: 1,
  });
  const [validationError, setValidationError] = useState<any>("");
  const [showDiscardPrompt, setShowDiscardPrompt] = useState<any>(false);
  const [showUnassignedPrompt, setShowUnassignedPrompt] = useState<any>(false);
  const [showQuoteCompletionPrompt, setShowQuoteCompletionPrompt] = useState<any>(false);
  const [draftAttachments, setDraftAttachments] = useState<any>([]);
  const [pendingAttachmentRemovals, setPendingAttachmentRemovals] = useState<any>(
    [],
  );
  const draftAttachmentsRef = useRef<any>([]);
  const drawerBodyRef = useRef<any>(null);
  const commentExpansionAnchorRef = useRef<any>(null);
  const saveOverlayTimerRef = useRef<any>(null);
  draftAttachmentsRef.current = draftAttachments;
  const saveCloseTimerRef = useRef<any>(null);
  useEffect(() => {
    setForm(
      taskItem
        ? {
            ...taskItem,
            assignmentMode: taskItem.assignmentMode || (taskItem.teamId ? "team" : "people"),
            teamIds: taskItem.teamIds || (taskItem.teamId ? [taskItem.teamId] : []),
            teamNames: taskItem.teamNames || [],
            teamId: taskItem.teamId || "",
            assigneeIds: taskItem.assigneeIds || [],
            primaryAssigneeId: taskItem.primaryAssigneeId || taskItem.assigneeIds?.[0] || "",
            consultantIds: taskItem.consultantIds || taskItem.assigneeIds?.slice(1) || [],
            restrictedVisibility: Boolean(taskItem.restrictedVisibility),
            personalTagIds: normalizePersonalTagIds(taskItem.personalTagIds),
            quoteStatus: isQuoteTask(taskItem) ? taskItem.quoteStatus || state.quotes?.find((quote: any) => quote.id === taskItem.quoteId)?.status || quoteStatusForTaskStatus(taskItem.status) : taskItem.quoteStatus,
            assigneeName: normalizeAssigneeNames(
              taskItem.assigneeNames || taskItem.assigneeName,
            ).filter((name) => name !== "Não atribuído"),
            waitingContext: normalizeWaitingContext(taskItem.waitingContext),
          }
        : null,
    );
    setComment("");
    setShowAllComments(false);
    setShowHistory(false);
    setShowAllHistory(false);
    commentExpansionAnchorRef.current = null;
    (setMentionActiveIndex as any)(0);
    setNewSubtaskTitle("");
    setIsAddingSubtask(false);
    setSubtaskToDelete(null);
    setSaveState("idle");
    setShowSaveOverlay(false);
    setSaveProgress({
      label: "Salvando tarefa…",
      detail: "Validando alterações",
      current: 0,
      total: 1,
    });
    setValidationError("");
    setShowDiscardPrompt(false);
    setShowUnassignedPrompt(false);
    setShowQuoteCompletionPrompt(false);
    setDraftAttachments([]);
    setPendingAttachmentRemovals([]);
    if (saveCloseTimerRef.current)
      window.clearTimeout(saveCloseTimerRef.current);
    if (saveOverlayTimerRef.current)
      window.clearTimeout(saveOverlayTimerRef.current);
    return () => {
      if (saveCloseTimerRef.current)
        window.clearTimeout(saveCloseTimerRef.current);
      if (saveOverlayTimerRef.current)
        window.clearTimeout(saveOverlayTimerRef.current);
    };
  }, [taskItem?.id]);
  useEffect(
    () => () => draftAttachmentsRef.current.forEach(releaseDraftAttachment),
    [],
  );
  useLayoutEffect(() => {
    const anchor = commentExpansionAnchorRef.current;
    const container = drawerBodyRef.current;
    if (!anchor || !container || !showAllComments) return;
    container.scrollTop =
      anchor.scrollTop + (container.scrollHeight - anchor.scrollHeight);
    commentExpansionAnchorRef.current = null;
  }, [showAllComments]);
  const documentPasteRef = useRef<any>(null);
  useDocumentPaste((event: any) => documentPasteRef.current?.(event));
  documentPasteRef.current = null;
  if (!taskItem || !form) return null;
  const setMentionActiveIndex = () => undefined;
  const subtasks = isQuoteTask(taskItem) ? [] : state.tasks.filter(
    (item: any) => item.parentTaskId === taskItem.id,
  );
  const history = visibleTaskHistory(taskItem.history);
  const visibleHistory = showAllHistory ? history : history.slice(0, 5);
  const executionActor = deriveExecutionActor(taskItem, state.employees);
  const comments = taskItem.comments || [];
  const visibleComments = showAllComments ? comments : comments.slice(-10);
  const olderCommentsCount = comments.length - visibleComments.length;
  const olderCommentsLabel = olderCommentsCount === 1
    ? "mensagem anterior"
    : "mensagens anteriores";
  const expandComments = () => {
    const container = drawerBodyRef.current;
    if (container) {
      commentExpansionAnchorRef.current = {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
      };
    }
    setShowAllComments(true);
  };
  const isOwnComment = (item: any) =>
    item.author === "Você" ||
    (state.currentUserId &&
      String(item.authorId || "")
        .replace(/[{}]/g, "")
        .toLowerCase() ===
      String(state.currentUserId).replace(/[{}]/g, "").toLowerCase()) ||
    (currentEmployee?.userId &&
      String(item.authorId || "")
        .replace(/[{}]/g, "")
        .toLowerCase() ===
        String(currentEmployee.userId).replace(/[{}]/g, "").toLowerCase()) ||
    (currentEmployee?.name &&
      normalizeText(item.author) === normalizeText(currentEmployee.name));
  const set = (key: any, value: any) =>
    setForm((current: any) => ({ ...current, [key]: value }));
  const setTaskStatus = (value: any) => {
    if (value === "done" && taskItem.status !== "done" && isQuoteTask(taskItem) && !taskItem.parentTaskId) {
      setShowQuoteCompletionPrompt(true);
      return;
    }
    setShowQuoteCompletionPrompt(false);
    set("status", value);
  };
  const visibleAttachments = [
    ...(taskItem.attachments || []).filter(
      (item: any) => !item.returnId && !pendingAttachmentRemovals.includes(item.id),
    ),
    ...draftAttachments,
  ];
  const isDirty =
    ["title", "status", "quoteStatus", "priority", "assignmentMode", "teamIds", "teamNames", "teamId", "teamName", "primaryAssigneeId", "consultantIds", "dueDate", "description", "waitingContext", "personalTagIds", "restrictedVisibility"].some(
      (key) =>
        JSON.stringify(key === "personalTagIds" ? normalizePersonalTagIds(form[key]) : form[key] || "") !== JSON.stringify(key === "personalTagIds" ? normalizePersonalTagIds(taskItem[key]) : taskItem[key] || ""),
    ) ||
    JSON.stringify(form.assigneeName || []) !==
      JSON.stringify(
        normalizeAssigneeNames(
          taskItem.assigneeNames || taskItem.assigneeName,
      ).filter((name) => name !== "Não atribuído"),
      ) ||
    JSON.stringify(form.assigneeIds || []) !== JSON.stringify(taskItem.assigneeIds || []) ||
    comment.length > 0 ||
    draftAttachments.length > 0 ||
    pendingAttachmentRemovals.length > 0;
  const currentDeadlineRole = deadlineRole(taskItem, currentEmployee);
  const headerStatus = statusById(form.status);
  const headerPriority = PRIORITIES.find((item) => item.id === form.priority) || PRIORITIES[1];
  const headerDueDate = form.dueDate ? formatDate(form.dueDate) : "Sem prazo";
  const dueDateChanged =
    String(form.dueDate || "") !== String(taskItem.dueDate || "");
  const deadlineValidation = validateDeadlineChange({
    task: taskItem,
    employee: currentEmployee,
    nextDueDate: form.dueDate,
    reason: form.deadlineChangeReason,
  });
  const waitingValidation = isQuoteTask(taskItem) && taskItem.status === "waiting" && form.status === "waiting"
    ? { allowed: true, error: "" }
    : validateWaitingContext(form.status, form.waitingContext);
  const canRegisterReturn = canRegisterWaitingReturn(taskItem, currentEmployee, teams);
  const selectedEmployees = state.employees.filter((employee: any) =>
    normalizeAssigneeNames(form.assigneeName).includes(employee.name),
  );
  const missingExternalRecipients = selectedEmployees.filter(
    (employee: any) => !employee.externalNotificationsAvailable,
  );
  const requestClose = () => {
    if (saveState !== "idle") return;
    if (isDirty) setShowDiscardPrompt(true);
    else onClose();
  };
  const submitSubtask = () => {
    const title = newSubtaskTitle.trim();
    if (!title) return;
    onAddSubtask(taskItem.id, title, true);
    setNewSubtaskTitle("");
    setIsAddingSubtask(false);
  };
  const submitComment = () => {
    if (!comment.trim()) return;
    onComment(taskItem.id, comment);
    setComment("");
  };
  const handleDraftAttachment = (id: any, filesOrFile: any) =>
    setDraftAttachments((current: any) => [
      ...current,
      ...toAttachmentFiles(filesOrFile).map((file) =>
        createDraftAttachment(file, "edit"),
      ),
    ]);
  const handlePaste = (event: any) => {
    const files = filesFromClipboard(event);
    if (!files.length) return;
    event.preventDefault();
    handleDraftAttachment("paste", files);
  };
  documentPasteRef.current = handlePaste;
  const handleDraftAttachmentDelete = (id: any, attachment: any) => {
    if (attachment?.syncStatus === "pending") {
      releaseDraftAttachment(attachment);
      setDraftAttachments((current: any) =>
        current.filter((item: any) => item.id !== attachment.id),
      );
      return;
    }
    setPendingAttachmentRemovals((current: any) =>
      current.includes(attachment.id) ? current : [...current, attachment.id],
    );
  };
  const handleSave = (allowUnassigned = false, quoteCompletion: any = null) => {
    if (saveState !== "idle") return Promise.resolve(false);
    setValidationError("");
    if (dueDateChanged && !deadlineValidation.allowed) {
      setValidationError(deadlineValidation.error);
      return Promise.resolve(false);
    }
    if (!waitingValidation.allowed) {
      setValidationError(waitingValidation.error);
      return Promise.resolve(false);
    }
    const nextAssignment = resolveTaskAssignment(
      { ...form, assigneeNames: form.assigneeName },
      teams,
      state.employees,
    );
    const missingResponsible = !hasTaskResponsible((nextAssignment as any));
    const missingDueDate = !String(form.dueDate || "").trim();
    if (!allowUnassigned && (missingResponsible || missingDueDate)) {
      setShowUnassignedPrompt(true);
      return Promise.resolve(false);
    }
    const removals = pendingAttachmentRemovals
      .map((attachmentId: any) =>
        (taskItem.attachments || []).find((item: any) => item.id === attachmentId),
      )
      .filter(Boolean);
    const total = 1 + removals.length + draftAttachments.length;
    setSaveProgress({
      label: "Salvando tarefa…",
      detail: "Aplicando alterações",
      current: 0,
      total,
    });
    setSaveState("saving");
    setShowSaveOverlay(false);
    saveOverlayTimerRef.current = window.setTimeout(() => {
      saveOverlayTimerRef.current = null;
      setShowSaveOverlay(true);
    }, 180);
    return Promise.resolve(
      onSave(taskItem.id, {
        title: form.title,
        status: quoteCompletion ? "done" : form.status,
        ...(quoteCompletion || {}),
        priority: form.priority,
        assignmentMode: form.assignmentMode,
        teamIds: form.teamIds || [],
        teamNames: form.teamNames || [],
        teamId: form.teamId || "",
        assigneeIds: form.assigneeIds || [],
        primaryAssigneeId: form.primaryAssigneeId || "",
        consultantIds: form.consultantIds || [],
        assigneeNames: normalizeAssigneeNames(form.assigneeName),
        teamName: form.teamName,
        restrictedVisibility: Boolean(form.restrictedVisibility),
        dueDate: form.dueDate,
        deadlineChangeReason: dueDateChanged
          ? String(form.deadlineChangeReason || "").trim()
          : "",
        actorEmployeeId: currentEmployee?.id || "",
        actorUserId: currentEmployee?.userId || "",
        description: form.description,
        waitingContext: normalizeWaitingContext(form.waitingContext),
        personalTagIds: form.personalTagIds || [],
      }),
    )
      .then((success) => {
        if (!success) throw new Error("Não foi possível salvar a tarefa.");
        setSaveProgress({
          label:
            removals.length || draftAttachments.length
              ? "Atualizando anexos…"
              : "Finalizando…",
          detail: "Tarefa salva",
          current: 1,
          total,
        });
        return removals.reduce(
          (queue: any, attachment: any, index: any) =>
            queue.then((ok: any) => {
              if (!ok) return false;
              setSaveProgress({
                label: "Removendo anexo…",
                detail: attachment.name || `Anexo ${index + 1}`,
                current: 1 + index,
                total,
              });
              return Promise.resolve(
                onDeleteAttachment(taskItem.id, attachment),
              ).then((result) => {
                setSaveProgress({
                  label: "Atualizando anexos…",
                  detail: `${index + 1} de ${total - 1} concluído`,
                  current: 2 + index,
                  total,
                });
                return result;
              });
            }),
          Promise.resolve(true),
        );
      })
      .then((success) => {
        if (!success)
          throw new Error("Não foi possível remover um dos anexos.");
        return draftAttachments.reduce(
          (queue: any, attachment: any, index: any) =>
            queue.then((ok: any) => {
              if (!ok) return false;
              const completed = 1 + removals.length + index;
              setSaveProgress({
                label: `Enviando anexo ${index + 1} de ${draftAttachments.length}…`,
                detail: attachment.name || "Arquivo selecionado",
                current: completed,
                total,
              });
              return Promise.resolve(
                onAttachment(taskItem.id, attachment.file),
              ).then((result) => {
                setSaveProgress({
                  label: "Atualizando anexos…",
                  detail: `${completed + 1} de ${total} concluído`,
                  current: completed + 1,
                  total,
                });
                return result;
              });
            }),
          Promise.resolve(true),
        );
      })
      .then((success) => {
        if (!success) throw new Error("Não foi possível enviar um dos anexos.");
        if (saveOverlayTimerRef.current)
          window.clearTimeout(saveOverlayTimerRef.current);
        saveOverlayTimerRef.current = null;
        setShowSaveOverlay(false);
        setSaveState("success");
        saveCloseTimerRef.current = window.setTimeout(onClose, 620);
        return true;
      })
      .catch((error) => {
        if (saveOverlayTimerRef.current)
          window.clearTimeout(saveOverlayTimerRef.current);
        saveOverlayTimerRef.current = null;
        setShowSaveOverlay(false);
        setSaveState("idle");
        setValidationError(
          error.message || "Não foi possível salvar as alterações.",
        );
        return false;
      });
  };
  return (
    <div
      className="drawer-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <aside className="task-drawer">
        {saveState === "saving" && showSaveOverlay && (
          <div
            className="drawer-save-feedback drawer-progress-feedback"
            role="status"
            aria-live="polite"
          >
            <div className="drawer-progress-icon">
              <LoaderCircle size={27} className="spin" />
            </div>
            <strong>{saveProgress.label}</strong>
            <span>{saveProgress.detail}</span>
            <div
              className="drawer-progress-bar"
              aria-label={`${saveProgress.current} de ${saveProgress.total} etapas concluídas`}
            >
              <i
                style={{
                  width: `${Math.min(100, Math.round((saveProgress.current / Math.max(1, saveProgress.total)) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}
        <header className="drawer-header">
          <div className="drawer-header-main">
            <div className="drawer-header-title-row">
              <span className="eyebrow">Detalhe da tarefa</span>
              <span className="drawer-code">
                {taskItem.quoteCode || "TAREFA"}
              </span>
            </div>
            <div className="drawer-header-context" aria-label="Resumo da tarefa">
              <span className={`drawer-context-item drawer-context-${headerStatus.tone}`}>
                <i aria-hidden="true" />
                {headerStatus.label}
              </span>
              <span className={`drawer-context-item drawer-context-${headerPriority.tone}`}>
                <Flag size={12} aria-hidden="true" />
                {headerPriority.label}
              </span>
              <span className="drawer-context-item drawer-context-date">
                <CalendarDays size={12} aria-hidden="true" />
                {headerDueDate}
              </span>
            </div>
          </div>
          {canRegisterReturn && (
            <button
              className="button button-secondary drawer-return-action"
              type="button"
              onClick={() => onRegisterWaitingReturn?.(taskItem.id)}
              disabled={saveState !== "idle"}
            >
              <CheckCircle2 size={15} />
              Registrar retorno
            </button>
          )}
          <button
            className="icon-button"
            onClick={requestClose}
            aria-label="Fechar detalhe"
            disabled={saveState !== "idle"}
          >
            <X size={19} />
          </button>
        </header>
        <div className="drawer-body" ref={drawerBodyRef} onPaste={handlePaste}>
          <section className="drawer-personal-tags" aria-label="Minhas tags">
            <PersonalTagPicker tags={personalTags} tasks={state.tasks || []} value={form.personalTagIds || []} onChange={(value: any) => set("personalTagIds", value)} onCreate={onCreatePersonalTag} />
          </section>
          <div className="drawer-title">
            <div className="drawer-title-field">
              <div className="drawer-title-label-row">
                <label className="drawer-title-label" htmlFor={`task-title-${taskItem.id}`}>Título da tarefa</label>
                <button
                  className={`task-visibility-button ${form.restrictedVisibility ? "is-active" : ""}`}
                  type="button"
                  onClick={() => set("restrictedVisibility", !form.restrictedVisibility)}
                  aria-label={form.restrictedVisibility ? "Mostrar tarefa para todos" : "Mostrar tarefa somente para responsáveis e criador"}
                  aria-pressed={Boolean(form.restrictedVisibility)}
                  title={form.restrictedVisibility ? "Mostrar para todos" : "Restringir aos responsáveis e criador"}
                >
                  {form.restrictedVisibility ? <EyeOff key="restricted" size={17} /> : <Eye key="public" size={17} />}
                </button>
              </div>
              <input
                id={`task-title-${taskItem.id}`}
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Escreva o título da tarefa"
                aria-label="Título da tarefa"
              />
            </div>
          </div>
          {taskItem.quoteId && (
            <button
              className="linked-record"
              onClick={() => onOpenQuote(taskItem.quoteId)}
            >
              <FileText size={16} />
              <span>
                <small>Cotação vinculada</small>
                <strong>
                  {taskItem.quoteCode} · {taskItem.quoteTitle}
                </strong>
              </span>
              <ArrowUpRight size={15} />
            </button>
          )}
          <div className="drawer-field-grid">
            <div className="drawer-status-priority-grid">
              <div className="status-field">
                <span className="status-field-label">Status</span>
                <StatusPicker value={form.status} onChange={setTaskStatus} />
              </div>
              <div className="priority-field">
                <span className="priority-field-label">Prioridade</span>
                <PriorityPicker
                  value={form.priority}
                  onChange={(value: any) => set("priority", value)}
                  includeUrgent
                />
              </div>
            </div>
            <div className="drawer-assignment-deadline-grid">
              <AssignmentFields form={form} setForm={setForm} employees={state.employees} teams={teams} />
              <label className="deadline-field">
                Prazo
                <DateInput
                  type="date"
                  value={form.dueDate || ""}
                  onChange={(event: any) => set("dueDate", event.target.value)}
                  title={currentDeadlineRole === "viewer" ? "Qualquer usuário pode alterar; informe o motivo" : ""}
                />
              </label>
            </div>
          </div>
          {form.status === "waiting" && (
            <WaitingContextFields
              value={form.waitingContext}
              onChange={(value: any) => set("waitingContext", value)}
              employees={state.employees}
              teams={teams}
              error={validationError && !waitingValidation.allowed ? validationError : ""}
            />
          )}
          <section className="drawer-section execution-section" aria-label="Execução atual">
            <div className="drawer-section-heading">
              <h3>Execução atual</h3>
              {executionActor && <span className="section-count"><Play size={11} aria-hidden="true" /></span>}
            </div>
            {executionActor ? (
              <div className="execution-summary" title={formatCommentTimestamp(executionActor.occurredAt)}>
                <Avatar name={executionActor.name} small />
                <div>
                  <strong>Em andamento por {executionActor.name}</strong>
                  <small>Iniciada {formatRelativeTimestamp(executionActor.occurredAt)} · {formatCommentTimestamp(executionActor.occurredAt)}</small>
                </div>
              </div>
            ) : (
              <div className="empty-inline">Nenhum executor identificado para a execução atual.</div>
            )}
          </section>
          {dueDateChanged && currentDeadlineRole !== "creator" && (
            <label className="deadline-reason">
              Motivo da alteração do prazo
              <textarea value={form.deadlineChangeReason || ""} onChange={(event) => set("deadlineChangeReason", event.target.value)} rows={2} placeholder="Explique por que o prazo precisa mudar" />
            </label>
          )}
          {missingExternalRecipients.length > 0 && (
            <div className="external-notification-warning" role="status">
              <BellRing size={15} />
              <span>{missingExternalRecipients.map((employee: any) => employee.name).join(", ")} não receberá Teams/e-mail até ter usuário Microsoft vinculado.</span>
            </div>
          )}
          {validationError && (form.status !== "waiting" || waitingValidation.allowed) && (
            <div className="field-error" role="alert">
              {validationError}
            </div>
          )}
          <label className="drawer-description">
            Descrição
            <textarea
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              rows={4}
            />
          </label>
          <TaskReturnsSection task={taskItem} currentEmployee={currentEmployee} loadAttachmentContent={loadAttachmentContent} onDeleteAttachment={onDeleteAttachment} />
          <section className="drawer-section">
            <div className="drawer-section-heading">
              <h3>{isQuoteTask(taskItem) ? "Checklist" : taskItem.checklist?.length && !subtasks.length ? "Checklist do Planner" : "Subtarefas"}</h3>
              <div className="drawer-heading-actions">
                {!isQuoteTask(taskItem) && <label className="checklist-visibility-toggle">
                  <input
                    type="checkbox"
                    checked={showChecklistOnCard}
                    aria-label="Mostrar subtarefas no quadro"
                    onChange={(event) =>
                      onToggleChecklistOnCard(event.target.checked)
                    }
                  />
                  <span>Mostrar no quadro</span>
                </label>}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setIsAddingSubtask(true)}
                >
                  <Plus size={14} />
                  {isQuoteTask(taskItem) ? "Adicionar item" : "Adicionar"}
                </button>
              </div>
            </div>
            {isAddingSubtask && (
              <div className="subtask-inline-create">
                <span className="subtask-check" aria-hidden="true" />
                <input
                  autoFocus
                  value={newSubtaskTitle}
                  onChange={(event) => setNewSubtaskTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitSubtask();
                    if (event.key === "Escape") {
                      setNewSubtaskTitle("");
                      setIsAddingSubtask(false);
                    }
                  }}
                  placeholder={isQuoteTask(taskItem) ? "Digite o item do checklist" : "Digite o título da subtarefa"}
                  aria-label={isQuoteTask(taskItem) ? "Item do checklist" : "Título da subtarefa"}
                />
                <button
                  className="subtask-inline-action"
                  type="button"
                  onClick={submitSubtask}
                  disabled={!newSubtaskTitle.trim()}
                  aria-label={isQuoteTask(taskItem) ? "Salvar item do checklist" : "Salvar subtarefa"}
                >
                  <Check size={15} />
                </button>
              </div>
            )}
            {taskItem.checklist?.length && !subtasks.length
              ? <div className="subtask-list" aria-label="Checklist importado do Planner">
                  {taskItem.checklist.filter((item: any) => item?.title).map((item: any) => {
                    const content = <><span className="subtask-toggle" aria-hidden="true"><span className={`subtask-check ${item.done ? "checked" : ""}`}>{item.done && <Check size={13} />}</span></span><span>{item.title}</span></>;
                    return isQuoteTask(taskItem)
                      ? <button className={`subtask-row ${item.done ? "is-complete" : ""}`} type="button" key={item.id} onClick={() => onSave(taskItem.id, { checklist: taskItem.checklist.map((checkItem: any) => checkItem.id === item.id ? { ...checkItem, done: !checkItem.done } : checkItem) })}>{content}</button>
                      : <div className={`subtask-row ${item.done ? "is-complete" : ""}`} key={item.id}>{content}</div>;
                  })}
                </div>
              : subtasks.length
              ? subtasks.map((subtask: any) => (
                  <div className="subtask-row" key={subtask.id}>
                    <button
                      className="subtask-toggle"
                      type="button"
                      disabled={subtask.syncStatus === "syncing"}
                      onClick={() =>
                        onSave(subtask.id, {
                          status: subtask.status === "done" ? "todo" : "done",
                        })
                      }
                    >
                      <span
                        className={`subtask-check ${subtask.status === "done" ? "checked" : ""}`}
                      >
                        {subtask.status === "done" && <Check size={13} />}
                      </span>
                      <span>{subtask.title}</span>
                      <small>
                        {subtask.syncStatus === "syncing"
                          ? "Sincronizando..."
                          : formatDate(subtask.dueDate)}
                      </small>
                    </button>
                    {subtaskToDelete?.id === subtask.id ? (
                      <div
                        className="subtask-remove-confirm"
                        role="group"
                        aria-label={`Confirmar remoção de ${subtask.title}`}
                      >
                        <button
                          className="button button-danger"
                          type="button"
                          onClick={() => {
                            setSubtaskToDelete(null);
                            onDelete(subtask.id);
                          }}
                        >
                          Remover
                        </button>
                        <button
                          className="button button-quiet"
                          type="button"
                          onClick={() => setSubtaskToDelete(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        className="subtask-delete"
                        type="button"
                        disabled={subtask.syncStatus === "syncing"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSubtaskToDelete(subtask);
                        }}
                        aria-label="Excluir subtarefa"
                        title="Excluir subtarefa"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))
              : !isAddingSubtask && (
                  <div className="empty-inline">
                    Nenhuma subtarefa adicionada.
                  </div>
                )}
          </section>
          <section className="drawer-section">
            <div className="drawer-section-heading">
              <div className="comment-section-title">
                <h3>Comentários</h3>
                <span className="section-count">{comments.length}</span>
              </div>
              <span className="comment-section-helper">Mensagens da equipe</span>
            </div>
            {olderCommentsCount > 0 && (
              <button
                type="button"
                className="comment-history-toggle"
                onClick={expandComments}
              >
                <ChevronUp size={14} aria-hidden="true" />
                Mostrar {olderCommentsCount} {olderCommentsLabel}
              </button>
            )}
            {comments.length ? visibleComments.map((item: any, index: any) => (
              <article
                className={`comment-row ${showAllComments && index < olderCommentsCount ? "comment-row-history" : ""} ${isOwnComment(item) ? "comment-own" : ""} ${item.syncStatus === "syncing" ? "item-syncing" : ""}`}
                key={item.id}
              >
                <Avatar name={item.author} small />
                <div className="comment-bubble">
                  <header>
                    <strong>{item.author}</strong>
                    <time dateTime={item.createdAt}>{formatCommentTimestamp(item.createdAt)}</time>
                  </header>
                  <p>{item.text}</p>
                  {item.syncStatus === "syncing" && <small className="comment-sync-status">Enviando…</small>}
                </div>
              </article>
            )) : (
              <div className="comment-empty-state">
                <MessageCircle size={18} aria-hidden="true" />
                <strong>Comece a conversa</strong>
                <span>Registre uma atualização para manter a equipe alinhada.</span>
              </div>
            )}
            <div className="comment-compose">
              <div className="comment-mention-field">
                <MentionableField
                  value={comment}
                  onChange={setComment}
                  employees={state.employees}
                  multiline
                  onSubmit={submitComment}
                  aria-label="Nova atualização da tarefa"
                  placeholder="O que a equipe precisa saber?"
                  maxLength={1000}
                  rows={2}
                />
              </div>
              <div className="comment-compose-footer">
                <button className="button button-secondary comment-submit" aria-label="Enviar comentário" title="Enviar comentário" disabled={!comment.trim()} onClick={submitComment}>
                  <Send size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
          <AttachmentSection
            taskId={taskItem.id}
            attachments={visibleAttachments}
            loadAttachmentContent={loadAttachmentContent}
            onAttachment={handleDraftAttachment}
            onDeleteAttachment={handleDraftAttachmentDelete}
            helperText="As alterações nos anexos só são enviadas ao clicar em Salvar tarefa."
          />
          <section className="drawer-section history-section">
            <div className="drawer-section-heading">
              <button className="history-toggle" type="button" onClick={() => setShowHistory((current: any) => !current)} aria-expanded={showHistory}>
                <span className="history-heading"><strong>Histórico da tarefa</strong><small>Alterações registradas nesta tarefa</small></span>
                <span className="section-count">{history.length}</span>
                {showHistory ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </button>
            </div>
            {showHistory && (
              history.length ? <div className="task-history-list">
                {visibleHistory.map((item, index) => {
                  const details = taskHistoryDetails(item, state.employees);
                  const date = new Date((item.createdAt as any));
                  const day = Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
                  const previous = visibleHistory[index - 1];
                  const previousDate = previous && new Date((previous.createdAt as any));
                  const previousDay = previousDate && !Number.isNaN(previousDate.getTime()) ? previousDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Data não informada";
                  return <React.Fragment key={item.id || `${item.createdAt}-${index}`}>
                    {day !== previousDay && <div className="task-history-day">{day}</div>}
                    <div className="task-history-event">
                      <span className="task-history-marker" aria-hidden="true" />
                      <div className="task-history-content">
                        <p>{details.title}</p>
                        {details.before !== undefined && <div className="task-history-change"><span>{details.before}</span><ChevronRight size={13} aria-hidden="true" /><strong>{details.after}</strong></div>}
                        {details.detail && <div className="task-history-detail">{details.detail}</div>}
                        <div className="task-history-meta"><span>{(item as any).author || "Sistema"}</span><time dateTime={item.createdAt || undefined}>{Number.isNaN(date.getTime()) ? "Horário não informado" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></div>
                      </div>
                    </div>
                  </React.Fragment>;
                })}
                {history.length > 5 && <button className="task-history-more" type="button" onClick={() => setShowAllHistory((current: any) => !current)}>{showAllHistory ? "Mostrar menos" : `Mostrar mais ${history.length - 5} alterações`}</button>}
              </div> : <div className="task-history-empty">Nenhuma alteração registrada nesta tarefa.</div>
            )}
          </section>
        </div>
        <footer className="drawer-footer">
          <button
            className="button button-danger task-delete-button"
            type="button"
            onClick={onRequestDelete}
            disabled={deleteState !== "idle" || saveState !== "idle"}
          >
            <Trash2 size={15} />
            Excluir
          </button>
          <button
            className="button button-quiet"
            onClick={requestClose}
            disabled={saveState !== "idle"}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={saveState !== "idle"}
            onClick={() => handleSave()}
          >
            {saveState === "saving" ? (
              <>
                <LoaderCircle size={16} className="spin" />
                {saveProgress.label}
              </>
            ) : (
              <>
                <Check size={16} />
                Salvar tarefa
              </>
            )}
          </button>
        </footer>
        {saveState === "success" && (
          <div
            className="drawer-save-feedback"
            role="status"
            aria-live="polite"
          >
            <div className="drawer-save-icon">
              <Check size={30} strokeWidth={2.5} />
            </div>
            <strong>Tarefa salva</strong>
            <span>Fechando detalhe…</span>
          </div>
        )}
        {deleteState === "deleting" && (
          <div
            className="drawer-delete-feedback"
            role="status"
            aria-live="polite"
          >
            <div className="drawer-delete-icon">
              <Trash2 size={30} strokeWidth={2.5} />
            </div>
            <strong>Tarefa excluída</strong>
            <span>Removendo do Planner…</span>
          </div>
        )}
        {showDiscardPrompt && (
          <UnsavedChangesDialog
            onContinue={() => setShowDiscardPrompt(false)}
            onDiscard={onClose}
          />
        )}
        {showUnassignedPrompt && (
          <UnassignedTaskDialog
            taskTitle={taskItem.title}
            missingResponsible={!hasTaskResponsible((resolveTaskAssignment(
              { ...form, assigneeNames: form.assigneeName },
              teams,
              state.employees,
            ) as any))}
            missingDueDate={!String(form.dueDate || "").trim()}
            onCancel={() => setShowUnassignedPrompt(false)}
            onConfirm={() => {
              setShowUnassignedPrompt(false);
              handleSave(true);
            }}
          />
        )}
        {showQuoteCompletionPrompt && (
          <QuoteCompletionDialog
            quote={(state.quotes || []).find((item: any) => item.id === taskItem.quoteId)}
            onCancel={() => setShowQuoteCompletionPrompt(false)}
            onConfirm={() => { setShowQuoteCompletionPrompt(false); onOpenQuote(taskItem.quoteId, "outcome"); }}
          />
        )}
        {showDeletePrompt && (
          <DeleteTaskDialog
            taskTitle={taskItem.title}
            onCancel={onCancelDelete}
            onConfirm={onConfirmDelete}
          />
        )}
      </aside>
    </div>
  );
}

export function TaskDrawer({ task, onDelete, ...props }: any) {
  const [showDeletePrompt, setShowDeletePrompt] = useState<any>(false);
  const [deleteState, setDeleteState] = useState<any>("idle");
  if (!task) return null;
  const confirmDelete = () => {
    setShowDeletePrompt(false);
    setDeleteState("deleting");
    window.setTimeout(() => {
      Promise.resolve(onDelete(task.id)).finally(() => setDeleteState("idle"));
    }, 620);
  };
  return (
    <TaskDrawerContent
      task={task}
      onDelete={onDelete}
      onRequestDelete={() => setShowDeletePrompt(true)}
      deleteState={deleteState}
      showDeletePrompt={showDeletePrompt}
      onCancelDelete={() => setShowDeletePrompt(false)}
      onConfirmDelete={confirmDelete}
      loadAttachmentContent={
        props.loadAttachmentContent || globalThis.__plannerAttachmentLoader
      }
      {...props}
    />
  );
}
