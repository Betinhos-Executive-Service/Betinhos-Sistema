// Porte de Tela Planner/src/ContactsView.jsx (sem mudança de comportamento).
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  CheckCircle2,
  Clock3,
  ChevronDown,
  Columns3,
  FileText,
  Flag,
  Inbox,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import SearchableSelect from '../components/SearchableSelect';
import AssignmentFields from '../components/AssignmentFields';
import PageHeader from '../components/PageHeader';
import { DateInput } from '../components/DateInput';
import {
  CONTACT_CHANNELS,
  CONTACT_PRIORITIES,
  CONTACT_STATUSES,
  CONTACT_STATUS_TRANSITIONS,
  contactChannelLabel,
  contactPermissions,
  contactPriorityLabel,
  contactStatusLabel,
  contactIsOverdue,
  filterContacts,
  sortContacts,
  validateContact,
} from '../domain/contactDomain';

const CHANNEL_ICON = { whatsapp: MessageCircle, email: Mail, phone: Phone };
const STATUS_ICON = { new: MessageCircle, in_progress: Send, waiting: Clock3, done: CheckCircle2 };
const EMPTY_FILTERS = { query: "", channel: "", status: "", priority: "", owner: "", team: "", overdue: false, includeCompleted: false, includeArchived: false, mine: false };
const MAX_CONTACT_ATTACHMENT_SIZE = 5 * 1024 * 1024;

function formatContactDate(value: any, withTime = false) {
  if (!value) return "Sem data";
  const date = new Date(withTime ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", withTime ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" }).format(date).replace(" de ", " ");
}

function contactAttachmentFiles(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value.length === "number" && !value.name) return Array.from(value).filter(Boolean);
  return [value];
}

