import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, FileText, Paperclip, Plus, Save, X } from "lucide-react";
import { OPTIONS, choiceEntries, formatDate, validateAction, validateError } from "./domain";
import { StatusBadge } from "./views";
import SearchableSelect from "./SearchableSelect";
import { dataverse, TABLES } from "./dataverse";

const DRAWER_DRAFT_PREFIX = "modulo-qualidade-drawer-draft-v1";

function readDrawerDraft(kind, initial) {
  const id = initial?.cr40f_errooperacionalid || initial?.cr40f_acaooperacionalid || "novo";
  try {
    const saved = JSON.parse(localStorage.getItem(`${DRAWER_DRAFT_PREFIX}:${kind}:${id}`) || "null");
    return saved && typeof saved === "object" ? { ...initial, ...saved } : initial;
  } catch { return initial; }
}

function useDrawerDraft(kind, initial) {
  const draftId = initial?.cr40f_errooperacionalid || initial?.cr40f_acaooperacionalid || "novo";
  const draftKey = `${DRAWER_DRAFT_PREFIX}:${kind}:${draftId}`;
  const [form, setForm] = useState(() => readDrawerDraft(kind, initial));
  const latestForm = useRef(form);
  const cleared = useRef(false);
  const persist = (value) => { if (cleared.current) return; try { localStorage.setItem(draftKey, JSON.stringify(value)); } catch { /* Rascunho local não pode quebrar o formulário. */ } };
  useEffect(() => setForm(readDrawerDraft(kind, initial)), [kind, draftId]);
  useEffect(() => { latestForm.current = form; }, [form]);
  useEffect(() => {
    const timer = window.setTimeout(() => persist(form), 300);
    return () => window.clearTimeout(timer);
  }, [draftKey, form]);
  useEffect(() => () => persist(latestForm.current), [draftKey]);
  const clear = () => { cleared.current = true; try { localStorage.removeItem(draftKey); } catch { /* best effort */ } };
  return [form, setForm, clear];
}

