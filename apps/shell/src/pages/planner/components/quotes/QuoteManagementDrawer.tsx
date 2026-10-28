// Porte de Tela Planner/src/quotes/QuoteManagementDrawer.jsx (sem mudança de comportamento).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Link2, MoreHorizontal, Save, Send, Trash2, X } from "lucide-react";
import { buildQuoteEmailHtml, copyQuoteToClipboard, deriveQuoteStatus, formatDateTime, formatMoney, getQuoteNextAction, loadQuoteImages, normalizeQuoteRoute, QUOTE_COMPLETED_STATUSES, QUOTE_STAGES, QUOTE_TERMINAL_STATUSES, quoteStage, quoteSubject, sentLabel, validateQuoteStep } from '../../domain/quoteDomain';
import { localDateKey } from '../../domain/management';
import { startQuotePatch } from '../../domain/quoteTaskFlow';
import { createQuoteWord, downloadQuoteWord } from '../../domain/quoteWord';
import { createQuotePdf, downloadQuotePdf } from '../../domain/quotePdf';
import { canRegisterWaitingReturn, formatDate } from '../../domain/domain';
import { QUOTE_WAITING_STATUS, type QuoteWaitingFields } from '../../domain/quoteWaiting';
import QuoteWaitingDialog from './QuoteWaitingDialog';
import type { QuoteAttachmentsApi } from './useQuoteAttachments';
import type { LiveAttachment } from '../../data/dataverse';
import { QuoteClientFields, QuoteDeadlineFields, QuoteRequestFields, QuoteTermsFields } from './QuoteFields';
import MissingDeadlineDialog from './MissingDeadlineDialog';
import TaskHistorySection from '../TaskHistorySection';
import QuoteDeleteDialog from './QuoteDeleteDialog';
import QuoteOptionsComparison from './QuoteOptionsComparison';
import { chosenQuoteOption, formatQuoteOption, newQuoteOption, normalizeQuoteOptions, prepareQuoteResponse, resolveQuoteAcceptance } from '../../domain/quoteScenarios';
import { LOSS_REASONS, isLossReason } from '../../domain/quoteNotifications';
import { InputSelect } from '../AssignmentFields';
import { QuoteStatus } from './QuoteFields';

function quoteToDraft(quote: any) {
  return { ...quote, route: normalizeQuoteRoute(quote.route || [quote.origin, quote.destination].filter(Boolean).join(" / ")), options: normalizeQuoteOptions(quote) };
}
function quoteDraftSnapshot(quote: any) {
  const { etag, syncStatus, modifiedAt, optionsVersion, ...businessData } = quoteToDraft(quote);
  return JSON.stringify(businessData, (key, value) => key === "recordId" ? undefined : value);
}