function createContactDraftAttachment(file: any) {
  return {
    id: `contact-draft-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
    name: file.name || "Arquivo",
    mimeType: file.type || "",
    size: file.size || 0,
    previewUrl: globalThis.URL?.createObjectURL ? globalThis.URL.createObjectURL(file) : "",
    file,
    syncStatus: "pending",
  };
}

function releaseContactDraftAttachment(attachment: any) {
  if (attachment?.previewUrl?.startsWith("blob:") && globalThis.URL?.revokeObjectURL) globalThis.URL.revokeObjectURL(attachment.previewUrl);
}

function contactFilesFromClipboard(event: any) {
  const clipboard = event.clipboardData;
  const files = Array.from(clipboard?.files || []).filter(Boolean);
  if (files.length) return files;
  return Array.from(clipboard?.items || []).filter((item) => (item as any).kind === "file").map((item) => (item as any).getAsFile?.()).filter(Boolean);
}

function ContactStatusPicker({ value, onChange, disabled = false, options = CONTACT_STATUSES }: any) {
  const selected = CONTACT_STATUSES.find((item) => item.id === value) || CONTACT_STATUSES[0];
  return (
    <div className="status-picker contact-status-picker" role="group" aria-label={`Status atual: ${selected.label}`}>
      <div className="status-picker-options">
        {options.map((item: any) => {
          const Icon = (STATUS_ICON as any)[item.id] || CheckCircle2;
          const active = item.id === value;
          return (
            <button key={item.id} type="button" className={`status-option status-option-${item.id}${active ? " is-selected" : ""}`} aria-label={item.label} aria-pressed={active} title={item.label} disabled={disabled} onClick={() => onChange(item.id)}>
              <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <span className="status-picker-current">{selected.label}</span>
    </div>
  );
}

function ContactPriorityPicker({ value, onChange, disabled = false }: any) {
  const selected = CONTACT_PRIORITIES.find((item) => item.id === value) || CONTACT_PRIORITIES[1];
  return (
    <div className="priority-picker contact-priority-picker" role="group" aria-label={`Prioridade atual: ${selected.label}`}>
      <div className="priority-picker-options">
        {CONTACT_PRIORITIES.map((item) => {
          const active = item.id === value;
          return (
            <button key={item.id} type="button" className={`priority-option priority-option-${item.id}${active ? " is-selected" : ""}`} aria-label={item.label} aria-pressed={active} title={item.label} disabled={disabled} onClick={() => onChange(item.id)}>
              <Flag size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <span className="priority-picker-current">{contactPriorityLabel(selected.id)}</span>
    </div>
  );
}

function emptyDraft(currentEmployee: any) {
  return {
    subject: "",
    senderName: "",
    senderPhone: "",
    senderEmail: "",
    priority: "medium",
    status: "new",
    assignmentMode: "people",
    teamIds: [],
    teamNames: [],
    teamId: "",
    teamName: "",
    assigneeName: currentEmployee?.name ? [currentEmployee.name] : [],
    assigneeIds: currentEmployee?.id ? [currentEmployee.id] : [],
    ownerEmployeeId: currentEmployee?.id || "",
    ownerName: currentEmployee?.name || "Não atribuído",
    receivedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    summary: "",
    message: "",
    lastMessage: "",
    dueDate: "",
    waitingNote: "",
    clientId: "",
    quoteId: "",
    resolutionOutcome: "",
    sourceUrl: "",
  };
}

function draftFromContact(contact: any) {
  const assigneeIds = Array.isArray(contact.assigneeIds) && contact.assigneeIds.length
    ? contact.assigneeIds
    : contact.ownerEmployeeId
      ? [contact.ownerEmployeeId]
      : [];
  const assigneeName = Array.isArray(contact.assigneeName)
    ? contact.assigneeName
    : Array.isArray(contact.assigneeNames) && contact.assigneeNames.length
      ? contact.assigneeNames
      : contact.ownerName
        ? [contact.ownerName]
        : [];
  const teamIds = Array.isArray(contact.teamIds)
    ? contact.teamIds
    : contact.teamId
      ? [contact.teamId]
      : [];
  const teamNames = Array.isArray(contact.teamNames)
    ? contact.teamNames
    : contact.teamName
      ? [contact.teamName]
      : [];
  return {
    ...contact,
    assignmentMode: contact.assignmentMode === "team" ? "team" : "people",
    teamIds,
    teamNames,
    teamId: contact.teamId || teamIds[0] || "",
    teamName: contact.teamName || teamNames.join(", "),
    assigneeIds,
    assigneeName,
    ownerEmployeeId: contact.ownerEmployeeId || assigneeIds[0] || "",
    ownerName: contact.ownerName || assigneeName[0] || teamNames.join(", ") || "Não atribuído",
  };
}

function assignmentKey(value: any = {}) {
  const asList = (entry: any) => (Array.isArray(entry) ? entry : entry ? [entry] : []).map(String);
  return JSON.stringify({
    assignmentMode: value.assignmentMode === "team" ? "team" : "people",
    teamIds: asList(value.teamIds || value.teamId),
    assigneeIds: asList(value.assigneeIds || value.ownerEmployeeId),
    assigneeNames: asList(value.assigneeNames || value.assigneeName || value.ownerName),
  });
}

function ContactDrawer({
  contact,
  currentEmployee,
  employees,
  teams,
  quotes,
  tasks,
  AttachmentSectionComponent,
  loadAttachmentContent,
  onClose,
  onSave,
  onAddNote,
  onAttachment,
  onDeleteAttachment,
  onCreateTask,
  onArchive,
  isNew = false,
}: any) {
  const [draft, setDraft] = useState<any>(() => (isNew ? emptyDraft(currentEmployee) : draftFromContact(contact)));
  const [draftAttachments, setDraftAttachments] = useState<any>([]);
  const draftAttachmentsRef = useRef<any>([]);
  const [note, setNote] = useState<any>("");
  const [saving, setSaving] = useState<any>(false);
  const [saveError, setSaveError] = useState<any>("");
  const [attachmentError, setAttachmentError] = useState<any>("");
  draftAttachmentsRef.current = draftAttachments;
  useEffect(() => () => draftAttachmentsRef.current.forEach(releaseContactDraftAttachment), []);
  const permissions = contactPermissions(contact || draft, { employeeId: currentEmployee?.id, isManager: currentEmployee?.isManager });
  const isArchived = Boolean(contact?.archivedAt);
  const canEdit = (isNew || permissions.canEdit) && !isArchived;
  const quoteOptions = [{ value: "", label: "Sem vínculo" }, ...quotes.map((quote: any) => ({ value: quote.id, label: `${quote.code || "Cotação"} · ${quote.title || quote.client || ""}`, search: `${quote.code || ""} ${quote.title || ""} ${quote.client || ""}` }))];
  const relatedTasks = (tasks || []).filter((task: any) => task.contactId === contact?.id || contact?.linkedTaskIds?.includes(task.id));
  const ChannelIcon = (CHANNEL_ICON as any)[draft.channel] || MessageCircle;
  const availableStatuses = isNew ? CONTACT_STATUSES : CONTACT_STATUSES.filter((item) => (CONTACT_STATUS_TRANSITIONS[contact.status] || [contact.status]).includes(item.id));
  const update = (key: any, value: any) => setDraft((current: any) => ({ ...current, [key]: value }));
  const setAssignmentForm = (updater: any) => setDraft((current: any) => {
    const next = typeof updater === "function" ? updater(current) : updater;
    const assigneeIds = Array.isArray(next.assigneeIds) ? next.assigneeIds : [];
    const primary = employees.find((employee: any) => String(employee.id) === String(assigneeIds[0]));
    const selectedNames = Array.isArray(next.assigneeName) ? next.assigneeName : [];
    const teamLabel = Array.isArray(next.teamNames) ? next.teamNames.filter(Boolean).join(", ") : "";
    const assignmentLabel = next.assignmentMode === "team"
      ? teamLabel || primary?.name
      : primary?.name || selectedNames[0];
    return {
      ...next,
      ownerEmployeeId: primary?.id || "",
      ownerName: assignmentLabel || "Não atribuído",
    };
  });
  const assignmentChanged = !isNew && assignmentKey(draft) !== assignmentKey(contact);
  const submit = async (event: any) => {
    event.preventDefault();
    setSaveError("");
    const validation = validateContact(draft);
    if (!validation.allowed) {
      setSaveError(validation.error);
      return;
    }
    setSaving(true);
    try {
      const success = await onSave(isNew ? { ...draft, attachments: draftAttachments } : draft);
      if (!success) setSaveError("Não foi possível salvar o caso.");
      else onClose();
    } catch (error: any) {
      setSaveError(error.message || "Não foi possível salvar o caso.");
    } finally {
      setSaving(false);
    }
  };
  const handleDraftAttachment = (id: any, filesOrFile: any) => {
    const files = contactAttachmentFiles(filesOrFile);
    if (!files.length) return;
    const oversized = files.filter((file) => Number(file?.size || 0) > MAX_CONTACT_ATTACHMENT_SIZE);
    const validFiles = files.filter((file) => Number(file?.size || 0) <= MAX_CONTACT_ATTACHMENT_SIZE);
    setAttachmentError(oversized.length ? `${oversized.length === 1 ? "O arquivo selecionado" : "Os arquivos selecionados"} deve${oversized.length === 1 ? "" : "m"} ter no máximo 5 MB.` : "");
    if (!validFiles.length) return;
    if (!isNew) {
      onAttachment?.(id, validFiles);
      return;
    }
    setDraftAttachments((current: any) => [...current, ...validFiles.map(createContactDraftAttachment)]);
  };
  const handleDraftAttachmentDelete = (id: any, attachment: any) => {
    if (!isNew) {
      onDeleteAttachment?.(id, attachment);
      return;
    }
    releaseContactDraftAttachment(attachment);
    setDraftAttachments((current: any) => current.filter((item: any) => item.id !== attachment.id));
  };
  const handlePaste = (event: any) => {
    const files = contactFilesFromClipboard(event);
    if (!files.length) return;
    event.preventDefault();
    handleDraftAttachment("paste", files);
  };
  const visibleAttachments = isNew ? draftAttachments : contact.attachments || [];
  const addNote = async () => {
    if (!note.trim() || !contact?.id) return;
    setSaving(true);
    try {
      const success = await onAddNote(contact.id, note);
      if (success) setNote("");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="drawer-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="task-drawer contact-drawer" aria-label={isNew ? "Novo caso de atendimento" : `Caso ${contact.subject}`}>
        <header className="drawer-header">
          <div className="drawer-header-main">
            <span className="eyebrow">{isNew ? "Entrada manual" : "Caso de atendimento"}</span>
            <div className="drawer-header-title-row"><strong className="drawer-code">{isNew ? "NOVO CASO" : contact.id}</strong></div>
            {!isNew && <div className="drawer-header-context"><span className="drawer-context-item drawer-context-neutral">{contactChannelLabel(draft.channel)} · {draft.senderName}</span><span className="drawer-context-item drawer-context-date">Recebido {formatContactDate(draft.receivedAt, true)}</span></div>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar caso"><X size={18} /></button>
        </header>
        <form id="contact-form" className="drawer-body contact-drawer-body" onSubmit={submit} onPaste={handlePaste}>
          <div className="drawer-title">
            <span className="contact-title-icon"><ChannelIcon size={18} aria-hidden="true" /></span>
            <label className="drawer-title-field" htmlFor="contact-subject">
              <span className="drawer-title-label">Assunto do caso</span>
              <input id="contact-subject" autoFocus={isNew} value={draft.subject} onChange={(event) => update("subject", event.target.value)} placeholder="Ex.: Solicitação de traslado" aria-label="Assunto do caso" disabled={!canEdit || saving} required />
            </label>
          </div>
          {!canEdit && <div className="contact-readonly-note"><UserRound size={16} /> Este caso está sob responsabilidade de outra pessoa.</div>}
          {!isNew && canEdit && <div className="contact-drawer-actions"><button className="button button-secondary" type="button" onClick={() => onCreateTask(contact)} disabled={saving}><Plus size={14} /> Criar task</button><span>O status do caso não muda.</span></div>}
          <div className="drawer-field-grid contact-core-grid">
            <label>Remetente<input value={draft.senderName} onChange={(event) => update("senderName", event.target.value)} disabled={!canEdit || saving} required /></label>
            <label>Telefone (opcional)<input type="tel" value={draft.senderPhone || ""} onChange={(event) => update("senderPhone", event.target.value)} disabled={!canEdit || saving} placeholder="(00) 00000-0000" aria-label="Telefone do remetente" /></label>
            <label>E-mail (opcional)<input type="email" value={draft.senderEmail || ""} onChange={(event) => update("senderEmail", event.target.value)} disabled={!canEdit || saving} placeholder="nome@empresa.com" aria-label="E-mail do remetente" /></label>
          </div>
          <p className="contact-contact-hint">Informe pelo menos um contato: telefone ou e-mail.</p>
          <div className="drawer-field-grid contact-quick-fields">
            <div className="drawer-status-priority-grid">
              <div className="status-field"><span className="status-field-label">Status</span><ContactStatusPicker value={draft.status} options={availableStatuses} onChange={(value: any) => update("status", value)} disabled={!canEdit || saving} /></div>
              <div className="priority-field"><span className="priority-field-label">Prioridade</span><ContactPriorityPicker value={draft.priority} onChange={(value: any) => update("priority", value)} disabled={!canEdit || saving} /></div>
            </div>
            <div className="drawer-assignment-deadline-grid contact-assignment-grid">
              <AssignmentFields form={draft} setForm={setAssignmentForm} employees={employees} teams={teams} />
              <label className="deadline-field">Prazo<DateInput type="date" value={draft.dueDate || ""} onChange={(event: any) => update("dueDate", event.target.value)} disabled={!canEdit || saving} /></label>
            </div>
          </div>
          {draft.status === "done" && <label className="drawer-description contact-resolution-field">Resultado da conclusão (opcional)<textarea value={draft.resolutionOutcome || ""} onChange={(event) => update("resolutionOutcome", event.target.value)} disabled={!canEdit || saving} placeholder="Ex.: retorno confirmado com o cliente" rows={2} /></label>}
          {assignmentChanged && <label className="drawer-description contact-transfer-field">Motivo da transferência (opcional)<input value={draft.transferReason || ""} onChange={(event) => update("transferReason", event.target.value)} disabled={!canEdit || saving} placeholder="Ex.: cobertura da operação" /></label>}
          <section className="drawer-section contact-context-section">
            <div className="drawer-section-heading"><h3>Mensagem recebida</h3><span className="contact-context-date">{formatContactDate(draft.lastMessageAt, true)}</span></div>
            <textarea className="contact-message-editor" value={draft.lastMessage || draft.message || ""} onChange={(event) => setDraft((current: any) => ({ ...current, message: event.target.value, lastMessage: event.target.value }))} disabled={!canEdit || saving} rows={3} placeholder="Registre a mensagem ou o pedido recebido..." aria-label="Mensagem recebida" />
            {draft.status === "waiting" && <label className="drawer-description contact-waiting-note">Observação de Aguardando<input value={draft.waitingNote || ""} onChange={(event) => update("waitingNote", event.target.value)} disabled={!canEdit || saving} placeholder="Esperando resposta" /></label>}
            <details className="contact-inline-details">
              <summary><span>Adicionar resumo interno</span><ChevronDown size={15} aria-hidden="true" /></summary>
              <label className="drawer-description">Resumo<textarea value={draft.summary || ""} onChange={(event) => update("summary", event.target.value)} disabled={!canEdit || saving} rows={2} placeholder="Uma linha para orientar a tratativa" /></label>
            </details>
          </section>
          {AttachmentSectionComponent && <><AttachmentSectionComponent taskId={isNew ? "new-contact" : contact.id} attachments={visibleAttachments} loadAttachmentContent={loadAttachmentContent} onAttachment={handleDraftAttachment} onDeleteAttachment={handleDraftAttachmentDelete} itemLabel="ao caso" helperText={isNew ? "Os arquivos só serão enviados quando você clicar em Criar caso." : "Arquivos usados na tratativa deste caso."} />{attachmentError && <div className="drawer-error" role="alert">{attachmentError}</div>}</>}
          {!isNew && (
            <details className="contact-drawer-details">
              <summary><span>Notas internas</span><span className="contact-detail-summary-meta">{contact.notes?.length || 0}<ChevronDown size={15} aria-hidden="true" /></span></summary>
              <div className="contact-details-content">{(contact.notes || contact.internalNotes || []).map((item: any) => <div className="contact-note-row" key={item.id}><strong>{item.author || "Você"}</strong><p>{item.text}</p><small>{formatContactDate(item.createdAt, true)}</small></div>)}<div className="comment-compose"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Registrar uma nota interna" disabled={!canEdit || saving} rows={2} /><button className="button button-secondary" type="button" onClick={addNote} disabled={!note.trim() || saving}><Plus size={14} /> Adicionar nota</button></div></div>
            </details>
          )}
          {!isNew && (
            <details className="contact-drawer-details" open={relatedTasks.length > 0}>
              <summary><span>Tasks vinculadas</span><span className="contact-detail-summary-meta">{relatedTasks.length}<ChevronDown size={15} aria-hidden="true" /></span></summary>
              <div className="contact-details-content">{relatedTasks.length ? relatedTasks.map((task: any) => <div className="contact-related-task" key={task.id}><span>{task.title}</span><small>{task.status === "done" ? "Concluída" : "Em acompanhamento"}</small></div>) : <p className="empty-inline">Nenhuma task vinculada.</p>}{!canEdit && <p className="contact-detail-hint">O responsável pelo caso pode criar uma task vinculada.</p>}<button className="button button-secondary contact-create-task" type="button" onClick={() => onCreateTask(contact)} disabled={!canEdit}><Plus size={14} /> Criar task</button></div>
            </details>
          )}
          {!isNew && <details className="contact-drawer-details"><summary><span>Histórico</span><span className="contact-detail-summary-meta">{contact.history?.length || 0}<ChevronDown size={15} aria-hidden="true" /></span></summary><div className="contact-details-content">{(contact.history || []).slice().reverse().map((item: any) => <div className="history-row" key={item.id}><span className="history-dot" /><div><strong>{item.text}</strong><small>{item.author || "Sistema"} · {formatContactDate(item.createdAt, true)}</small></div></div>)}</div></details>}
          <details className="contact-drawer-details">
            <summary><span>Cliente, cotação e origem</span><span className="contact-detail-summary-meta">{draft.clientId || draft.quoteId || draft.sourceUrl ? "Configurado" : "Opcional"}<ChevronDown size={15} aria-hidden="true" /></span></summary>
            <div className="contact-details-content">
              <div className="drawer-field-grid contact-links-grid">
                <label>Cliente<input value={draft.clientId || ""} onChange={(event) => update("clientId", event.target.value)} disabled={!canEdit || saving} placeholder="ID do cliente" /></label>
                <label>Cotação<SearchableSelect value={draft.quoteId || ""} onChange={(value: any) => update("quoteId", value)} options={quoteOptions} placeholder="Sem vínculo" disabled={!canEdit || saving} aria-label="Cotação vinculada" /></label>
              </div>
              {draft.sourceUrl && <a className="contact-source-link" href={draft.sourceUrl} target="_blank" rel="noreferrer">Abrir origem recebida</a>}
            </div>
          </details>
          {saveError && <div className="drawer-error" role="alert">{saveError}</div>}
        </form>
        <footer className="drawer-footer">
          <button className="button button-quiet" type="button" onClick={onClose}>Cancelar</button>
          {!isNew && !isArchived && permissions.canArchive && <button className="button button-danger contact-archive-button" type="button" onClick={() => onArchive?.(contact)} disabled={saving}><Archive size={15} /> Arquivar</button>}
          {isArchived && <span className="contact-archived-label">Arquivado {formatContactDate(contact.archivedAt, true)}</span>}
          {canEdit && <button className="button button-primary" type="submit" form="contact-form" disabled={saving}>{saving ? "Salvando…" : <><Check size={15} /> {isNew ? "Criar caso" : "Salvar alterações"}</>}</button>}
        </footer>
      </aside>
    </div>
  );
}

function ContactViewSelector({ view, onChange }: any) {
  return (
    <div className="task-view-selector contact-view-selector" aria-label="Visualização dos contatos">
      <button className={`task-view-button ${view === "inbox" ? "active" : ""}`} type="button" onClick={() => onChange("inbox")} aria-label="Visualização Inbox" aria-pressed={view === "inbox"} title="Inbox"><Inbox size={16} aria-hidden="true" /></button>
      <button className={`task-view-button ${view === "kanban" ? "active" : ""}`} type="button" onClick={() => onChange("kanban")} aria-label="Visualização Kanban" aria-pressed={view === "kanban"} title="Kanban"><Columns3 size={16} aria-hidden="true" /></button>
    </div>
  );
}

function ContactCard({ contact, onSelect, onComplete, draggable = false, variant = "", dragged = false, onDragStart, onDragEnd }: any) {
  const [confirming, setConfirming] = useState<any>(false);
  const [busy, setBusy] = useState<any>(false);
  const timerRef = useRef<any>(null);
  const ChannelIcon = (CHANNEL_ICON as any)[contact.channel] || MessageCircle;
  const isArchived = Boolean(contact.archivedAt);
  const isDone = contact.status === "done";
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  const complete = async (event: any) => {
    event.stopPropagation();
    if (busy || isDone || isArchived) return;
    if (!confirming) {
      setConfirming(true);
      timerRef.current = window.setTimeout(() => { timerRef.current = null; setConfirming(false); }, 2600);
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setConfirming(false);
    setBusy(true);
    try { await onComplete(contact); } finally { setBusy(false); }
  };
  return (
    <article className={`contact-row priority-${contact.priority} ${isArchived ? "is-archived" : ""} ${dragged ? "is-dragging" : ""}`} draggable={draggable && !isArchived} onDragStart={(event) => onDragStart?.(event, contact)} onDragEnd={onDragEnd}>
      {variant === "kanban" ? <button className="contact-row-main contact-row-main-kanban" type="button" onClick={() => onSelect(contact.id)} aria-label={`Abrir caso ${contact.subject || "sem assunto"}`}>
        <span className="contact-row-kanban-top"><span className={`contact-priority-label priority-${contact.priority}`}>{contactPriorityLabel(contact.priority)}</span><span className="contact-row-kanban-date" aria-label={contact.dueDate ? `Prazo ${formatContactDate(contact.dueDate)}${contactIsOverdue(contact) ? ", atrasado" : ""}` : "Sem prazo definido"}><time>{contact.dueDate ? `Prazo ${formatContactDate(contact.dueDate)}` : "Sem prazo"}</time>{contact.dueDate && contactIsOverdue(contact) && <small className="is-overdue">Atrasado</small>}</span></span>
        <strong className="contact-row-kanban-title">{contact.subject || "Sem assunto"}</strong>
        <span className="contact-row-kanban-meta"><span className="contact-row-person"><UserRound size={13} aria-hidden="true" /> {contact.senderName || "Pessoa não informada"}</span><span className="contact-row-kanban-channel"><ChannelIcon size={13} aria-hidden="true" /> {contactChannelLabel(contact.channel)}</span></span>
      </button> : <>
        <span className="contact-row-priority" aria-hidden="true" />
        <button className="contact-row-main" type="button" onClick={() => onSelect(contact.id)} aria-label={`Abrir caso ${contact.subject || "sem assunto"}`}>
          <span className="contact-row-top"><span className={`contact-priority-label priority-${contact.priority}`}>{contactPriorityLabel(contact.priority)}</span><strong>{contact.subject || "Sem assunto"}</strong></span>
          <span className="contact-row-person"><UserRound size={13} aria-hidden="true" /> {contact.senderName || "Pessoa não informada"}</span>
          <span className="contact-row-message">{contact.lastMessage || contact.message || contact.summary || "Sem mensagem registrada"}</span>
          <span className="contact-row-meta"><span><ChannelIcon size={13} aria-hidden="true" /> {contactChannelLabel(contact.channel)}</span><span className={`badge contact-status-badge status-${contact.status}`}>{isArchived ? "Arquivado" : contactStatusLabel(contact.status)}</span></span>
        </button>
        <span className="contact-row-date" aria-label={contact.dueDate ? `Prazo ${formatContactDate(contact.dueDate)}${contactIsOverdue(contact) ? ", atrasado" : ""}` : "Sem prazo definido"}><time>{contact.dueDate ? `Prazo ${formatContactDate(contact.dueDate)}` : "Sem prazo"}</time>{contact.dueDate && contactIsOverdue(contact) && <small className="is-overdue">Atrasado</small>}</span>
        {onComplete && !isDone && !isArchived && <button className={`contact-complete-action ${confirming ? "is-confirming" : ""}`} type="button" onClick={complete} disabled={busy} aria-label={confirming ? `Confirmar conclusão de ${contact.subject}` : `Concluir ${contact.subject}`} title={confirming ? "Confirmar conclusão" : "Concluir caso"}>{confirming ? <><Check size={14} aria-hidden="true" /> Confirmar</> : <CheckCircle2 size={16} aria-hidden="true" />}</button>}
      </>}
    </article>
  );
}

export default function ContactsView({
  contacts = [],
  employees = [],
  teams = [],
  quotes = [],
  tasks = [],
  currentEmployee,
  selectedContactId = "",
  contactLoading = false,
  contactLoadError = "",
  onSelect,
  onSave,
  onArchive,
  onAddNote,
  onAttachment,
  onDeleteAttachment,
  loadAttachmentContent,
  onCreateTask,
  AttachmentSectionComponent,
}: any) {
  const [filters, setFilters] = useState<any>(EMPTY_FILTERS);
  const [creating, setCreating] = useState<any>(false);
  const [filterOpen, setFilterOpen] = useState<any>(false);
  const [view, setView] = useState<any>("kanban");
  const [waitingOpen, setWaitingOpen] = useState<any>(true);
  const [draggedContactId, setDraggedContactId] = useState<any>("");
  const [dropStatus, setDropStatus] = useState<any>("");
  const selected = contacts.find((item: any) => item.id === selectedContactId);
  const visibleContacts = useMemo(() => sortContacts(filterContacts(contacts, {
    query: filters.query,
    channel: filters.channel ? [filters.channel] : [],
    status: filters.status ? [filters.status] : [],
    priority: filters.priority ? [filters.priority] : [],
    owner: filters.owner ? [filters.owner] : [],
    team: filters.team ? [filters.team] : [],
    overdue: filters.overdue,
    includeCompleted: filters.includeCompleted || view === "kanban",
    includeArchived: filters.includeArchived,
    mine: filters.mine ? currentEmployee?.id : "",
    today: new Date(),
  })), [contacts, currentEmployee?.id, filters, view]);
  const pendingContacts = visibleContacts.filter((contact) => !contact.archivedAt && ["new", "in_progress"].includes((contact.status as any)));
  const waitingContacts = visibleContacts.filter((contact) => !contact.archivedAt && contact.status === "waiting");
  const doneContacts = visibleContacts.filter((contact) => !contact.archivedAt && contact.status === "done");
  const archivedContacts = visibleContacts.filter((contact) => contact.archivedAt);
  const overdueCount = contacts.filter((contact: any) => contactIsOverdue(contact)).length;
  const activeFilterCount = [filters.channel, filters.status, filters.priority, filters.owner, filters.team].filter(Boolean).length
    + Number(Boolean(filters.query.trim()))
    + Number(filters.mine)
    + Number(filters.overdue)
    + Number(filters.includeCompleted)
    + Number(filters.includeArchived);
  const updateFilter = (key: any, value: any) => setFilters((current: any) => ({ ...current, [key]: value }));
  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const handleComplete = (contact: any) => onSave({ ...contact, status: "done", waitingNote: "" });
  const clearDrag = () => {
    setDraggedContactId("");
    setDropStatus("");
  };
  const handleDragStart = (event: any, contact: any) => {
    // ClientGlobalContext cancela dragstart no document; mantenha o evento no Planner.
    event.stopPropagation();
    event.dataTransfer?.setData("text/contact-id", contact.id);
    event.dataTransfer?.setData("text/plain", contact.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
    setDraggedContactId(contact.id);
  };
  const handleDragOver = (event: any, status: any) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropStatus(status);
  };
  const handleMove = (contact: any, status: any) => {
    if (!contact || contact.archivedAt || contact.status === status) return;
    onSave({ ...contact, status });
  };
  const handleDrop = (event: any, status: any) => {
    event.preventDefault();
    const id = event.dataTransfer?.getData("text/contact-id") || event.dataTransfer?.getData("text/plain");
    const contact = contacts.find((item: any) => item.id === id);
    clearDrag();
    handleMove(contact, status);
  };
  const renderCards = (items: any, variant = "") => (
    <div className={`contacts-list ${variant ? `contacts-list-${variant}` : ""}`}>
      {items.map((contact: any) => <ContactCard key={contact.id} contact={contact} onSelect={onSelect} onComplete={handleComplete} variant={variant} dragged={draggedContactId === contact.id} draggable={variant === "kanban"} onDragStart={handleDragStart} onDragEnd={clearDrag} />)}
    </div>
  );
  useEffect(() => { if (selectedContactId && !selected) onSelect(""); }, [selectedContactId, selected, onSelect]);
  return (
    <div className="page-content contacts-page">
      <PageHeader eyebrow="Atendimento" title="Contatos" description="Organize os casos recebidos e mantenha cada retorno no responsável certo." action={<div className="header-actions"><ContactViewSelector view={view} onChange={setView} /><button className="button button-primary" type="button" onClick={() => setCreating(true)}><Plus size={15} /> Novo caso</button></div>} />
      <div className="metric-grid contact-metrics">
        {[{ id: "new", label: "Novos", value: contacts.filter((item: any) => item.status === "new" && !item.archivedAt).length, icon: MessageCircle }, { id: "in_progress", label: "Em atendimento", value: contacts.filter((item: any) => item.status === "in_progress" && !item.archivedAt).length, icon: Send }, { id: "waiting", label: "Aguardando", value: contacts.filter((item: any) => item.status === "waiting" && !item.archivedAt).length, icon: Clock3 }, { id: "overdue", label: "Vencidos", value: overdueCount, icon: FileText }].map((metric) => { const Icon = metric.icon; return <article className="metric-card" key={metric.id}><span className="metric-icon"><Icon size={17} /></span><div><strong>{metric.value}</strong><span>{metric.label}</span></div></article>; })}
      </div>
      <div className={`filter-bar contacts-filter-bar ${filterOpen ? "is-expanded" : ""}`}>
        <button className="filter-toggle button button-quiet" type="button" onClick={() => setFilterOpen((value: any) => !value)} aria-expanded={filterOpen} aria-controls="contacts-filter-options"><SlidersHorizontal size={15} aria-hidden="true" /><span>Filtros</span>{activeFilterCount > 0 && <b aria-label={`${activeFilterCount} filtros ativos`}>{activeFilterCount}</b>}<span className="filter-toggle-symbol" aria-hidden="true">{filterOpen ? "−" : "+"}</span></button>
        <div className="search-field filter-search"><Search size={16} aria-hidden="true" /><input value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="Buscar assunto, pessoa, telefone ou e-mail" aria-label="Buscar contatos" /></div>
        <div className="filter-bar-content" id="contacts-filter-options">
          <SearchableSelect value={filters.channel} onChange={(value: any) => updateFilter("channel", value)} options={CONTACT_CHANNELS.map((item) => ({ value: item.id, label: item.label }))} placeholder="Todos os canais" aria-label="Filtrar por canal" />
          <SearchableSelect value={filters.status} onChange={(value: any) => updateFilter("status", value)} options={CONTACT_STATUSES.map((item) => ({ value: item.id, label: item.label }))} placeholder="Pendentes e aguardando" aria-label="Filtrar por status" />
          <SearchableSelect value={filters.priority} onChange={(value: any) => updateFilter("priority", value)} options={CONTACT_PRIORITIES.map((item) => ({ value: item.id, label: item.label }))} placeholder="Todas as prioridades" aria-label="Filtrar por prioridade" />
          <SearchableSelect value={filters.owner} onChange={(value: any) => updateFilter("owner", value)} options={employees.map((item: any) => ({ value: item.id, label: item.name }))} placeholder="Todos os responsáveis" aria-label="Filtrar por responsável" />
          <SearchableSelect value={filters.team} onChange={(value: any) => updateFilter("team", value)} options={teams.map((item: any) => ({ value: item.id, label: item.name }))} placeholder="Todas as equipes" aria-label="Filtrar por equipe" />
          <button className={`contact-filter-chip ${filters.mine ? "is-active" : ""}`} type="button" onClick={() => updateFilter("mine", !filters.mine)} disabled={!currentEmployee?.id}>Minhas pendências</button>
          <button className={`contact-filter-chip ${filters.overdue ? "is-active" : ""}`} type="button" onClick={() => updateFilter("overdue", !filters.overdue)}>Vencidos</button>
          <button className={`contact-filter-chip ${filters.includeCompleted ? "is-active" : ""}`} type="button" onClick={() => updateFilter("includeCompleted", !filters.includeCompleted)}>Concluídos</button>
          <button className={`contact-filter-chip ${filters.includeArchived ? "is-active" : ""}`} type="button" onClick={() => updateFilter("includeArchived", !filters.includeArchived)}>Arquivados</button>
          <button className="button button-quiet" type="button" onClick={clearFilters} disabled={!activeFilterCount}>Limpar filtros</button>
        </div>
      </div>
      {view === "inbox" ? (
        <section className="panel contacts-panel">
          <div className="panel-heading"><div><span className="eyebrow">Inbox operacional</span><h2>Pendentes</h2></div><span className="panel-count">{pendingContacts.length + waitingContacts.length}</span></div>
          {contactLoadError && <div className="contact-load-error" role="alert">{contactLoadError}</div>}
          {contactLoading ? <div className="contact-empty"><Clock3 size={25} aria-hidden="true" /><strong>Carregando contatos…</strong></div> : <>
            {pendingContacts.length ? renderCards(pendingContacts) : <div className="contact-section-empty">Nenhum pedido novo ou em atendimento.</div>}
            <details className="contact-waiting-section" open={waitingOpen} onToggle={(event) => setWaitingOpen(event.currentTarget.open)}>
              <summary><span><Clock3 size={15} aria-hidden="true" /> Aguardando</span><span className="contact-section-count">{waitingContacts.length}<ChevronDown size={15} aria-hidden="true" /></span></summary>
              {waitingContacts.length ? renderCards(waitingContacts) : <div className="contact-section-empty">Nenhum caso aguardando retorno.</div>}
            </details>
            {doneContacts.length > 0 && <section className="contact-secondary-section"><div className="contact-secondary-heading"><span><CheckCircle2 size={15} aria-hidden="true" /> Concluídos</span><span>{doneContacts.length}</span></div>{renderCards(doneContacts)}</section>}
            {archivedContacts.length > 0 && <section className="contact-secondary-section"><div className="contact-secondary-heading"><span><Archive size={15} aria-hidden="true" /> Arquivados</span><span>{archivedContacts.length}</span></div>{renderCards(archivedContacts)}</section>}
            {!pendingContacts.length && !waitingContacts.length && !doneContacts.length && !archivedContacts.length && <div className="contact-empty"><MessageCircle size={28} aria-hidden="true" /><strong>Nenhum caso encontrado</strong><span>Ajuste os filtros ou registre um novo pedido.</span></div>}
          </>}
        </section>
      ) : (
        <section className="contact-kanban" aria-label="Kanban de contatos">
          {!visibleContacts.length ? <div className="contact-kanban-no-results" role="status"><Search size={20} aria-hidden="true" /><strong>{activeFilterCount ? "Nenhum caso encontrado" : "Nenhum caso cadastrado"}</strong><span>{activeFilterCount ? "Ajuste ou limpe os filtros para ampliar a busca." : "Registre um novo caso para começar a triagem."}</span>{activeFilterCount > 0 && <button className="button button-quiet" type="button" onClick={clearFilters}>Limpar filtros</button>}</div> : CONTACT_STATUSES.map((column) => {
            const items = visibleContacts.filter((contact) => !contact.archivedAt && contact.status === column.id);
            const StatusIcon = (STATUS_ICON as any)[column.id] || CheckCircle2;
            const isDropTarget = Boolean(draggedContactId && dropStatus === column.id);
            const itemCountLabel = `${items.length} ${items.length === 1 ? "caso" : "casos"}`;
            return <section className={`contact-kanban-column status-column-${column.id}${isDropTarget ? " is-drop-target" : ""}`} data-status-id={column.id} key={column.id} aria-label={`Coluna ${column.label}, ${itemCountLabel}`} onDragOver={(event) => handleDragOver(event, column.id)} onDrop={(event) => handleDrop(event, column.id)} onDragEnd={clearDrag}>
              <div className="contact-kanban-heading"><div className="contact-kanban-heading-title"><StatusIcon size={15} aria-hidden="true" /><div><span className="eyebrow">Status</span><h2>{column.label}</h2></div></div><span className="panel-count">{items.length}</span></div>
              <div className="contact-kanban-body">
                {isDropTarget && <div className="contact-kanban-drop-placeholder" role="status">Solte aqui para mover</div>}
                {items.length ? renderCards(items, "kanban") : <div className="contact-kanban-empty"><Plus size={18} aria-hidden="true" /><strong>Sem casos nesta coluna</strong><span>Arraste um caso para cá.</span></div>}
              </div>
            </section>;
          })}
        </section>
      )}
      {!creating && !selected && <button className="mobile-fab contacts-mobile-fab" type="button" onClick={() => setCreating(true)} aria-label="Criar novo caso" title="Novo caso"><Plus size={22} strokeWidth={2.5} aria-hidden="true" /></button>}
      {selected && <ContactDrawer contact={selected} currentEmployee={currentEmployee} employees={employees} teams={teams} quotes={quotes} tasks={tasks} AttachmentSectionComponent={AttachmentSectionComponent} loadAttachmentContent={loadAttachmentContent} onClose={() => onSelect("")} onSave={onSave} onArchive={onArchive} onAddNote={onAddNote} onAttachment={onAttachment} onDeleteAttachment={onDeleteAttachment} onCreateTask={onCreateTask} />}
      {creating && <ContactDrawer isNew currentEmployee={currentEmployee} employees={employees} teams={teams} quotes={quotes} tasks={tasks} AttachmentSectionComponent={AttachmentSectionComponent} loadAttachmentContent={loadAttachmentContent} onAttachment={onAttachment} onDeleteAttachment={onDeleteAttachment} onClose={() => setCreating(false)} onSave={async (draft: any) => { const success = await onSave(draft); if (success) setCreating(false); return success; }} />}
    </div>
  );
}
