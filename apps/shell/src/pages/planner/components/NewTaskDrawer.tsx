// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { EMPTY_WAITING_CONTEXT, hasTaskResponsible, normalizePersonalTagIds, resolveTaskAssignment, validateWaitingContext } from '../domain/domain'
import AssignmentFields from './AssignmentFields'
import { AttachmentSection } from './Attachments'
import { StatusPicker } from './Badges'
import { DateInput } from './DateInput'
import { UnassignedTaskDialog, UnsavedChangesDialog } from './Dialogs'
import { PersonalTagPicker } from './PersonalTags'
import PriorityPicker from './PriorityPicker'
import { WaitingContextFields } from './WaitingContextFields'
import { createDraftAttachment, filesFromClipboard, releaseDraftAttachment, toAttachmentFiles, useDocumentPaste } from './attachmentFiles'
import { Check, Eye, EyeOff, LoaderCircle, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'


export function InlineSubtasksEditor({ items, setItems }: any) {
  const [draft, setDraft] = useState<any>("");
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<any>(null);
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setItems((current: any) => [...current, title]);
    setDraft("");
  };
  return (
    <section className="creation-subtasks" data-empty={items.length === 0 ? "true" : "false"}>
      <div className="drawer-section-heading">
        <h3>Subtarefas</h3>
        <span className="section-hint">opcional</span>
      </div>
      {items.map((title: any, index: any) => (
        <div className="creation-subtask-row" key={`${title}-${index}`}>
          <span className="subtask-check" aria-hidden="true" />
          <span>{title}</span>
          {pendingDeleteIndex === index ? (
            <div
              className="subtask-remove-confirm"
              role="group"
              aria-label={`Confirmar remoção de ${title}`}
            >
              <button
                className="button button-danger"
                type="button"
                onClick={() => {
                  setItems((current: any) =>
                    current.filter((_: any, itemIndex: any) => itemIndex !== index),
                  );
                  setPendingDeleteIndex(null);
                }}
              >
                Remover
              </button>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setPendingDeleteIndex(null)}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              className="subtask-delete creation-subtask-delete"
              type="button"
              onClick={() => setPendingDeleteIndex(index)}
              aria-label={`Remover subtarefa ${title}`}
              title="Remover subtarefa"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      <div className="creation-subtask-input">
        <span className="subtask-check" aria-hidden="true" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Adicionar subtarefa"
          aria-label="Título da subtarefa"
        />
        <button
          className="subtask-inline-action"
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          aria-label="Adicionar subtarefa"
        >
          <Plus size={14} />
        </button>
      </div>
    </section>
  );
}

export function NewTaskDrawer({ employees = [], teams = [], personalTags = [], tasks = [], onCreatePersonalTag, initialStatus = "todo", initialInput = {}, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    title: "",
    status: initialStatus,
    priority: "medium",
    assignmentMode: "team",
    teamIds: [],
    teamNames: [],
    teamId: "",
    assigneeName: [],
    assigneeIds: [],
    primaryAssigneeId: "",
    consultantIds: [],
    teamName: "",
    restrictedVisibility: true,
    dueDate: "",
    description: "",
    waitingContext: { ...EMPTY_WAITING_CONTEXT },
    ...initialInput,
    personalTagIds: normalizePersonalTagIds(initialInput.personalTagIds),
  });
  const [draftAttachments, setDraftAttachments] = useState<any>([]);
  const [subtasks, setSubtasks] = useState<any>([]);
  const initialFormRef = useRef<any>(form);
  const draftAttachmentsRef = useRef<any>([]);
  draftAttachmentsRef.current = draftAttachments;
  const [showDiscardPrompt, setShowDiscardPrompt] = useState<any>(false);
  const [showUnassignedPrompt, setShowUnassignedPrompt] = useState<any>(false);
  const [saveState, setSaveState] = useState<any>("idle");
  const [validationError, setValidationError] = useState<any>("");
  const [saveProgress, setSaveProgress] = useState<any>({
    label: "Criando tarefa…",
    detail: "Preparando dados",
    current: 0,
    total: 1,
  });
  const saveCloseTimerRef = useRef<any>(null);
  useEffect(
    () => () => {
      if (saveCloseTimerRef.current)
        window.clearTimeout(saveCloseTimerRef.current);
      draftAttachmentsRef.current.forEach(releaseDraftAttachment);
    },
    [],
  );
  const isDirty =
    Object.keys(initialFormRef.current).some(
      (key) =>
        JSON.stringify(form[key]) !==
        JSON.stringify(initialFormRef.current[key]),
    ) || draftAttachments.length > 0 || subtasks.length > 0;
  const requestClose = () => {
    if (saveState !== "idle") return;
    if (isDirty) setShowDiscardPrompt(true);
    else onClose();
  };
  const set = (key: any, value: any) =>
    setForm((current: any) => ({ ...current, [key]: value }));
  const handleDraftAttachment = (id: any, filesOrFile: any) =>
    setDraftAttachments((current: any) => [
      ...current,
      ...toAttachmentFiles(filesOrFile).map((file) =>
        createDraftAttachment(file, "new"),
      ),
    ]);
  const handlePaste = (event: any) => {
    const files = filesFromClipboard(event);
    if (!files.length) return;
    event.preventDefault();
    handleDraftAttachment("paste", files);
  };
  useDocumentPaste(handlePaste);
  const handleDraftAttachmentDelete = (id: any, attachment: any) => {
    releaseDraftAttachment(attachment);
    setDraftAttachments((current: any) =>
      current.filter((item: any) => item.id !== attachment.id),
    );
  };
  const handleCreate = (allowUnassigned = false) => {
    if (saveState !== "idle" || !form.title.trim()) return;
    const waitingValidation = validateWaitingContext(form.status, form.waitingContext);
    if (!waitingValidation.allowed) {
      setValidationError(waitingValidation.error);
      return;
    }
    const assignment = resolveTaskAssignment(form, teams, employees);
    const missingResponsible = !hasTaskResponsible((assignment as any));
    const missingDueDate = !String(form.dueDate || "").trim();
    if (!allowUnassigned && (missingResponsible || missingDueDate)) {
      setShowUnassignedPrompt(true);
      return;
    }
    setValidationError("");
    setSaveProgress({
      label: "Criando tarefa…",
      detail: draftAttachments.length
        ? "Salvando dados antes dos anexos"
        : "Preparando tarefa",
      current: 0,
      total: 1 + draftAttachments.length,
    });
    setSaveState("saving");
    Promise.resolve()
      .then(() =>
        onSave({
          ...form,
          attachments: draftAttachments,
          subtasks,
          onProgress: setSaveProgress,
        }),
      )
      .then((success) => {
        if (!success) {
          setSaveState("idle");
          return;
        }
        setSaveState("success");
        saveCloseTimerRef.current = window.setTimeout(onClose, 680);
      })
      .catch(() => setSaveState("idle"));
  };
  return (
    <div
      className="drawer-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <aside className="task-drawer new-task-drawer">
        {saveState === "saving" && (
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
          <div>
            <span className="eyebrow">Nova tarefa</span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={requestClose}
            aria-label="Fechar criação"
            disabled={saveState !== "idle"}
          >
            <X size={19} />
          </button>
        </header>
        <div className="drawer-body" onPaste={handlePaste}>
          <section className="drawer-personal-tags" aria-label="Minhas tags">
            <PersonalTagPicker tags={personalTags} tasks={tasks} value={form.personalTagIds || []} onChange={(value: any) => set("personalTagIds", value)} onCreate={onCreatePersonalTag} showAllTags />
          </section>
          <div className="drawer-title">
            <div className="drawer-title-field">
              <div className="drawer-title-label-row">
                <label className="drawer-title-label" htmlFor="new-task-title">Título da tarefa</label>
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
                id="new-task-title"
                autoFocus
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Ex.: Confirmar motorista"
                aria-label="Título da tarefa"
              />
            </div>
          </div>
          <div className="drawer-field-grid new-task-quick-fields">
            <div className="drawer-status-priority-grid">
              <div className="status-field">
                <span className="status-field-label">Status</span>
                <StatusPicker
                  value={form.status}
                  onChange={(value: any) => set("status", value)}
                />
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
              <AssignmentFields form={form} setForm={setForm} employees={employees} teams={teams} />
              <label className="deadline-field">
                Prazo
                <DateInput
                  type="date"
                  value={form.dueDate}
                  onChange={(event: any) => set("dueDate", event.target.value)}
                />
              </label>
            </div>
          </div>
          {form.status === "waiting" && (
            <WaitingContextFields
              value={form.waitingContext}
              onChange={(value: any) => set("waitingContext", value)}
              employees={employees}
              teams={teams}
              error={validationError}
            />
          )}
          {validationError && form.status !== "waiting" && (
            <div className="field-error" role="alert">{validationError}</div>
          )}
          <label className="drawer-description">
            Descrição
            <textarea
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              rows={5}
              placeholder="Adicione contexto para quem vai executar..."
            />
          </label>
          <AttachmentSection
            taskId="new-task"
            attachments={draftAttachments}
            onAttachment={handleDraftAttachment}
            onDeleteAttachment={handleDraftAttachmentDelete}
            helperText="Os arquivos só serão enviados quando você clicar em Criar tarefa."
          />
          <InlineSubtasksEditor items={subtasks} setItems={setSubtasks} />
          <div className="creation-note">
            <Sparkles size={16} />
            <span>
              Preencha os dados e confirme em Criar tarefa para salvar tudo de
              uma vez.
            </span>
          </div>
        </div>
        <footer className="drawer-footer">
          <button
            className="button button-quiet"
            type="button"
            onClick={requestClose}
            disabled={saveState !== "idle"}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!form.title.trim() || saveState !== "idle"}
            onClick={() => handleCreate()}
          >
            {saveState === "saving" ? (
              <>
                <LoaderCircle size={16} className="spin" />
                {saveProgress.label}
              </>
            ) : (
              <>
                <Plus size={16} />
                Criar tarefa
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
            <strong>Tarefa criada</strong>
            <span>Fechando…</span>
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
            isCreation
            missingResponsible={!hasTaskResponsible((resolveTaskAssignment(form, teams, employees) as any))}
            missingDueDate={!String(form.dueDate || "").trim()}
            onCancel={() => setShowUnassignedPrompt(false)}
            onConfirm={() => {
              setShowUnassignedPrompt(false);
              handleCreate(true);
            }}
          />
        )}
      </aside>
    </div>
  );
}