export function Drawer({ open, onClose, title, subtitle, children, wide = false }) {
  if (!open) return null;
  return <div className="drawer-layer" role="presentation"><button className="drawer-backdrop" aria-label="Fechar" onClick={onClose} /><section className={`drawer ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><div><span>{subtitle}</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header><div className="drawer-body">{children}</div></section></div>;
}

const ChoiceSelect = ({ source, value, onChange }) => <SearchableSelect value={value} onChange={onChange} options={choiceEntries(source)} />;

const MAX_NOTE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_EVIDENCE_FILES = 10;

function renderNoteText(value) {
  return String(value || "").split(/(https?:\/\/[^\s]+)/gi).map((part, index) => /^https?:\/\//i.test(part)
    ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}</a>
    : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>);
}

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified || 0}`;
}

function displayEvidenceLabel(value) {
  const labels = {
    REGISTRO: "Registro",
    SOLUCAO: "Solução",
    ACAO: "Ação",
    ACOES: "Ações",
    HISTORICO: "Histórico",
    Solucao: "Solução",
    Acoes: "Ações",
    Historico: "Histórico",
  };
  return labels[String(value || "").trim()] || value;
}

export function EvidencePicker({ files = [], onChange, label, folder, className = "", children, footer }) {
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState("");
  const addFiles = (incoming) => {
    const next = [...files];
    const existing = new Set(next.map(fileKey));
    let rejected = 0;
    for (const file of Array.from(incoming || [])) {
      if (!file || file.size > MAX_NOTE_FILE_SIZE || existing.has(fileKey(file)) || next.length >= MAX_EVIDENCE_FILES) {
        rejected += 1;
        continue;
      }
      next.push(file);
      existing.add(fileKey(file));
    }
    if (next.length !== files.length) onChange(next);
    setFileError(rejected ? `Até ${MAX_EVIDENCE_FILES} arquivos de 5 MB por contexto. Duplicados foram ignorados.` : "");
  };
  const handlePaste = (event) => {
    const incoming = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile?.())
      .filter(Boolean);
    if (!incoming.length) return;
    event.preventDefault(); event.stopPropagation(); addFiles(incoming);
  };
  const handleDrop = (event) => { event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files); };
  const removeFile = (fileToRemove) => { onChange(files.filter((file) => fileKey(file) !== fileKey(fileToRemove))); setFileError(""); };
  return <div className={`evidence-picker ${className}`.trim()} tabIndex={0} onPaste={handlePaste}>
    {children}
    <div className={`evidence-dropzone ${dragActive ? "is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false); }} onDrop={handleDrop}>
      <div className="evidence-dropzone-copy"><Paperclip size={16} /><div><strong>{label}</strong><span>{dragActive ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para selecionar"}</span></div></div>
      <label className="file-button">Selecionar arquivos<input type="file" multiple onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} /></label>
    </div>
    <div className="evidence-picker-meta"><span>{files.length}/{MAX_EVIDENCE_FILES}</span><small>Pasta: {folder} · Ctrl+V nesta área</small></div>
    {fileError && <small className="note-file-error">{fileError}</small>}
    {files.length > 0 && <div className="evidence-list">{files.map((file) => <div className="evidence-item" key={fileKey(file)}><span title={file.name}>{file.name}</span><button type="button" className="evidence-remove" onClick={() => removeFile(file)} aria-label={`Remover ${file.name}`}><X size={13} /></button></div>)}</div>}
    {footer}
  </div>;
}

export function ErrorForm({ initial, lookups, onSubmit, saving }) {
  const [form, setForm, clearDraft] = useDrawerDraft("erro", initial);
  const [error, setError] = useState("");
  const [registrationFiles, setRegistrationFiles] = useState([]);
  const [solutionFiles, setSolutionFiles] = useState([]);
  useEffect(() => { setRegistrationFiles([]); setSolutionFiles([]); }, [initial]);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event) => { event.preventDefault(); const message = validateError(form); if (message) return setError(message); setError(""); if ((await onSubmit({ ...form, registrationFiles, solutionFiles })) !== false) clearDraft(); };
  return <form className="form-stack" onSubmit={submit}>
    {error && <div className="inline-alert"><AlertCircle size={17} />{error}</div>}
    <label><span>Título do erro *</span><input value={form.cr40f_titulo} onChange={(event) => set("cr40f_titulo", event.target.value)} placeholder="Ex.: Motorista chegou após o horário" /></label>
    <div className="form-grid"><label><span>Data e hora *</span><input type="datetime-local" value={form.cr40f_dataocorrencia} onChange={(event) => set("cr40f_dataocorrencia", event.target.value)} /></label><label><span>Prazo de resolução</span><input type="datetime-local" value={form.cr40f_prazoresolucao} onChange={(event) => set("cr40f_prazoresolucao", event.target.value)} /></label></div>
    <div className="form-grid"><label><span>Categoria *</span><ChoiceSelect source={OPTIONS.category} value={form.cr40f_categoria} onChange={(value) => set("cr40f_categoria", Number(value))} /></label><label><span>Gravidade</span><ChoiceSelect source={OPTIONS.severity} value={form.cr40f_gravidade} onChange={(value) => set("cr40f_gravidade", Number(value))} /></label></div>
    <div className="form-grid"><label><span>Origem</span><ChoiceSelect source={OPTIONS.origin} value={form.cr40f_origem} onChange={(value) => set("cr40f_origem", Number(value))} /></label><label><span>Status</span><ChoiceSelect source={OPTIONS.errorStatus} value={form.cr40f_status} onChange={(value) => set("cr40f_status", Number(value))} /></label></div>
    <label><span>O que aconteceu? *</span><textarea rows="4" value={form.cr40f_descricao} onChange={(event) => set("cr40f_descricao", event.target.value)} placeholder="Descreva fatos, horários e pessoas envolvidas." /></label>
    <EvidencePicker files={registrationFiles} onChange={setRegistrationFiles} label="Evidências do registro" folder="Registro" />
    <label><span>Impacto</span><textarea rows="3" value={form.cr40f_impacto} onChange={(event) => set("cr40f_impacto", event.target.value)} placeholder="Impacto no passageiro, cliente ou operação." /></label>
    <div className="form-divider"><span>Vínculos operacionais</span></div>
    <div className="form-grid"><RemoteLookup label="Reserva" value={form.reservaId} onChange={(value) => set("reservaId", value)} onOptionChange={(option) => set("reservaNome", option?.name || "")} /><Lookup label="Motorista" value={form.motoristaId} options={lookups.employees} onChange={(value) => set("motoristaId", value)} /></div>
    <div className="form-grid"><Lookup label="Veículo" value={form.veiculoId} options={lookups.vehicles} onChange={(value) => set("veiculoId", value)} /><Lookup label="Responsável" value={form.responsavelId} options={lookups.employees} onChange={(value) => set("responsavelId", value)} /></div>
    <label><span>Impacto financeiro (R$)</span><input type="number" min="0" step="0.01" value={form.cr40f_impactofinanceiro} onChange={(event) => set("cr40f_impactofinanceiro", event.target.value)} /></label>
    <div className="form-divider"><span>Análise e encerramento</span></div>
    <label><span>Causa identificada</span><textarea rows="3" value={form.cr40f_causa} onChange={(event) => set("cr40f_causa", event.target.value)} /></label>
    <label><span>Solução aplicada</span><textarea rows="3" value={form.cr40f_solucao} onChange={(event) => set("cr40f_solucao", event.target.value)} /></label>
    <EvidencePicker files={solutionFiles} onChange={setSolutionFiles} label="Comprovação da solução" folder="Solução" />
    <button className="primary-button" type="submit" disabled={saving}><Save size={18} />{saving ? "Salvando..." : initial.cr40f_errooperacionalid ? "Salvar alterações" : "Registrar erro"}</button>
  </form>;
}

function Lookup({ label, value, options, onChange }) {
  const selectOptions = useMemo(
    () => [{ value: "", label: "Não vinculado" }, ...options.map((item) => ({ value: item.id, label: item.name }))],
    [options],
  );
  return <label><span>{label}</span><SearchableSelect value={value || ""} onChange={onChange} options={selectOptions} /> </label>;
}

function RemoteLookup({ label, value, onChange, onOptionChange }) {
  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) { setOptions([]); return; }
      setLoading(true);
      try { const result = await dataverse.searchLookupOptions(TABLES.reservation, query, 25); if (active) setOptions(result); } catch (_) { if (active) setOptions([]); }
      finally { if (active) setLoading(false); }
    }, 280);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  useEffect(() => {
    let active = true;
    if (!value) return undefined;
    dataverse.getLookupOption(TABLES.reservation, value).then((option) => { if (active && option) { setOptions((current) => current.some((item) => item.id === option.id) ? current : [option, ...current]); onOptionChange(option); } }).catch(() => {});
    return () => { active = false; };
  }, [value]);
  const selectOptions = useMemo(
    () => [{ value: "", label: "Não vinculado" }, ...options.map((item) => ({ value: item.id, label: item.name }))],
    [options],
  );
  return <label><span>{label}</span><SearchableSelect value={value || ""} onChange={(next) => { onChange(next); onOptionChange(options.find((item) => item.id === next) || null); }} onQueryChange={setQuery} options={selectOptions} placeholder={loading ? "Pesquisando..." : "Pesquisar reserva"} /></label>;
}

export function ActionForm({ initial, errors, employees, onSubmit, saving }) {
  const [form, setForm, clearDraft] = useDrawerDraft("acao", initial);
  const [error, setError] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const errorOptions = useMemo(
    () => [{ value: "", label: "Selecione" }, ...errors.map((item) => ({ value: item.cr40f_errooperacionalid, label: `${item.cr40f_codigo} · ${item.cr40f_titulo}` }))],
    [errors],
  );
  useEffect(() => { setEvidenceFiles([]); }, [initial]);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event) => { event.preventDefault(); const message = validateAction(form); if (message) return setError(message); setError(""); if ((await onSubmit({ ...form, evidenceFiles })) !== false) clearDraft(); };
  return <form className="form-stack" onSubmit={submit}>
    {error && <div className="inline-alert"><AlertCircle size={17} />{error}</div>}
    <label><span>Erro relacionado *</span><SearchableSelect value={form.erroId || ""} onChange={(value) => set("erroId", value)} disabled={Boolean(initial.erroId)} options={errorOptions} /></label>
    <label><span>Título da ação *</span><input value={form.cr40f_titulo} onChange={(event) => set("cr40f_titulo", event.target.value)} /></label>
    <label><span>Descrição *</span><textarea rows="4" value={form.cr40f_descricao} onChange={(event) => set("cr40f_descricao", event.target.value)} /></label>
    <div className="form-grid"><label><span>Tipo</span><ChoiceSelect source={OPTIONS.actionType} value={form.cr40f_tipoacao} onChange={(value) => set("cr40f_tipoacao", Number(value))} /></label><label><span>Prioridade</span><ChoiceSelect source={OPTIONS.priority} value={form.cr40f_prioridade} onChange={(value) => set("cr40f_prioridade", Number(value))} /></label></div>
    <div className="form-grid"><label><span>Agendada para</span><input type="datetime-local" value={form.cr40f_agendadoem} onChange={(event) => set("cr40f_agendadoem", event.target.value)} /></label><label><span>Prazo *</span><input type="datetime-local" value={form.cr40f_prazo} onChange={(event) => set("cr40f_prazo", event.target.value)} /></label></div>
    <div className="form-grid"><label><span>Status</span><ChoiceSelect source={OPTIONS.actionStatus} value={form.cr40f_status} onChange={(value) => set("cr40f_status", Number(value))} /></label><Lookup label="Responsável *" value={form.responsavelId} options={employees} onChange={(value) => set("responsavelId", value)} /></div>
    {Number(form.cr40f_status) === 100000003 && <label><span>Resultado *</span><textarea rows="4" value={form.cr40f_resultado} onChange={(event) => set("cr40f_resultado", event.target.value)} /></label>}
    <EvidencePicker files={evidenceFiles} onChange={setEvidenceFiles} label="Evidências da ação/conclusão" folder={Number(form.cr40f_status) === 100000003 ? "Solução" : "Ações"} />
    <button className="primary-button" type="submit" disabled={saving}><Save size={18} />{saving ? "Salvando..." : initial.cr40f_acaooperacionalid ? "Salvar ação" : "Criar ação"}</button>
  </form>;
}

export function ErrorDetails({ error, actions, notes, evidences = [], canEdit, canManage, onEdit, onNewAction, onEditAction, onAddNote, saving }) {
  const noteDraftKey = `${DRAWER_DRAFT_PREFIX}:nota:${error?.cr40f_errooperacionalid || "novo"}`;
  const [note, setNote] = useState(() => { try { return localStorage.getItem(noteDraftKey) || ""; } catch { return ""; } });
  const [files, setFiles] = useState([]);
  useEffect(() => {
    const timer = window.setTimeout(() => { try { if (note) localStorage.setItem(noteDraftKey, note); else localStorage.removeItem(noteDraftKey); } catch { /* best effort */ } }, 300);
    return () => window.clearTimeout(timer);
  }, [noteDraftKey, note]);
  if (!error) return null;
  const submitNote = async () => {
    if (!note.trim() && !files.length) return;
    const saved = await onAddNote(note, files);
    if (saved) { setNote(""); setFiles([]); }
  };
  return <div className="detail-stack">
    <section className="detail-hero"><div><span>{error.cr40f_codigo}</span><StatusBadge value={error.cr40f_status} /></div><h3>{error.cr40f_titulo}</h3><p>{error.cr40f_descricao}</p><div className="detail-meta"><span><strong>Categoria</strong>{OPTIONS.category[error.cr40f_categoria]}</span><span><strong>Gravidade</strong>{OPTIONS.severity[error.cr40f_gravidade]}</span><span><strong>Ocorrência</strong>{formatDate(error.cr40f_dataocorrencia, true)}</span><span><strong>Prazo</strong>{formatDate(error.cr40f_prazoresolucao, true)}</span></div>{canEdit && <button className="secondary-button" onClick={onEdit}>Editar ocorrência</button>}</section>
    <section className="detail-card"><h3>Contexto operacional</h3><div className="detail-meta"><span><strong>Reserva</strong>{error.cr40f_reservanome || "Não vinculada"}</span><span><strong>Motorista</strong>{error.cr40f_motoristanome || "Não vinculado"}</span><span><strong>Veículo</strong>{error.cr40f_veiculonome || "Não vinculado"}</span><span><strong>Responsável</strong>{error.cr40f_responsavelnome || "Não atribuído"}</span></div>{error.cr40f_impacto && <div className="text-block"><strong>Impacto</strong><p>{error.cr40f_impacto}</p></div>}{error.cr40f_causa && <div className="text-block"><strong>Causa</strong><p>{error.cr40f_causa}</p></div>}{error.cr40f_solucao && <div className="text-block solution"><strong><CheckCircle2 size={16} />Solução</strong><p>{error.cr40f_solucao}</p></div>}</section>
    <section className="detail-card"><div className="detail-card-head"><div><span>Plano de tratamento</span><h3>Ações</h3></div>{canManage && <button className="small-button" onClick={onNewAction}><Plus size={16} />Nova ação</button>}</div><div className="detail-actions">{actions.map((item) => <button key={item.cr40f_acaooperacionalid} onClick={() => canManage && onEditAction(item)}><span className={`severity-dot severity-${item.cr40f_prioridade}`} /><div><strong>{item.cr40f_titulo}</strong><span><CalendarDays size={14} />{formatDate(item.cr40f_agendadoem || item.cr40f_prazo, true)} · {item.cr40f_responsavelnome}</span></div><StatusBadge type="action" value={item.cr40f_status} /></button>)}{!actions.length && <div className="empty-small">Nenhuma ação criada.</div>}</div></section>
    <section className="detail-card"><div className="detail-card-head"><div><span>Arquivos vinculados</span><h3>Evidências</h3></div><span>{evidences.length}</span></div><div className="evidence-library">{evidences.map((item) => { const isImage = String(item.cr40f_mimetype || "").startsWith("image/"); return <a className="evidence-library-item" key={item.cr40f_errooperacionalarquivoid || item.cr40f_url} href={item.cr40f_url} target="_blank" rel="noreferrer">{isImage ? <img src={item.cr40f_url} alt={item.cr40f_nomearquivo || "Evidência"} /> : <FileText size={22} />}<span><strong>{item.cr40f_nomearquivo}</strong><small>{displayEvidenceLabel(item.cr40f_contexto || item.cr40f_pasta || "Arquivo")} · Abrir no OneDrive</small></span></a>; })}{!evidences.length && <div className="empty-small">Nenhuma evidência vinculada.</div>}</div></section>
    <EvidencePicker className="note-composer" files={files} onChange={setFiles} label="Evidências do histórico" folder="Histórico" footer={<button className="small-button" onClick={submitNote} disabled={saving}>Adicionar nota</button>}><textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Adicionar atualização ao histórico..." /></EvidencePicker>
  </div>;
}
