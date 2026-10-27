// Porte de Tela Planner/src/quotes/QuoteCreateDrawer.jsx (sem mudança de comportamento).
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { QUOTE_CREATE_STEPS, validateQuoteStep } from '../../domain/quoteDomain';
import { QuoteClientFields, QuoteDeadlineFields, QuoteRequestFields, QuoteTermsFields } from './QuoteFields';
import MissingDeadlineDialog from './MissingDeadlineDialog';
import { isAutomaticQuoteTitle, quoteTitle } from '../../domain/domain';
import QuoteOptionsEditor from './QuoteOptionsEditor';
import { newQuoteOption } from '../../domain/quoteScenarios';

const INITIAL_DRAFT = { status: "Nova", priority: "medium", assigneeIds: [], assigneeNames: [], options: [newQuoteOption(0)] };

export default function QuoteCreateDrawer({ employees = [], onClose, onCreate, AttachmentSectionComponent }: any) {
  const [draft, setDraft] = useState<any>(INITIAL_DRAFT);
  const [attachments, setAttachments] = useState<any>([]);
  const attachmentsRef = useRef<any>([]);
  attachmentsRef.current = attachments;
  const [stepIndex, setStepIndex] = useState<any>(0);
  const [errors, setErrors] = useState<any>({});
  const [saving, setSaving] = useState<any>(false);
  const [saveError, setSaveError] = useState<any>("");
  const [confirmClose, setConfirmClose] = useState<any>(false);
  const [confirmMissingDeadline, setConfirmMissingDeadline] = useState<any>(false);
  const initialFocusRef = useRef<any>(null);
  const changed = attachments.length > 0 || JSON.stringify(draft) !== JSON.stringify(INITIAL_DRAFT);
  const step = QUOTE_CREATE_STEPS[stepIndex];
  const update = (key: any, value: any) => { setDraft((current: any) => { const next = { ...current, [key]: value }; if (key === "clientContact" && isAutomaticQuoteTitle(current)) next.title = quoteTitle(next); return next; }); setErrors((current: any) => ({ ...current, [key]: "" })); };
  const requestClose = () => { if (saving) return; if (changed) setConfirmClose(true); else onClose?.(); };
  const keepTabInDrawer = (event: any) => {
    if (event.defaultPrevented || event.key !== "Tab" || confirmClose || confirmMissingDeadline) return;
    const drawer = document.querySelector<any>(".quote-v3-create");
    const controls = [...(drawer?.querySelectorAll("a[href], button, input:not([type='hidden']), select, textarea, [tabindex]") || [])]
      .filter((control) => !control.disabled && control.tabIndex >= 0 && control.offsetParent !== null && !control.closest("[hidden]"));
    const activeIndex = controls.indexOf(document.activeElement);
    if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && activeIndex === controls.length - 1) {
      event.preventDefault();
      controls[0]?.focus();
    }
  };

  useEffect(() => { initialFocusRef.current?.focus(); }, []);
  useEffect(() => {
    if (stepIndex === 0) return;
    document.querySelector<any>(".quote-v3-drawer-body .quote-v3-form-grid input:not([type='hidden']), .quote-v3-drawer-body .quote-v3-form-grid textarea, .quote-v3-drawer-body .quote-v3-form-grid [data-searchable-select-trigger]")?.focus({ preventScroll: true });
  }, [stepIndex]);
  useEffect(() => () => attachmentsRef.current.forEach((item: any) => URL.revokeObjectURL(item.previewUrl)), []);
  useEffect(() => {
    const onKeyDown = (event: any) => { if (event.key === "Escape" && !confirmClose) requestClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const validateCurrent = () => {
    const result = validateQuoteStep(draft, step.id);
    setErrors(result.errors);
    if (!result.valid) setTimeout(() => document.getElementById(fieldElementId(Object.keys(result.errors)[0]))?.focus(), 0);
    return result.valid;
  };
  const next = () => {
    if (!validateCurrent()) return;
    if (stepIndex === QUOTE_CREATE_STEPS.length - 1) submit();
    else setStepIndex((current: any) => current + 1);
  };
  const addAttachments = (_taskId: any, files: any) => setAttachments((current: any) => [
    ...current,
    ...Array.from(files || []).map((file) => ({
      id: `quote-${crypto.randomUUID()}`,
      name: (file as any).name,
      mimeType: (file as any).type,
      size: (file as any).size,
      previewUrl: URL.createObjectURL((file as any)),
      file,
      syncStatus: "pending",
    })),
  ]);
  const removeAttachment = (_taskId: any, attachment: any) => {
    setAttachments((current: any) => current.filter((item: any) => item.id !== attachment.id));
    URL.revokeObjectURL(attachment.previewUrl);
  };
  const handlePaste = (event: any) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (!files.length) return;
    event.preventDefault();
    addAttachments("paste", files);
  };
  const submit = async (confirmedWithoutDeadline = false) => {
    const result = validateQuoteStep(draft, "review");
    setErrors(result.errors);
    if (!result.valid) {
      const firstField = Object.keys(result.errors)[0];
      setStepIndex((STEP_BY_FIELD as any)[firstField] ?? 0);
      setTimeout(() => document.getElementById(fieldElementId(firstField))?.focus(), 0);
      return;
    }
    if (!draft.deadline && !confirmedWithoutDeadline) { setConfirmMissingDeadline(true); return; }
    setConfirmMissingDeadline(false);
    setSaving(true); setSaveError("");
    try {
      const success = await onCreate?.({ ...draft, status: "Nova", attachments: attachments.map((item: any) => item.file) });
      if (success !== false) onClose?.();
      else setSaveError("Não foi possível criar a cotação. Revise os dados e tente novamente.");
    } catch (error: any) { setSaveError(error.message || "Não foi possível criar a cotação."); }
    finally { setSaving(false); }
  };

  return <div className="quote-v3-layer" onKeyDown={keepTabInDrawer} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <aside className="quote-v3-drawer quote-v3-create" role="dialog" aria-modal="true" aria-labelledby="quote-create-title">
      <header className="quote-v3-drawer-header"><div><span className="eyebrow">NOVA SOLICITAÇÃO</span><h2 id="quote-create-title">Criar cotação</h2></div><button ref={initialFocusRef} className="icon-button" type="button" onClick={requestClose} aria-label="Fechar cadastro"><X size={20} /></button></header>
      <ol className="quote-v3-stepper" aria-label="Etapas do cadastro">{QUOTE_CREATE_STEPS.map((item, index) => <li key={item.id} className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""} aria-current={index === stepIndex ? "step" : undefined}><button type="button" tabIndex={-1} disabled={index > stepIndex} onClick={() => setStepIndex(index)}><span>{index < stepIndex ? <Check size={14} /> : index + 1}</span>{item.label}</button></li>)}</ol>
      <div className="quote-v3-drawer-body" onPaste={handlePaste}>
        <><div className="quote-v3-step-progress" role="progressbar" aria-valuemin={1} aria-valuemax={QUOTE_CREATE_STEPS.length} aria-valuenow={stepIndex + 1}><span style={{ width: `${((stepIndex + 1) / QUOTE_CREATE_STEPS.length) * 100}%` }} /></div>
          <div className="quote-v3-step-heading"><span>Etapa {stepIndex + 1} de {QUOTE_CREATE_STEPS.length}</span><h3>{step.label}</h3></div></>
        {step.id === "request" && <><QuoteClientFields draft={draft} update={update} errors={errors} /><QuoteRequestFields draft={draft} update={update} errors={errors} /><QuoteDeadlineFields draft={draft} update={update} errors={errors} /></>}
        {step.id === "commercial" && <><p className="quote-v3-step-hint">Opcional agora: o custo pode ser montado depois, pela etapa Custo da cotação.</p><QuoteOptionsEditor options={draft.options || []} onChange={(options: any) => update("options", options)} /><QuoteTermsFields draft={draft} update={update} errors={errors} />{AttachmentSectionComponent && <AttachmentSectionComponent taskId="new-quote" attachments={attachments} onAttachment={addAttachments} onDeleteAttachment={removeAttachment} itemLabel="à cotação" helperText="Os arquivos serão enviados após criar a cotação." />}</>}
        {saveError && <p className="quote-v3-save-error" role="alert">{saveError}</p>}
      </div>
      <footer className="quote-v3-drawer-footer"><div>{stepIndex > 0 && <button className="button button-secondary" type="button" onClick={() => setStepIndex((current: any) => current - 1)} disabled={saving}><ArrowLeft size={15} />Voltar</button>}<button className="button button-primary" type="button" onClick={next} disabled={saving}>{stepIndex === QUOTE_CREATE_STEPS.length - 1 ? (saving ? <><span className="quote-v3-spinner" />Criando cotação…</> : "Confirmar e criar") : <><span>Avançar</span><ArrowRight size={15} /></>}</button></div></footer>
    </aside>
    {confirmMissingDeadline && <MissingDeadlineDialog onCancel={() => { setConfirmMissingDeadline(false); setStepIndex(0); setTimeout(() => document.getElementById("quote-deadline")?.focus(), 0); }} onConfirm={() => submit(true)} />}
    {confirmClose && <div className="quote-v3-confirm-layer"><div className="quote-v3-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quote-discard-title"><h3 id="quote-discard-title">Descartar alterações?</h3><p>Os dados desta cotação existem apenas neste navegador e serão perdidos.</p><div><button className="button button-secondary" type="button" onClick={() => setConfirmClose(false)}>Continuar editando</button><button className="button button-danger" type="button" onClick={onClose}>Descartar</button></div></div></div>}
  </div>;
}

const STEP_BY_FIELD = { options: 1, value: 1, commercialTerms: 1 };
const FIELD_ELEMENT_IDS = { clientContact: "contact", clientPhone: "phone", clientEmail: "email", passengerProfile: "passenger-profile", internalNotes: "internal-notes", commercialTerms: "commercial-terms" };
function fieldElementId(field: any) { return `quote-${(FIELD_ELEMENT_IDS as any)[field] || field}`; }