export default function QuoteManagementDrawer({ quote, task, employees = [], teams = [], currentEmployee, initialAction = "", onActionConsumed, quoteAttachments, ReturnsSectionComponent, onClose, onOpenTask, onEnsureTaskDetails, onUpdate, onMarkSent, onOutcome, onDeleteQuote, onRegisterWaitingReturn, onDeleteAttachment, loadAttachmentContent, AttachmentSectionComponent }: any) {
  const [draft, setDraft] = useState<any>(() => quoteToDraft(quote));
  const mutationPending = useRef<any>(false);
  const pendingSavePatch = useRef<any>({});
  const [activeOptionId, setActiveOptionId] = useState<any>(() => normalizeQuoteOptions(quote)[0]?.id || "");
  const [acceptedOptionId, setAcceptedOptionId] = useState<any>(quote.acceptedOptionId || "");
  const [errors, setErrors] = useState<any>({});
  const [saving, setSaving] = useState<any>(false);
  const [saveError, setSaveError] = useState<any>("");
  const [saveMessage, setSaveMessage] = useState<any>("");
  const [quoteConflict, setQuoteConflict] = useState<any>(false);
  const [composerOpen, setComposerOpen] = useState<any>(false);
  const [composerBusy, setComposerBusy] = useState<any>("");
  const [composerMessage, setComposerMessage] = useState<any>("");
  const [confirmMissingDeadline, setConfirmMissingDeadline] = useState<any>(false);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState<any>(false);
  const resultRef = useRef<any>(null);
  const decisionFocusRef = useRef<any>(null);
  const [resultStatus, setResultStatus] = useState<any>("Aceita pelo cliente");
  const [lossReason, setLossReason] = useState<any>("");
  const [resultError, setResultError] = useState<any>("");
  const [deleteOpen, setDeleteOpen] = useState<any>(false);
  const [confirmClose, setConfirmClose] = useState<any>(false);
  const discardRef = useRef<any>(null);
  const [previewHtml, setPreviewHtml] = useState<any>("");
  const [editingPreview, setEditingPreview] = useState<any>(false);
  const [previewEdited, setPreviewEdited] = useState<any>(false);
  const [previewResetKey, setPreviewResetKey] = useState<any>(0);
  const [inlineToolbarPosition, setInlineToolbarPosition] = useState<any>(null);
  const closeRef = useRef<any>(null);
  const dialogRef = useRef<any>(null);
  const composerRef = useRef<any>(null);
  const returnFocusRef = useRef<any>(null);
  const baselineRef = useRef<any>({ id: quote.id, snapshot: quoteDraftSnapshot(quote) });
  const composerController = useRef<any>(null);
  const previewFrameRef = useRef<any>(null);
  const previewViewportRef = useRef<any>(null);
  const inlineToolbarRef = useRef<any>(null);
  const draftSnapshot = useMemo(() => quoteDraftSnapshot(draft), [draft]);
  const dirty = draftSnapshot !== baselineRef.current.snapshot;
  const update = (key: any, value: any) => { setSaveMessage(""); setDraft((current: any) => ({ ...current, [key]: value })); };
  const requestClose = () => {
    if (mutationPending.current || saving) return;
    const changed = dirty || previewEdited;
    if (changed) { setConfirmClose(true); return; }
    onClose?.();
  };
  useEffect(() => {
    if (!confirmClose) return;
    const previousFocus = document.activeElement;
    discardRef.current?.querySelector("button")?.focus();
    const handler = (event: any) => {
      if (event.key === "Escape") { event.preventDefault(); setConfirmClose(false); }
      if (event.key !== "Tab") return;
      const buttons = [...discardRef.current.querySelectorAll("button")];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); (previousFocus as any)?.focus?.(); };
  }, [confirmClose]);

  useEffect(() => { returnFocusRef.current = document.activeElement; closeRef.current?.focus(); return () => returnFocusRef.current?.focus?.(); }, []);
  useEffect(() => { onEnsureTaskDetails?.(task?.id); }, [onEnsureTaskDetails, task?.id]);
  useEffect(() => {
    const options = normalizeQuoteOptions(quote); const incomingSnapshot = quoteDraftSnapshot(quote); const baseline = baselineRef.current;
    if (baseline.id === quote.id && incomingSnapshot === baseline.snapshot) {
      if (draft.etag !== quote.etag || draft.modifiedAt !== quote.modifiedAt) setDraft((current: any) => ({ ...current, etag: quote.etag, modifiedAt: quote.modifiedAt }));
      return;
    }
    if (mutationPending.current) return;
    if (baseline.id === quote.id && draftSnapshot !== baseline.snapshot && draftSnapshot !== incomingSnapshot) { setQuoteConflict(true); return; }
    baselineRef.current = { id: quote.id, snapshot: incomingSnapshot };
    setDraft(quoteToDraft(quote)); setActiveOptionId(options[0]?.id || "");
    setQuoteConflict(false); setAcceptedOptionId(quote.acceptedOptionId || "");
  }, [quote, draft, draftSnapshot, saving]);
  const attachmentsApi = quoteAttachments as QuoteAttachmentsApi | undefined;
  const ensureQuoteAttachments = attachmentsApi?.ensure;
  useEffect(() => { void ensureQuoteAttachments?.(quote.id); }, [ensureQuoteAttachments, quote.id]);
  const attachmentList = attachmentsApi?.get(quote.id);
  const closeComposer = () => { composerController.current?.abort(); composerController.current = null; setComposerBusy(""); setComposerMessage(""); setComposerOpen(false); };
  useEffect(() => { const handler = (event: any) => { if (event.key === "Escape" && !confirmClose && !waitingOpen && !mutationPending.current) resultOpen ? setResultOpen(false) : deleteOpen ? setDeleteOpen(false) : composerOpen ? closeComposer() : requestClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose, composerOpen, deleteOpen, resultOpen, confirmClose, waitingOpen, draft, previewEdited, saving]);
  useEffect(() => {
    const containFocus = (event: any) => {
      if (event.key !== "Tab" || confirmClose || resultOpen || deleteOpen || waitingOpen) return;
      const scope = composerOpen ? composerRef.current : dialogRef.current;
      const focusable = [...(scope?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])].filter((item) => item.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable.at(-1);
      const activeInSelect = (document.activeElement as any).closest?.(".custom-select-panel.is-open");
      if (activeInSelect) return;
      if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", containFocus);
    return () => window.removeEventListener("keydown", containFocus);
  }, [composerOpen, resultOpen, deleteOpen, confirmClose, waitingOpen]);
  useEffect(() => () => composerController.current?.abort(), []);
  useEffect(() => {
    if (!resultOpen) return;
    resultRef.current?.querySelector("textarea, button")?.focus();
    const handler = (event: any) => {
      if (event.key !== "Tab") return;
      const elements = [...(resultRef.current?.querySelectorAll("button:not([disabled]), textarea:not([disabled])") || [])];
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); decisionFocusRef.current?.focus?.(); };
  }, [resultOpen]);
  const fitEmailPreview = () => {
    const frame = previewFrameRef.current;
    const viewport = previewViewportRef.current;
    const document = frame?.contentDocument;
    if (!document?.body || !viewport) return;
    document.body.style.zoom = "1";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const naturalWidth = document.documentElement.scrollWidth || 794;
    const naturalHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
    const scale = Math.min(1, (viewport.clientWidth - 32) / naturalWidth, (viewport.clientHeight - 32) / naturalHeight);
    document.body.style.zoom = String(Math.max(.35, scale));
  };
  const positionInlineToolbar = () => {
    const frame = previewFrameRef.current;
    const viewport = previewViewportRef.current;
    const document = frame?.contentDocument;
    if (!document?.body.classList.contains("quote-email-editing") || !viewport) {
      setInlineToolbarPosition(null);
      return;
    }
    const selectionNode = document.getSelection()?.anchorNode;
    const selectionElement = selectionNode?.nodeType === 1 ? selectionNode : selectionNode?.parentElement;
    const target = selectionElement?.closest('[contenteditable="true"]') || document.activeElement?.closest?.('[contenteditable="true"]');
    if (!target) { setInlineToolbarPosition(null); return; }
    const frameRect = frame.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const toolbarWidth = inlineToolbarRef.current?.offsetWidth || 264;
    const toolbarHeight = inlineToolbarRef.current?.offsetHeight || 42;
    const left = Math.max(8, Math.min(frameRect.left - viewportRect.left + targetRect.left, viewport.clientWidth - toolbarWidth - 8));
    const above = frameRect.top - viewportRect.top + targetRect.top - toolbarHeight - 8;
    const below = frameRect.top - viewportRect.top + targetRect.bottom + 8;
    const top = above >= 8 ? above : Math.min(below, viewport.clientHeight - toolbarHeight - 8);
    setInlineToolbarPosition({ left, top });
  };
  const setPreviewEditing = (enabled: any) => {
    const document = previewFrameRef.current?.contentDocument;
    if (!document?.body) return;
    document.body.classList.toggle("quote-email-editing", enabled);
    let editorStyle = document.getElementById("quote-email-editor-style");
    if (enabled && !editorStyle) {
      editorStyle = document.createElement("style");
      editorStyle.id = "quote-email-editor-style";
      editorStyle.textContent = ".quote-email-editing p[contenteditable]:hover,.quote-email-editing td[contenteditable]:hover{outline:1px dashed #7da9ff;outline-offset:3px;cursor:text}.quote-email-editing p[contenteditable]:focus,.quote-email-editing td[contenteditable]:focus{outline:2px solid #3978e8;outline-offset:3px;border-radius:2px}";
      document.head.appendChild(editorStyle);
    } else if (!enabled) editorStyle?.remove();
    const editableBlocks = [...document.body.querySelectorAll("p, td")].filter((element) =>
      element.textContent.trim() && !element.querySelector("p, td, table, img") && !(element.tagName === "TD" && element.querySelector("p"))
    );
    editableBlocks.forEach((block) => {
      block.contentEditable = enabled ? "true" : "false";
      block.spellcheck = enabled;
    });
    document.body.querySelectorAll("img").forEach((image: any) => { image.contentEditable = "false"; image.draggable = false; });
    setEditingPreview(enabled);
    if (!enabled) setInlineToolbarPosition(null);
    else requestAnimationFrame(positionInlineToolbar);
    if (enabled) setComposerMessage("Edite os textos na prévia. Copiar, PDF, Word e o registro do envio usam exatamente o que está aqui.");
    else setComposerMessage(previewEdited ? "Texto editado. Copiar, PDF, Word e o registro do envio usarão exatamente esta versão." : "");
  };
  const getEditedPreview = () => {
    const document = previewFrameRef.current?.contentDocument;
    if (!document?.body) return {};
    const copy = document.documentElement.cloneNode(true);
    copy.querySelectorAll("[contenteditable]").forEach((element: any) => element.removeAttribute("contenteditable"));
    copy.querySelectorAll("[spellcheck]").forEach((element: any) => element.removeAttribute("spellcheck"));
    copy.querySelector("#quote-email-editor-style")?.remove();
    copy.querySelector("body")?.classList.remove("quote-email-editing");
    const body = copy.querySelector("body");
    if (body) body.style.removeProperty("zoom");
    return { html: `<!DOCTYPE html>${copy.outerHTML}`, text: document.body.innerText || document.body.textContent || "" };
  };
  const formatPreview = (command: any) => {
    const document = previewFrameRef.current?.contentDocument;
    if (!document?.execCommand(command, false)) return;
    requestAnimationFrame(positionInlineToolbar);
  };
  useEffect(() => {
    if (!composerOpen) return undefined;
    setEditingPreview(false);
    setPreviewEdited(false);
    const controller = new AbortController();
    const proposal = prepareQuoteResponse(draft);
    if (!proposal.valid) { setPreviewHtml(""); return undefined; }
    const previewQuote = { ...draft, proposalOptions: proposal.options };
    setPreviewHtml(buildQuoteEmailHtml(previewQuote, { baseUrl: window.location.origin }));
    loadQuoteImages(previewQuote, { baseUrl: window.location.origin, signal: controller.signal })
      .then((assets) => {
        if (!controller.signal.aborted) setPreviewHtml(buildQuoteEmailHtml(previewQuote, { ...assets, baseUrl: window.location.origin }));
      })
      .catch(() => {});
    const viewport = previewViewportRef.current;
    const observer = viewport && typeof ResizeObserver !== "undefined" ? new ResizeObserver(fitEmailPreview) : null;
    if (viewport) observer?.observe(viewport);
    requestAnimationFrame(fitEmailPreview);
    return () => { controller.abort(); observer?.disconnect(); };
  }, [composerOpen, draft]);

  const run = async (operation: any) => {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setSaving(true);
    try { return await operation(); }
    catch { return false; }
    finally { mutationPending.current = false; setSaving(false); }
  };
  // Salva o rascunho; "Cotada" é derivada das opções, nunca escolhida à mão.
  // Devolve "" quando gravou ou a mensagem do que impediu.
  const save = async (confirmedWithoutDeadline = false, patch: any = {}) => {
    setSaveMessage("");
    const fail = (message: any) => { setSaveError(message); return message; };
    if (quoteConflict) return fail("Esta cotação mudou em outra edição. Recarregue os dados antes de salvar para evitar sobrescrever alterações.");
    const nextDraft = { ...draft, ...patch, status: deriveQuoteStatus({ ...draft, ...patch }) };
    const validation = validateQuoteStep(nextDraft, "review"); setErrors(validation.errors);
    if (!validation.valid) return fail(`Revise os campos obrigatórios: ${Object.values(validation.errors)[0]}`);
    if (!draft.deadline && !confirmedWithoutDeadline) { pendingSavePatch.current = patch; setConfirmMissingDeadline(true); return "Informe o prazo ou confirme salvar sem prazo."; }
    setConfirmMissingDeadline(false);
    setSaveError("");
    const result = await run(() => onUpdate?.(quote.id, nextDraft));
    if (result === false) return fail("Não foi possível salvar. Sua edição continua aberta; confira sua conexão e tente novamente.");
    baselineRef.current = { id: quote.id, snapshot: quoteDraftSnapshot(nextDraft) }; setDraft(nextDraft); setQuoteConflict(false); setSaveMessage("Cotação salva.");
    return "";
  };
  const openComposer = () => { setComposerMessage(""); setPreviewEdited(false); setEditingPreview(false); setComposerOpen(true); };
  const reloadQuote = () => {
    const options = normalizeQuoteOptions(quote);
    baselineRef.current = { id: quote.id, snapshot: quoteDraftSnapshot(quote) };
    setDraft(quoteToDraft(quote)); setActiveOptionId(options[0]?.id || ""); setAcceptedOptionId(quote.acceptedOptionId || ""); setQuoteConflict(false); setSaveError("");
  };
  // V2.1: grava o que falta/de quem/retorno (com a mudança para Aguardando, se ainda não estava).
  const confirmWaiting = async (fields: Required<QuoteWaitingFields>) => {
    const failure = await save(true, { status: QUOTE_WAITING_STATUS, ...fields });
    if (!failure) setWaitingOpen(false);
    return failure;
  };
  // Um passo só: a prévia exibida (inclusive texto editado) vira a versão
  // registrada. Se a cotação ainda não estava Cotada, salva antes.
  const registerProposalSent = async () => {
    if (quoteConflict) { setComposerMessage("Esta cotação mudou em outra edição. Recarregue antes de registrar o envio."); return; }
    if (!proposalSummary.valid) { setComposerMessage(proposalSummary.error); return; }
    const preview = previewEdited ? getEditedPreview() : {};
    await saveThenMarkSent({ html: preview.html || "", text: preview.text || "" }, setComposerMessage);
  };
  // Cotação ainda não concluída ou editada é salva antes de registrar o envio.
  const saveThenMarkSent = async (content: { html?: string; text?: string }, onError: (message: string) => void) => {
    const savedNow = !QUOTE_COMPLETED_STATUSES.includes(quote.status) || dirty;
    if (savedNow) {
      const failure = await save(true);
      if (failure) { onError(failure); return; }
    }
    await confirmProposalSent(content, savedNow);
  };
  // V2 ("Enviei"): registra só a data do envio, sem canal nem destinatário.
  // savedNow: a cotação acabou de ser salva e a etag/modifiedAt desta renderização
  // já ficaram para trás; o salvamento já checou a concorrência, então não repete.
  const confirmProposalSent = async (content: { html?: string; text?: string } = {}, savedNow = false) => {
    if (quoteConflict || !onMarkSent) return false;
    const { etag, modifiedAt, syncStatus, ...businessDraft } = draft;
    const version = savedNow ? {} : { expectedEtag: quote.etag, expectedModifiedAt: quote.modifiedAt };
    const request = { draft: { ...businessDraft, status: deriveQuoteStatus(draft) }, options: draft.options, html: content.html || "", text: content.text || "", ...version };
    const result = await run(() => onMarkSent(quote.id, request));
    if (result !== false) {
      const nextDraft = { ...draft, status: "Respondida ao cliente", responseSent: true };
      baselineRef.current = { id: quote.id, snapshot: quoteDraftSnapshot(nextDraft) }; setDraft(nextDraft);
      closeComposer();
    }
    return result;
  };
  const registerResult = async (event: any) => {
    event.preventDefault();
    if (mutationPending.current) return;
    if (quoteConflict) { setResultError("Esta cotação mudou em outra edição. Recarregue antes de registrar a decisão."); return; }
    if (!onOutcome) { setResultError("Não foi possível registrar o resultado. Tente novamente."); return; }
    const reason = lossReason.trim();
    if (resultStatus === "Perdida" && !isLossReason(reason)) { setResultError("Escolha o motivo da perda."); return; }
    if (reason.length > 1000) { setResultError("Motivo da perda excede 1.000 caracteres."); return; }
    if (resultStatus === "Aceita pelo cliente") {
      try { resolveQuoteAcceptance(draft, { acceptedOptionId, acceptedProposalVersionId }); }
      catch (error: any) { setResultError(error.message); return; }
    }
    setResultError("");
    const success = await run(() => onOutcome?.(quote.id, resultStatus, reason, resultStatus === "Aceita pelo cliente" ? { acceptedOptionId, acceptedProposalVersionId } : {}));
    if (success === false) setResultError("Não foi possível registrar o resultado. Tente novamente.");
    else { setResultOpen(false); onClose?.(); }
  };
  const reopen = async () => {
    const success = await run(() => onUpdate?.(quote.id, { status: "Nova", responseSent: false, finalizationAt: "", lossReason: "" }));
    if (success === false) setResultError("Não foi possível reabrir a cotação. Tente novamente.");
  };
  const composeAction = async (action: any) => {
    const controller = new AbortController();
    composerController.current = controller;
    setComposerBusy(action);
    setComposerMessage("");
    try {
      if (!proposalSummary.valid) throw new Error(proposalSummary.error);
      const proposalQuote = { ...draft, proposalOptions: proposalSummary.options };
      const assets = await loadQuoteImages(proposalQuote, { baseUrl: window.location.origin, signal: controller.signal });
      const currentPreview = getEditedPreview();
      if (action === "copy") {
        await copyQuoteToClipboard(proposalQuote, { ...assets, ...(previewEdited ? currentPreview : {}), signal: controller.signal });
        if (!controller.signal.aborted) setComposerMessage("Proposta copiada. Abra o Outlook, crie um e-mail, cole com Ctrl+V e depois registre o envio aqui.");
      } else if (action === "word") {
        const word = await createQuoteWord(proposalQuote, { baseUrl: window.location.origin, signal: controller.signal, assets, html: currentPreview.html });
        if (!controller.signal.aborted) { downloadQuoteWord(word); setComposerMessage("Word baixado com o mesmo visual da prévia."); }
      } else if (action === "pdf") {
        const pdf = await createQuotePdf(proposalQuote, { baseUrl: window.location.origin, signal: controller.signal, assets, html: currentPreview.html });
        if (!controller.signal.aborted) { downloadQuotePdf(pdf); setComposerMessage("PDF baixado com o mesmo visual da prévia."); }
      }
    } catch (error: any) {
      if (!controller.signal.aborted) setComposerMessage(error.message || "Não foi possível preparar a proposta.");
    } finally {
      if (composerController.current === controller) { composerController.current = null; setComposerBusy(""); }
    }
  };

  const acceptedOption = chosenQuoteOption(draft);
  const awaitingDecision = draft.status === "Respondida ao cliente";
  const sentProposal = draft.proposalVersions?.at(-1);
  const acceptedProposalVersionId = sentProposal?.id || "";
  const hasSentOptions = Boolean(sentProposal?.options?.length);
  const legacyDecision = awaitingDecision && !(draft.proposalVersions || []).length;
  const decisionOptions = hasSentOptions ? sentProposal.options : legacyDecision ? normalizeQuoteOptions(quote) : [];
  const acceptedChoice = decisionOptions.find((option: any) => option.id === acceptedOptionId);
  const terminalQuote = QUOTE_TERMINAL_STATUSES.includes(draft.status);
  const readOnlyOptions = terminalQuote || (awaitingDecision && decisionOptions.length > 0);
  const comparisonOptions = draft.status === "Aceita pelo cliente" && acceptedOption ? [acceptedOption] : awaitingDecision && decisionOptions.length > 0 ? decisionOptions : draft.options || [];
  // Diálogo de resultado: decisão do cliente (Respondida) ou cancelamento (demais status).
  const openResult = (status: any, optionId = decisionOptions[0]?.id) => {
    if (mutationPending.current || (status !== "Cancelada" && !decisionOptions.length)) return;
    decisionFocusRef.current = document.activeElement;
    setAcceptedOptionId(optionId || "");
    setResultStatus(status); setLossReason(""); setResultError(""); setResultOpen(true);
  };
  const currentOption = comparisonOptions.find((option: any) => option.id === activeOptionId) || comparisonOptions[0];
  const proposalSummary = prepareQuoteResponse(draft);
  const nextAction = getQuoteNextAction(draft);
  const stage = quoteStage(draft.status);
  const stageIndex = QUOTE_STAGES.indexOf(stage);
  const actions = {
    start: () => save(false, startQuotePatch(task, currentEmployee)),
    compose: openComposer,
    send: async () => {
      if (mutationPending.current) return;
      await saveThenMarkSent({}, setResultError);
    },
    // Sem tarefa (V2), registrar o retorno é retomar a cotação; os campos de espera são limpos.
    return: () => task ? onRegisterWaitingReturn?.(task.id) : save(false, { status: "Em análise pelo financeiro" }),
    outcome: () => openResult("Aceita pelo cliente"),
    reopen,
    wait: () => setWaitingOpen(true),
    resume: () => save(false, { status: "Em análise pelo financeiro" }),
  };
  const actionEnabled = { return: task ? canRegisterWaitingReturn(task, currentEmployee, teams) && Boolean(onRegisterWaitingReturn) : true, outcome: decisionOptions.length > 0, wait: true };
  // Ação pedida pelo card do Kanban ou pelo board de tarefas ao abrir a cotação.
  useEffect(() => {
    if (!initialAction) return;
    onActionConsumed?.();
    (actions as any)[initialAction]?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, quote.id]);
  const addOption = (option: any) => { update("options", [...(draft.options || []), option]); setActiveOptionId(option.id); requestAnimationFrame(() => document.getElementById(`quote-option-${option.id}`)?.querySelector<any>("input[type='text']")?.focus()); };
  const duplicateOption = (source: any) => {
    const template = newQuoteOption((draft.options || []).length);
    const copy = { ...source, id: template.id, name: `${source.name || "Opção"} (cópia)`, value: "", legacy: false, items: (source.items || []).map((item: any, index: any) => ({ ...item, id: (template.items as any)[index]?.id || (newQuoteOption(index).items as any)[0].id })) };
    const options = [...(draft.options || [])]; const sourceIndex = options.findIndex((item) => item.id === source.id);
    options.splice(sourceIndex + 1, 0, copy); update("options", options); setActiveOptionId(copy.id);
  };
  const removeOption = (option: any) => {
    const options = (draft.options || []).filter((item: any) => item.id !== option.id);
    update("options", options);
    if (activeOptionId === option.id) setActiveOptionId(options[Math.min((draft.options || []).findIndex((item: any) => item.id === option.id), options.length - 1)]?.id || "");
  };


  return <div className="quote-v3-layer" onClick={(event) => { if ((event.target as any).matches(".quote-v3-layer, .quote-v3-workspace, .quote-options-comparison") && !composerOpen && !resultOpen && !deleteOpen && !waitingOpen && !confirmMissingDeadline) requestClose(); }}><div className="quote-v3-workspace has-comparison" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quote-management-title">
    <QuoteOptionsComparison contextContent={<div className="quote-options-context">
      {awaitingDecision && <section aria-label="Decisão do cliente">{hasSentOptions ? <p>Opções da proposta enviada · Versão {sentProposal.number}</p> : legacyDecision && decisionOptions.length > 0 ? <p>Cotação respondida sem versão histórica de envio. Registre a decisão sobre a opção atual.</p> : <><p role="status">Nenhuma proposta enviada foi registrada. Registre o envio antes de registrar a decisão do cliente.</p><button className="button button-primary" type="button" disabled={saving} onClick={registerProposalSent}>Registrar envio</button></>}</section>}
      <section className="quote-request-overview" aria-label="Pedido do cliente completo"><h3>Pedido do cliente</h3><p className="quote-request-full-text">{draft.notes || "Pedido do cliente não informado."}</p></section>
      <section className="quote-attachments-overview" aria-label="Anexos da cotação"><h3>Anexos da cotação</h3>
        {attachmentList?.loading && <p role="status">Carregando anexos…</p>}
        {attachmentList?.error && <p role="alert">{attachmentList.error}<button type="button" className="button button-quiet" onClick={() => void attachmentsApi?.ensure(quote.id, true)}>Tentar novamente</button></p>}
        {attachmentsApi && AttachmentSectionComponent && <AttachmentSectionComponent taskId={quote.id} attachments={attachmentList?.items || []} loadAttachmentContent={loadAttachmentContent} onAttachment={(id: string, files: File[]) => attachmentsApi.add(id, files)} onDeleteAttachment={(id: string, attachment: LiveAttachment) => attachmentsApi.remove(id, attachment)} itemLabel="à cotação" sizeHint="Até 10 MB por arquivo" compact showPreview={false} />}
        {task && <>{task.detailsLoading && <p role="status">Carregando anexos da tarefa…</p>}
          {task.detailsError && <p role="alert">{task.detailsError}<button type="button" className="button button-quiet" onClick={() => onEnsureTaskDetails?.(task.id)}>Tentar novamente</button></p>}
          {AttachmentSectionComponent && (task.attachments || []).length > 0 && <AttachmentSectionComponent taskId={task.id} attachments={task.attachments} loadAttachmentContent={loadAttachmentContent} title="Anexos da tarefa (anterior)" sizeHint="Somente leitura" compact showPreview={false} />}</>}
      </section>
    </div>} options={comparisonOptions} activeId={currentOption?.id} accepted={draft.status === "Aceita pelo cliente"} readOnly={readOnlyOptions} sent={hasSentOptions} saving={saving} onDecision={awaitingDecision && decisionOptions.length > 0 ? (optionId: any, status: any) => openResult(status, optionId) : undefined} onActivate={setActiveOptionId} onAdd={addOption} onDuplicate={duplicateOption} onRemove={removeOption} onChange={(option: any) => update("options", (draft.options || []).map((item: any) => item.id === option.id ? option : item))} onGenerate={openComposer} />
    <aside className="quote-v3-drawer quote-v3-management">
    <header className="quote-v3-drawer-header"><div><span className="quote-code">{draft.code || "Sem número"}</span><h2 id="quote-management-title">{draft.client || draft.title}</h2><div className="quote-v3-header-meta"><QuoteStatus status={draft.status} /><span>{task?.assigneeNames?.join(", ") || "Equipe Financeiro"}</span>{awaitingDecision ? <span>{sentLabel(draft)}</span> : <span className={draft.deadline && draft.deadline < localDateKey() && !terminalQuote ? "danger-text" : ""}>Prazo {formatDate(draft.deadline)}</span>}</div>
    <ol className="quote-stage-stepper" aria-label="Etapas da cotação">{QUOTE_STAGES.map((item, index) => { const state = index < stageIndex || terminalQuote ? "done" : index === stageIndex ? "active" : ""; return <li key={item.id} className={state} aria-current={state === "active" ? "step" : undefined}><span>{state === "done" ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{item.label}</li>; })}</ol>
    {quote.status === "Cotada" && task?.status === "done" && !quote.responseSent && <p className="quote-v3-save-error" role="status">Registro anterior: tarefa concluída sem envio confirmado. Confira o envio antes de dar baixa; nenhum envio foi presumido.</p>}
</div><button ref={closeRef} className="icon-button" type="button" onClick={requestClose} aria-label="Fechar cotação"><X size={20} /></button></header>
    <div className="quote-v3-drawer-body">
      <form id="quote-panel-dados" className="quote-v3-data" onSubmit={(event) => { event.preventDefault(); save(); }} aria-label="Dados da cotação">
      <details className="quote-stage-section" open={stage.id === "request"}><summary><span className="quote-stage-number">1</span><h3>Pedido</h3><small>{draft.clientContact || "Solicitante"}{draft.passengers ? ` · ${draft.passengers} pax` : ""}{draft.deadline ? ` · até ${formatDate(draft.deadline)}` : ""}</small></summary><section><h4>Cliente</h4><QuoteClientFields draft={draft} update={update} errors={errors} /></section><section><h4>Pedido</h4><QuoteRequestFields draft={draft} update={update} errors={errors} /></section><section><h4>Prazo</h4><QuoteDeadlineFields draft={draft} update={update} errors={errors} /></section></details>
      <details className="quote-stage-section" open={stage.id === "cost"}><summary><span className="quote-stage-number">2</span><h3>Custo</h3><small>{proposalSummary.valid ? `${proposalSummary.options.length} ${proposalSummary.options.length === 1 ? "opção pronta" : "opções prontas"}` : "Sem opção com valor"}</small></summary><p className="quote-stage-hint">As opções ficam ao lado. Com título e valor, a cotação passa a Cotada sozinha.</p><section><QuoteTermsFields draft={draft} update={update} errors={errors} /></section></details>

      {draft.status === QUOTE_WAITING_STATUS && <section className="quote-v3-waiting" aria-label="Aguardando informação">
        <h4>Aguardando informação</h4>
        {draft.waitingFor ? <dl><dt>O que falta</dt><dd>{draft.waitingFor}</dd><dt>De quem</dt><dd>{draft.waitingFrom || "Não informado"}</dd><dt>Retorno</dt><dd className={draft.waitingReturnDate && draft.waitingReturnDate <= localDateKey() ? "danger-text" : ""}>{formatDate(draft.waitingReturnDate)}</dd></dl> : <p>Sem detalhes registrados.</p>}
        <div className="quote-v3-waiting-actions">
          <button className="button button-quiet" type="button" disabled={saving} onClick={() => setWaitingOpen(true)}>Editar</button>
          {actionEnabled.return && <button className="button button-secondary drawer-return-action" type="button" disabled={saving} onClick={actions.return}>Registrar retorno</button>}
        </div>
      </section>}
      {task && ReturnsSectionComponent && <ReturnsSectionComponent task={task} currentEmployee={currentEmployee} loadAttachmentContent={loadAttachmentContent} onDeleteAttachment={onDeleteAttachment} />}
      {terminalQuote && <section className="quote-v3-result"><h3>Resultado</h3><strong>{draft.status}</strong><span>Finalizada em {draft.finalizationAt ? formatDateTime(draft.finalizationAt) : "data não informada"}</span>{draft.status === "Aceita pelo cliente" && acceptedOption && <p>{acceptedOption.name} · {formatMoney(acceptedOption.value)}</p>}{draft.status === "Perdida" && <p>Motivo: {draft.lossReason || "Não registrado"}</p>}</section>}</form>
      {(saveError || quoteConflict) && <p className="quote-v3-save-error" role="alert">{quoteConflict ? "Esta cotação mudou em outra edição." : saveError}{quoteConflict && <button type="button" onClick={reloadQuote}>Recarregar cotação</button>}</p>}
      {saveMessage && <p role="status">{saveMessage}</p>}
      <details className="quote-stage-section" open={stage.id === "response"}><summary><span className="quote-stage-number">3</span><h3>Resposta</h3><small>{terminalQuote ? draft.status : sentProposal ? `Versão ${sentProposal.number} enviada` : "Ainda não enviada"}</small></summary>
      <div id="quote-panel-historico" className="quote-quote-history" aria-label="Histórico da cotação">{(draft.proposalVersions || []).length > 0 ? <section className="quote-proposal-history"><h4>Propostas enviadas</h4>{draft.proposalVersions.map((version: any) => <article key={version.id}><header><strong>Versão {version.number}</strong></header><p>{version.channel ? `Enviada por ${version.channel}` : "Envio registrado"}{version.recipient ? ` para ${version.recipient}` : ""}{version.sentAt ? ` em ${formatDateTime(version.sentAt)}` : ""}</p><p>Registrada por {version.authorName || "Autor não informado"}{version.createdAt ? ` em ${formatDateTime(version.createdAt)}` : ""}</p><ul>{(version.options || []).map((option: any) => <li key={option.id}>{formatQuoteOption(option)}</li>)}</ul>{draft.acceptedProposalVersionId === version.id && <span className="quote-accepted-version">Proposta aceita</span>}</article>)}</section> : <p className="quote-stage-hint">Monte a proposta na etapa Custo e registre o envio pela prévia.</p>}{task && <TaskHistorySection history={task.history} employees={employees} loading={task.detailsLoading} error={task.detailsError} onRetry={() => onEnsureTaskDetails?.(task.id)} />}</div>
      </details>
    </div>
    <footer className="quote-v3-drawer-footer quote-v3-management-footer"><div className="quote-management-primary-actions">{!terminalQuote && <button className="button button-primary" type="button" disabled={saving || (actionEnabled as any)[nextAction.primary.id] === false} onClick={(actions as any)[nextAction.primary.id]}>{["compose", "send"].includes(nextAction.primary.id) && <Send size={15} />}{nextAction.primary.label}</button>}{terminalQuote && <button className="button button-secondary" type="button" disabled={saving} onClick={reopen}>Reabrir cotação</button>}{!terminalQuote && dirty && <button className="button button-secondary" type="button" disabled={saving} onClick={() => save()}><Save size={15} />{saving ? "Salvando…" : "Salvar alterações"}</button>}{!terminalQuote && nextAction.secondary.map((action) => <button key={action.id} className="button button-quiet" type="button" disabled={saving || (actionEnabled as any)[action.id] === false} onClick={(actions as any)[action.id]}>{action.label}</button>)}</div><details className="quote-management-more"><summary aria-label="Mais ações"><MoreHorizontal size={18} /></summary><div>{task && <button type="button" onClick={() => onOpenTask?.(task.id)}><Link2 size={14} />Ver tarefa</button>}{!terminalQuote && draft.status !== "Respondida ao cliente" && <button type="button" disabled={saving} onClick={() => openResult("Cancelada")}>Cancelar cotação</button>}{onDeleteQuote && <button className="is-danger" type="button" disabled={saving} onClick={() => setDeleteOpen(true)}><Trash2 size={14} />Excluir cotação</button>}{resultError && <span role="alert">{resultError}</span>}</div></details></footer>
    </aside>
  </div>
  {composerOpen && <div className="quote-v3-composer-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}><section ref={composerRef} className="quote-v3-preview" role="dialog" aria-modal="true" aria-label="Montar email da cotação" tabIndex={-1}>
    <div className="quote-v3-preview-viewport" ref={previewViewportRef}>{editingPreview && inlineToolbarPosition && <div ref={inlineToolbarRef} className="quote-v3-inline-toolbar" role="toolbar" aria-label="Formatação do texto" style={inlineToolbarPosition}>{[["bold", <strong>B</strong>, "Negrito"], ["italic", <em>I</em>, "Itálico"], ["underline", <span style={{ textDecoration: "underline" }}>U</span>, "Sublinhado"], ["insertUnorderedList", "•", "Lista com marcadores"], ["insertOrderedList", "1.", "Lista numerada"]].map(([command, label, title]: any) => <button key={command} className="quote-v3-inline-format-button" type="button" title={title} aria-label={title} onMouseDown={(event) => event.preventDefault()} onClick={() => formatPreview(command)}>{label}</button>)}</div>}<iframe key={previewResetKey} ref={previewFrameRef} title="Proposta para Outlook" onLoad={() => { fitEmailPreview(); const document = previewFrameRef.current?.contentDocument; const syncToolbar = () => requestAnimationFrame(positionInlineToolbar); document?.addEventListener("selectionchange", syncToolbar); document?.body?.addEventListener("focusin", syncToolbar); document?.body?.addEventListener("mouseup", syncToolbar); document?.body?.addEventListener("keyup", syncToolbar); document?.body?.addEventListener("input", () => { setPreviewEdited(true); requestAnimationFrame(() => { fitEmailPreview(); positionInlineToolbar(); }); }); document?.body?.addEventListener("keydown", (event: any) => { if (event.key === "Tab" && event.target.isContentEditable) { event.preventDefault(); document.execCommand(event.shiftKey ? "outdent" : "indent", false); } }); document?.body?.addEventListener("paste", (event: any) => { if (!event.target.isContentEditable) return; event.preventDefault(); document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") || ""); }); if (editingPreview) setPreviewEditing(true); }} srcDoc={previewHtml || buildQuoteEmailHtml(draft, { baseUrl: window.location.origin })} /></div>
    <footer className="quote-v3-composer-actions"><header className="quote-v3-preview-header"><div><span className="quote-v3-preview-kicker">Pré-visualização</span><strong>{quoteSubject(draft)}</strong></div><button className="icon-button" type="button" onClick={closeComposer} aria-label="Fechar montagem do email"><X size={20} /></button></header><section className="quote-proposal-summary" aria-label="Opções desta proposta"><strong>Opções desta proposta</strong>{proposalSummary.valid ? <ul>{proposalSummary.options.map((option) => <li key={option.id}>{formatQuoteOption(option)}</li>)}</ul> : <p>{proposalSummary.error} <button type="button" onClick={closeComposer}>Voltar às opções</button></p>}</section><span role="status">{composerBusy ? "Preparando arquivos…" : composerMessage || "Copie para o Outlook ou baixe o arquivo, envie ao cliente e registre o envio aqui."}</span><button className="button button-secondary" type="button" aria-pressed={editingPreview} disabled={Boolean(composerBusy) || !previewHtml} onClick={() => setPreviewEditing(!editingPreview)}>{editingPreview ? "Concluir edição" : "Editar texto"}</button>{previewEdited && <button className="button button-quiet" type="button" disabled={Boolean(composerBusy)} onClick={() => { setPreviewEdited(false); setEditingPreview(false); setPreviewResetKey((key: any) => key + 1); setComposerMessage("Edições descartadas."); }}>Reverter edições</button>}<button className="button button-secondary" type="button" disabled={Boolean(composerBusy) || !proposalSummary.valid} onClick={() => composeAction("copy")}><Copy size={15} />Copiar para o Outlook</button><div><button className="button button-secondary" type="button" disabled={Boolean(composerBusy) || !proposalSummary.valid} onClick={() => composeAction("pdf")}><Download size={15} />Baixar PDF</button><button className="button button-secondary" type="button" disabled={Boolean(composerBusy) || !proposalSummary.valid} onClick={() => composeAction("word")}><Download size={15} />Baixar Word</button></div>{!terminalQuote && <button className="button button-primary quote-register-send" type="button" disabled={saving || Boolean(composerBusy) || !proposalSummary.valid} onClick={registerProposalSent}><Send size={15} />{draft.status === "Respondida ao cliente" ? "Registrar novo envio" : "Registrar envio"}</button>}</footer>
  </section></div>}
  {confirmMissingDeadline && <MissingDeadlineDialog onCancel={() => { setConfirmMissingDeadline(false); document.getElementById("quote-deadline")?.focus(); }} onConfirm={() => save(true, pendingSavePatch.current)} />}
  {resultOpen && <div className="quote-v3-confirm-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setResultOpen(false); }}><form ref={resultRef} className="quote-v3-dialog" role="dialog" aria-modal="true" aria-label="Registrar resultado da cotação" onSubmit={registerResult}>
    <h3>{awaitingDecision ? "Registrar decisão do cliente" : "Cancelar cotação"}</h3>
    {awaitingDecision && decisionOptions.length > 0 && <div className="quote-decision-kind" role="radiogroup" aria-label="Decisão do cliente">{[["Aceita pelo cliente", "Aceitou"], ["Perdida", "Perdida"], ["Cancelada", "Cancelou"]].map(([status, label]: any) => <button key={status} type="button" role="radio" aria-checked={resultStatus === status} className={`quote-chip${resultStatus === status ? " is-selected" : ""}`} disabled={saving} onClick={() => { setResultStatus(status); setResultError(""); }}>{label}</button>)}</div>}
    {resultStatus === "Aceita pelo cliente" ? <>{decisionOptions.length > 1 && <div className="quote-result-option" id="quote-result-option"><span>Opção escolhida</span><InputSelect value={acceptedOptionId} disabled={saving} onChange={setAcceptedOptionId} options={decisionOptions.map((option: any) => ({ value: option.id, label: formatQuoteOption(option) }))} placeholder="Opção escolhida" /></div>}<p>{acceptedChoice?.name} · {formatMoney(acceptedChoice?.value)}<br />A cotação será finalizada como aceita pelo cliente{task ? " e a tarefa concluída" : ""}.</p></> : <p>Esta ação encerra toda a cotação como {resultStatus === "Perdida" ? "Perdida" : "Cancelada"}, incluindo todas as opções{task ? ", e conclui a tarefa" : ""}.</p>}
    {resultStatus === "Perdida" && <div className="quote-result-option" id="quote-result-reason"><span>Motivo da perda</span><InputSelect value={lossReason} disabled={saving} onChange={(value: string) => { setLossReason(value); setResultError(""); }} options={LOSS_REASONS.map((reason) => ({ value: reason, label: reason }))} placeholder="Escolha o motivo" /></div>}
    {resultError && <p role="alert">{resultError}</p>}
    <div><button className="button button-secondary" type="button" disabled={saving} onClick={() => setResultOpen(false)}>Voltar</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</button></div>
  </form></div>}
  {waitingOpen && <QuoteWaitingDialog initial={draft.status === QUOTE_WAITING_STATUS ? draft : {}} saving={saving} onCancel={() => setWaitingOpen(false)} onConfirm={confirmWaiting} />}
  {deleteOpen && <QuoteDeleteDialog quote={quote} onCancel={() => setDeleteOpen(false)} onDelete={onDeleteQuote} />}
  {confirmClose && <div className="quote-v3-confirm-layer"><div ref={discardRef} className="quote-v3-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quote-discard-title"><h3 id="quote-discard-title">Descartar alterações?</h3><p>As alterações não salvas nos dados e nas opções da cotação serão perdidas.</p><div><button className="button button-secondary" type="button" onClick={() => setConfirmClose(false)}>Continuar editando</button><button className="button button-danger" type="button" onClick={() => onClose?.()}>Descartar</button></div></div></div>}
  </div>;
}
