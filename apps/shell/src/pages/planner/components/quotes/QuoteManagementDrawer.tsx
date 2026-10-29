// Drawer da cotação (V3): passo a passo em 4 etapas (Pedido, Preço, Enviar, Resposta).
// Painel de 720px nas etapas de leitura; tela cheia, com o pedido fixo à esquerda, nas etapas de trabalho.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Link2, MoreHorizontal, Save, Send, Trash2, X } from "lucide-react";
import { Alert, Button, Dialog, Field, Menu, StatusBadge, Surface, Textarea } from "@betinhos/ui";
import { buildQuoteEmailHtml, copyQuoteToClipboard, deriveQuoteStatus, formatDateTime, formatMoney, loadQuoteImages, normalizeQuoteRoute, QUOTE_COMPLETED_STATUSES, QUOTE_TERMINAL_STATUSES, quoteSubject, sentLabel, validateQuoteStep } from '../../domain/quoteDomain';
import { localDateKey } from '../../domain/management';
import { startQuotePatch } from '../../domain/quoteTaskFlow';
import { createQuoteWord, downloadQuoteWord } from '../../domain/quoteWord';
import { createQuotePdf, downloadQuotePdf } from '../../domain/quotePdf';
import { canRegisterWaitingReturn, formatDate } from '../../domain/domain';
import { QUOTE_WAITING_STATUS, type QuoteWaitingFields } from '../../domain/quoteWaiting';
import QuoteWaitingDialog from './QuoteWaitingDialog';
import type { QuoteAttachmentsApi } from './useQuoteAttachments';
import type { LiveAttachment } from '../../data/dataverse';
import { QuoteClientFields, QuoteDeadlineFields, QuoteRequestFields } from './QuoteFields';
import MissingDeadlineDialog from './MissingDeadlineDialog';
import TaskHistorySection from '../TaskHistorySection';
import QuoteDeleteDialog from './QuoteDeleteDialog';
import QuoteOptionsEditor from './QuoteOptionsEditor';
import { chosenQuoteOption, formatQuoteOption, newQuoteOption, normalizeQuoteOptions, prepareQuoteResponse, resolveQuoteAcceptance } from '../../domain/quoteScenarios';
import { LOSS_REASONS, isLossReason } from '../../domain/quoteNotifications';
import { InputSelect } from '../AssignmentFields';

// As 4 etapas da tela. "Aguardando informação" é a etapa Preço parada.
const STEPS = ["Pedido", "Preço", "Enviar", "Resposta"];
const STEP_OF_STATUS: Record<string, number> = { Nova: 0, "Em análise pelo financeiro": 1, [QUOTE_WAITING_STATUS]: 1, Cotada: 2, "Respondida ao cliente": 3 };
const STEP_TITLE: Record<string, string> = { Nova: "Pedido do cliente", "Em análise pelo financeiro": "Opções de preço", Cotada: "Enviar a proposta", "Respondida ao cliente": "O que o cliente respondeu?", [QUOTE_WAITING_STATUS]: "Aguardando informação" };
const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = { Nova: "info", "Em análise pelo financeiro": "warning", [QUOTE_WAITING_STATUS]: "warning", Cotada: "success", "Respondida ao cliente": "info", "Aceita pelo cliente": "success", Perdida: "danger", Cancelada: "neutral" };

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
  const [acceptedOptionId, setAcceptedOptionId] = useState<any>(quote.acceptedOptionId || "");
  const [errors, setErrors] = useState<any>({});
  const [saving, setSaving] = useState<any>(false);
  const [saveError, setSaveError] = useState<any>("");
  const [saveMessage, setSaveMessage] = useState<any>("");
  const [quoteConflict, setQuoteConflict] = useState<any>(false);
  // Desvio da tela padrão do status: em Cotada voltar aos preços; em Respondida abrir a prévia para reenviar.
  const [override, setOverride] = useState<"prices" | "resend" | null>(null);
  const [composerBusy, setComposerBusy] = useState<any>("");
  const [composerMessage, setComposerMessage] = useState<any>("");
  const [confirmMissingDeadline, setConfirmMissingDeadline] = useState<any>(false);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState<any>(false);
  const [resultStatus, setResultStatus] = useState<any>("Aceita pelo cliente");
  const [lossReason, setLossReason] = useState<any>("");
  const [resultError, setResultError] = useState<any>("");
  const [deleteOpen, setDeleteOpen] = useState<any>(false);
  const [confirmClose, setConfirmClose] = useState<any>(false);
  const [previewHtml, setPreviewHtml] = useState<any>("");
  const [editingPreview, setEditingPreview] = useState<any>(false);
  const [previewEdited, setPreviewEdited] = useState<any>(false);
  const [previewResetKey, setPreviewResetKey] = useState<any>(0);
  const [inlineToolbarPosition, setInlineToolbarPosition] = useState<any>(null);
  const closeRef = useRef<any>(null);
  const dialogRef = useRef<any>(null);
  const returnFocusRef = useRef<any>(null);
  const baselineRef = useRef<any>({ id: quote.id, snapshot: quoteDraftSnapshot(quote) });
  const composerController = useRef<any>(null);
  const previewFrameRef = useRef<any>(null);
  const previewViewportRef = useRef<any>(null);
  const inlineToolbarRef = useRef<any>(null);
  const draftSnapshot = useMemo(() => quoteDraftSnapshot(draft), [draft]);
  const dirty = draftSnapshot !== baselineRef.current.snapshot;
  // Status mudado por qualquer caminho (envio, decisão, recarga) também tira a mensagem do passo anterior.
  useEffect(() => { setSaveMessage(""); setOverride(null); }, [draft.status]);
  const update = (key: any, value: any) => { setSaveMessage(""); setDraft((current: any) => ({ ...current, [key]: value })); };
  const requestClose = () => {
    if (mutationPending.current || saving) return;
    const changed = dirty || previewEdited;
    if (changed) { setConfirmClose(true); return; }
    onClose?.();
  };

  useEffect(() => { returnFocusRef.current = document.activeElement; closeRef.current?.focus(); return () => returnFocusRef.current?.focus?.(); }, []);
  useEffect(() => { onEnsureTaskDetails?.(task?.id); }, [onEnsureTaskDetails, task?.id]);
  useEffect(() => {
    const incomingSnapshot = quoteDraftSnapshot(quote); const baseline = baselineRef.current;
    if (baseline.id === quote.id && incomingSnapshot === baseline.snapshot) {
      if (draft.etag !== quote.etag || draft.modifiedAt !== quote.modifiedAt) setDraft((current: any) => ({ ...current, etag: quote.etag, modifiedAt: quote.modifiedAt }));
      return;
    }
    if (mutationPending.current) return;
    if (baseline.id === quote.id && draftSnapshot !== baseline.snapshot && draftSnapshot !== incomingSnapshot) { setQuoteConflict(true); return; }
    baselineRef.current = { id: quote.id, snapshot: incomingSnapshot };
    setDraft(quoteToDraft(quote));
    setQuoteConflict(false); setAcceptedOptionId(quote.acceptedOptionId || "");
  }, [quote, draft, draftSnapshot, saving]);
  const attachmentsApi = quoteAttachments as QuoteAttachmentsApi | undefined;
  const ensureQuoteAttachments = attachmentsApi?.ensure;
  useEffect(() => { void ensureQuoteAttachments?.(quote.id); }, [ensureQuoteAttachments, quote.id]);
  const attachmentList = attachmentsApi?.get(quote.id);
  const resetComposer = () => { composerController.current?.abort(); composerController.current = null; setComposerBusy(""); setComposerMessage(""); setOverride(null); };
  useEffect(() => { const handler = (event: any) => { if (event.key === "Escape" && !confirmClose && !waitingOpen && !mutationPending.current && !event.target?.closest?.(".bt-menu")) cancelOpen ? setCancelOpen(false) : deleteOpen ? setDeleteOpen(false) : requestClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose, deleteOpen, cancelOpen, confirmClose, waitingOpen, draft, previewEdited, saving]);
  useEffect(() => {
    const containFocus = (event: any) => {
      if (event.key !== "Tab" || confirmClose || cancelOpen || deleteOpen || waitingOpen) return;
      const scope = dialogRef.current;
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
  }, [cancelOpen, deleteOpen, confirmClose, waitingOpen]);
  useEffect(() => () => composerController.current?.abort(), []);
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

  const acceptedOption = chosenQuoteOption(draft);
  const awaitingDecision = draft.status === "Respondida ao cliente";
  const terminalQuote = QUOTE_TERMINAL_STATUSES.includes(draft.status);
  const stepIndex = terminalQuote ? 3 : STEP_OF_STATUS[draft.status] ?? 0;
  // Uma tela por status; o desvio só vale no status em que foi pedido.
  const view = terminalQuote ? "terminal" : draft.status === QUOTE_WAITING_STATUS ? "waiting"
    : awaitingDecision ? (override === "resend" ? "preview" : "decision")
    : draft.status === "Cotada" ? (override === "prices" ? "cost" : "preview")
    : draft.status === "Em análise pelo financeiro" ? "cost" : "request";
  const previewOpen = view === "preview";
  const costView = view === "cost";
  // Etapas de trabalho ocupam a tela inteira; leitura e espera ficam no painel estreito.
  const fullWidth = costView || previewOpen || view === "decision";
  const proposalSummary = useMemo(() => prepareQuoteResponse(draft), [draft]);
  // Abrir a prévia zera a edição manual; mudar os dados da cotação só regera o HTML.
  useEffect(() => { if (previewOpen) { setEditingPreview(false); setPreviewEdited(false); } }, [previewOpen]);
  useEffect(() => {
    if (!previewOpen) return undefined;
    const controller = new AbortController();
    if (!proposalSummary.valid) { setPreviewHtml(""); return undefined; }
    const previewQuote = { ...draft, proposalOptions: proposalSummary.options };
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
    // draftSnapshot cobre os dados de negócio; etag/modifiedAt não regeram a prévia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen, draftSnapshot]);

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
    // Outra gravação em andamento (clique duplo, ação inicial repetida): ignora, não é falha.
    if (mutationPending.current) return "";
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
    baselineRef.current = { id: quote.id, snapshot: quoteDraftSnapshot(nextDraft) }; setDraft(nextDraft); setQuoteConflict(false); setOverride(null);
    // Mudou de passo: o próprio passo novo é o retorno; "Cotação salva." fica só para edições no mesmo passo.
    setSaveMessage(nextDraft.status === draft.status ? "Cotação salva." : "");
    return "";
  };
  const openComposer = () => { setComposerMessage(""); setOverride(awaitingDecision ? "resend" : null); };
  const reloadQuote = () => {
    baselineRef.current = { id: quote.id, snapshot: quoteDraftSnapshot(quote) };
    setDraft(quoteToDraft(quote)); setAcceptedOptionId(quote.acceptedOptionId || ""); setQuoteConflict(false); setSaveError("");
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
      resetComposer();
    }
    return result;
  };
  // Decisão do cliente (inline em Respondida) ou cancelamento (diálogo, nos demais status).
  const registerResult = async (event?: any) => {
    event?.preventDefault();
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
    else { setCancelOpen(false); onClose?.(); }
  };
  const reopen = async () => {
    if (mutationPending.current) return;
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

  const sentProposal = draft.proposalVersions?.at(-1);
  const acceptedProposalVersionId = sentProposal?.id || "";
  const hasSentOptions = Boolean(sentProposal?.options?.length);
  const legacyDecision = awaitingDecision && !(draft.proposalVersions || []).length;
  const decisionOptions = hasSentOptions ? sentProposal.options : legacyDecision ? normalizeQuoteOptions(quote) : [];
  const acceptedChoice = decisionOptions.find((option: any) => option.id === acceptedOptionId);
  // Decisão (Respondida): ajusta os rádios; cancelamento fora de Respondida abre o diálogo.
  const openResult = (status: any) => {
    if (mutationPending.current || (status !== "Cancelada" && !decisionOptions.length)) return;
    setAcceptedOptionId(decisionOptions[0]?.id || "");
    setResultStatus(status); setLossReason(""); setResultError("");
    if (!awaitingDecision) setCancelOpen(true);
  };
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
  const canReturn = task ? canRegisterWaitingReturn(task, currentEmployee, teams) && Boolean(onRegisterWaitingReturn) : true;
  // Ação pedida pelo card do Kanban ou pelo board de tarefas ao abrir a cotação.
  // A chave evita repetir a ação quando o efeito roda de novo (StrictMode em dev).
  const initialActionKey = useRef("");
  useEffect(() => {
    const key = `${quote.id}:${initialAction}`;
    if (!initialAction || initialActionKey.current === key) return;
    initialActionKey.current = key;
    onActionConsumed?.();
    (actions as any)[initialAction]?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, quote.id]);
  const duplicateOption = (source: any) => {
    const template = newQuoteOption((draft.options || []).length);
    const copy = { ...source, id: template.id, name: `${source.name || "Opção"} (cópia)`, value: "", legacy: false, items: (source.items || []).map((item: any, index: any) => ({ ...item, id: (template.items as any)[index]?.id || (newQuoteOption(index).items as any)[0].id })) };
    const options = [...(draft.options || [])]; const sourceIndex = options.findIndex((item) => item.id === source.id);
    options.splice(sourceIndex + 1, 0, copy); update("options", options);
    requestAnimationFrame(() => document.getElementById(`quote-option-${copy.id}`)?.querySelector<any>("input[type='text']")?.focus());
  };

  const overdue = draft.deadline && draft.deadline < localDateKey() && !terminalQuote && !awaitingDecision;
  const deadlineLabel = !draft.deadline ? "Sem prazo" : draft.deadline === localDateKey() ? "Responder hoje" : `Responder até ${formatDate(draft.deadline)}`;
  const stepTitle = STEP_TITLE[draft.status] || draft.status;
  const hasFieldErrors = Object.keys(errors).length > 0;
  const requestSummary = <dl className="quote-flow__kv">
    <dt>Solicitante</dt><dd>{draft.clientContact || "Não informado"}{(draft.clientEmail || draft.clientPhone) && <small>{[draft.clientEmail, draft.clientPhone].filter(Boolean).join(" · ")}</small>}</dd>
    {draft.route && <><dt>Trajeto</dt><dd>{draft.route}</dd></>}
    {draft.passengers && <><dt>Passageiros</dt><dd>{draft.passengers}{draft.passengerProfile ? ` · ${draft.passengerProfile}` : ""}</dd></>}
    <dt>Prazo</dt><dd className={overdue ? "danger-text" : ""}>{formatDate(draft.deadline)}</dd>
  </dl>;
  const requestEditor = !terminalQuote && <details className="quote-flow__edit" open={hasFieldErrors || undefined}><summary>Editar dados do pedido</summary>
    <form id="quote-panel-dados" className="quote-flow__form" onSubmit={(event) => { event.preventDefault(); save(); }} aria-label="Dados da cotação">
      <section><h4>Cliente</h4><QuoteClientFields draft={draft} update={update} errors={errors} /></section>
      <section><h4>Pedido</h4><QuoteRequestFields draft={draft} update={update} errors={errors} /></section>
      <section><h4>Prazo</h4><QuoteDeadlineFields draft={draft} update={update} errors={errors} /></section>
    </form>
  </details>;
  const attachmentsBlock = <Surface eyebrow={`Anexos${attachmentList?.items?.length ? ` · ${attachmentList.items.length}` : ""}`} aria-label="Anexos da cotação">
    {attachmentList?.loading && <p role="status">Carregando anexos…</p>}
    {attachmentList?.error && <p role="alert">{attachmentList.error}<button type="button" className="button button-quiet" onClick={() => void attachmentsApi?.ensure(quote.id, true)}>Tentar novamente</button></p>}
    {attachmentsApi && AttachmentSectionComponent && <AttachmentSectionComponent taskId={quote.id} attachments={attachmentList?.items || []} loadAttachmentContent={loadAttachmentContent} onAttachment={(id: string, files: File[]) => attachmentsApi.add(id, files)} onDeleteAttachment={(id: string, attachment: LiveAttachment) => attachmentsApi.remove(id, attachment)} itemLabel="à cotação" sizeHint="Até 10 MB por arquivo" compact showPreview={false} />}
    {task && <>{task.detailsLoading && <p role="status">Carregando anexos da tarefa…</p>}
      {task.detailsError && <p role="alert">{task.detailsError}<button type="button" className="button button-quiet" onClick={() => onEnsureTaskDetails?.(task.id)}>Tentar novamente</button></p>}
      {AttachmentSectionComponent && (task.attachments || []).length > 0 && <AttachmentSectionComponent taskId={task.id} attachments={task.attachments} loadAttachmentContent={loadAttachmentContent} title="Anexos da tarefa (anterior)" sizeHint="Somente leitura" compact showPreview={false} />}</>}
  </Surface>;
  const requestBlock = <>
    <Surface eyebrow="Pedido do cliente" title={draft.title || undefined} aria-label="Pedido do cliente">
      <p className="quote-flow__quote">{draft.notes || "Pedido do cliente não informado."}</p>
      {requestSummary}
      {requestEditor}
    </Surface>
    {attachmentsBlock}
  </>;
  const historyBlock = <details className="quote-flow__history" id="quote-panel-historico"><summary>Histórico</summary>
    {(draft.proposalVersions || []).length > 0 && <section className="quote-flow__proposals"><h4>Propostas enviadas</h4>{draft.proposalVersions.map((version: any) => <article key={version.id}><strong>Versão {version.number}</strong><p>{version.channel ? `Enviada por ${version.channel}` : "Envio registrado"}{version.recipient ? ` para ${version.recipient}` : ""}{version.sentAt ? ` em ${formatDateTime(version.sentAt)}` : ""} · {version.authorName || "Autor não informado"}</p><ul>{(version.options || []).map((option: any) => <li key={option.id}>{formatQuoteOption(option)}</li>)}</ul>{draft.acceptedProposalVersionId === version.id && <StatusBadge tone="success">Proposta aceita</StatusBadge>}</article>)}</section>}
    {task && <TaskHistorySection history={task.history} employees={employees} loading={task.detailsLoading} error={task.detailsError} onRetry={() => onEnsureTaskDetails?.(task.id)} />}
    {task && ReturnsSectionComponent && <ReturnsSectionComponent task={task} currentEmployee={currentEmployee} loadAttachmentContent={loadAttachmentContent} onDeleteAttachment={onDeleteAttachment} />}
  </details>;
  const requestSurface = (editable = true) => <Surface compact aria-label="Pedido do cliente"><span className="bt-eyebrow">Pedido do cliente</span><p className="quote-flow__quote">{draft.notes || "Pedido do cliente não informado."}</p>{editable && <>{requestSummary}{requestEditor}</>}</Surface>;
  const previewBlock = previewOpen && <div className="quote-flow__preview">
    <div className="quote-flow__preview-bar"><span className="bt-eyebrow">Prévia · exatamente o que será copiado</span><span className="quote-flow__grow" />{previewEdited && <Button variant="ghost" size="compact" disabled={Boolean(composerBusy)} onClick={() => { setPreviewEdited(false); setEditingPreview(false); setPreviewResetKey((key: any) => key + 1); setComposerMessage("Edições descartadas."); }}>Reverter edições</Button>}<Button variant="secondary" size="compact" aria-pressed={editingPreview} disabled={Boolean(composerBusy) || !previewHtml} onClick={() => setPreviewEditing(!editingPreview)}>{editingPreview ? "Concluir edição" : "Editar texto"}</Button></div>
    <div className="quote-flow__preview-frame" ref={previewViewportRef}>{editingPreview && inlineToolbarPosition && <div ref={inlineToolbarRef} className="quote-v3-inline-toolbar" role="toolbar" aria-label="Formatação do texto" style={inlineToolbarPosition}>{[["bold", <strong>B</strong>, "Negrito"], ["italic", <em>I</em>, "Itálico"], ["underline", <span style={{ textDecoration: "underline" }}>U</span>, "Sublinhado"], ["insertUnorderedList", "•", "Lista com marcadores"], ["insertOrderedList", "1.", "Lista numerada"]].map(([command, label, title]: any) => <button key={command} className="quote-v3-inline-format-button" type="button" title={title} aria-label={title} onMouseDown={(event) => event.preventDefault()} onClick={() => formatPreview(command)}>{label}</button>)}</div>}<iframe key={previewResetKey} ref={previewFrameRef} title="Proposta para Outlook" onLoad={() => { fitEmailPreview(); const document = previewFrameRef.current?.contentDocument; const syncToolbar = () => requestAnimationFrame(positionInlineToolbar); document?.addEventListener("selectionchange", syncToolbar); document?.body?.addEventListener("focusin", syncToolbar); document?.body?.addEventListener("mouseup", syncToolbar); document?.body?.addEventListener("keyup", syncToolbar); document?.body?.addEventListener("input", () => { setPreviewEdited(true); requestAnimationFrame(() => { fitEmailPreview(); positionInlineToolbar(); }); }); document?.body?.addEventListener("keydown", (event: any) => { if (event.key === "Tab" && event.target.isContentEditable) { event.preventDefault(); document.execCommand(event.shiftKey ? "outdent" : "indent", false); } }); document?.body?.addEventListener("paste", (event: any) => { if (!event.target.isContentEditable) return; event.preventDefault(); document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") || ""); }); if (editingPreview) setPreviewEditing(true); }} srcDoc={previewHtml || buildQuoteEmailHtml(draft, { baseUrl: window.location.origin })} /></div>
  </div>;
  const sendAside = <>
    <div><h3>Como enviar</h3><ol className="quote-flow__howto"><li>Copie a proposta ou baixe o arquivo.</li><li>Envie{draft.clientEmail ? <> para <strong>{draft.clientEmail}</strong></> : " ao cliente"} pelo Outlook.</li><li>Volte aqui e clique em <strong>{awaitingDecision ? "Registrar novo envio" : "Registrar envio"}</strong>.</li></ol></div>
    <div className="quote-flow__send-actions">
      <Button variant="primary" fullWidth icon={<Copy size={16} />} disabled={Boolean(composerBusy) || !proposalSummary.valid} onClick={() => composeAction("copy")}>Copiar para o Outlook</Button>
      <div className="quote-flow__grid2"><Button variant="secondary" fullWidth icon={<Download size={16} />} disabled={Boolean(composerBusy) || !proposalSummary.valid} onClick={() => composeAction("pdf")}>Baixar PDF</Button><Button variant="secondary" fullWidth icon={<Download size={16} />} disabled={Boolean(composerBusy) || !proposalSummary.valid} onClick={() => composeAction("word")}>Baixar Word</Button></div>
      <span role="status" className="quote-flow__hint">{composerBusy ? "Preparando arquivos…" : composerMessage}</span>
    </div>
    <div><h3>Opções nesta proposta</h3>{proposalSummary.valid ? <ul className="quote-flow__lines">{proposalSummary.options.map((option) => <li key={option.id}><span>{option.name}</span><strong>{formatMoney(option.value)}</strong></li>)}</ul> : <p className="quote-flow__hint">{proposalSummary.error}</p>}{!awaitingDecision && <Button variant="ghost" size="compact" onClick={() => setOverride("prices")}>Editar preços</Button>}</div>
    {requestSurface()}
    {historyBlock}
  </>;
  const decisionMain = <>
    <p className="quote-flow__lead">{sentProposal ? `Proposta versão ${sentProposal.number} ${sentLabel(draft).toLowerCase()}${sentProposal.sentAt ? `, em ${formatDateTime(sentProposal.sentAt)}` : ""}. ` : ""}Marque a resposta do cliente e registre.</p>
    {decisionOptions.length === 0 && <Alert tone="warning" title="Nenhuma proposta enviada foi registrada" action={<Button variant="secondary" size="compact" disabled={saving} onClick={registerProposalSent}>Registrar envio</Button>}>Registre o envio antes de registrar a decisão do cliente.</Alert>}
    {legacyDecision && decisionOptions.length > 0 && <Alert tone="info">Cotação respondida sem versão histórica de envio. Registre a decisão sobre a opção atual.</Alert>}
    {decisionOptions.length > 0 && <div className="quote-flow__decide" role="radiogroup" aria-label="Decisão do cliente">
      {decisionOptions.map((option: any) => { const selected = resultStatus === "Aceita pelo cliente" && acceptedOptionId === option.id; return <label key={option.id} className={`quote-flow__option quote-flow__choice${selected ? " is-selected" : ""}`}><input type="radio" name="quote-decision" checked={selected} disabled={saving} onChange={() => { setResultStatus("Aceita pelo cliente"); setAcceptedOptionId(option.id); setResultError(""); }} /><span className="quote-flow__choice-text"><strong>Aceitou {option.name || "a opção"}</strong><span className="quote-flow__money-big">{formatMoney(option.value)}</span>{option.commercialTerms && <small>{option.commercialTerms}</small>}</span></label>; })}
      <label className={`quote-flow__option quote-flow__choice${resultStatus === "Perdida" ? " is-selected" : ""}`}><input type="radio" name="quote-decision" checked={resultStatus === "Perdida"} disabled={saving} onChange={() => { setResultStatus("Perdida"); setResultError(""); }} /><span className="quote-flow__choice-text"><strong>Recusou</strong><small>Encerra a cotação como Perdida, com o motivo.</small></span></label>
      <label className={`quote-flow__option quote-flow__choice${resultStatus === "Cancelada" ? " is-selected" : ""}`}><input type="radio" name="quote-decision" checked={resultStatus === "Cancelada"} disabled={saving} onChange={() => { setResultStatus("Cancelada"); setResultError(""); }} /><span className="quote-flow__choice-text"><strong>Cancelou o pedido</strong><small>Encerra a cotação sem perda registrada.</small></span></label>
    </div>}
    {resultStatus === "Perdida" && decisionOptions.length > 0 && <div className="quote-flow__reason" id="quote-result-reason"><span className="bt-field__label">Motivo da perda</span><InputSelect value={lossReason} disabled={saving} onChange={(value: string) => { setLossReason(value); setResultError(""); }} options={LOSS_REASONS.map((reason) => ({ value: reason, label: reason }))} placeholder="Escolha o motivo" /></div>}
    {decisionOptions.length > 0 && <Alert tone="info">{resultStatus === "Aceita pelo cliente" ? <>Ao registrar, a cotação é finalizada como aceita{acceptedChoice ? ` com ${formatMoney(acceptedChoice.value)}` : ""}{task ? " e a tarefa concluída" : ""}.</> : <>Esta ação encerra toda a cotação como {resultStatus}, incluindo todas as opções{task ? ", e conclui a tarefa" : ""}.</>}</Alert>}
    {resultError && <Alert tone="danger">{resultError}</Alert>}
  </>;
  const decisionAside = <>
    <div><h3>Proposta enviada</h3>{sentProposal ? <dl className="quote-flow__kv quote-flow__kv--tight"><dt>Versão</dt><dd>{sentProposal.number}</dd><dt>Enviada</dt><dd>{sentProposal.sentAt ? formatDateTime(sentProposal.sentAt) : "data não informada"}{sentProposal.authorName ? ` · ${sentProposal.authorName}` : ""}</dd>{draft.clientEmail && <><dt>Para</dt><dd>{draft.clientEmail}</dd></>}</dl> : <p className="quote-flow__hint">Nenhum envio registrado.</p>}</div>
    <div><h3>Sem resposta ainda?</h3><p className="quote-flow__hint">Feche o painel; a cotação continua aguardando. Se o cliente pediu ajuste, reenvie com uma nova versão.</p><Button variant="ghost" size="compact" disabled={saving} onClick={openComposer}>Reenviar com ajustes</Button></div>
    {requestSurface(false)}
    {historyBlock}
  </>;
  const costAside = <>
    {requestSurface()}
    {attachmentsBlock}
    {historyBlock}
  </>;
  const costMain = <>
    <p className="quote-flow__lead">Monte uma ou mais opções. Com título e valor em pelo menos uma, a cotação fica pronta para enviar.</p>
    <QuoteOptionsEditor options={draft.options || []} onChange={(options: any) => update("options", options)} onDuplicate={duplicateOption} />
    {errors.options && <Alert tone="danger">{errors.options}</Alert>}
    <Field label="Condições gerais (valem para todas as opções)" className="quote-flow__terms"><Textarea id="quote-commercial-terms" rows={2} value={draft.commercialTerms || ""} onChange={(event: any) => update("commercialTerms", event.target.value)} placeholder="Pagamento, validade, espera e cancelamento" /></Field>
  </>;
  const waitingMain = <>
    <p className="quote-flow__lead">A cotação está parada. Quando a informação chegar, registre o retorno para voltar ao preço.</p>
    <Surface eyebrow="O que falta" title={draft.waitingFor || "Sem detalhes registrados"} action={<Button variant="ghost" size="compact" disabled={saving} onClick={() => setWaitingOpen(true)}>Editar</Button>}>
      <dl className="quote-flow__kv"><dt>De quem</dt><dd>{draft.waitingFrom || "Não informado"}</dd><dt>Retorno previsto</dt><dd className={draft.waitingReturnDate && draft.waitingReturnDate <= localDateKey() ? "danger-text" : ""}>{draft.waitingReturnDate === localDateKey() ? "Hoje, " : ""}{formatDate(draft.waitingReturnDate)}</dd><dt>Prazo ao cliente</dt><dd className={overdue ? "danger-text" : ""}>{formatDate(draft.deadline)} · continua contando</dd></dl>
    </Surface>
    {requestBlock}
    {historyBlock}
  </>;
  const terminalMain = <>
    <Surface eyebrow="Resultado" title={draft.status}>
      <dl className="quote-flow__kv"><dt>Finalizada em</dt><dd>{draft.finalizationAt ? formatDateTime(draft.finalizationAt) : "data não informada"}</dd>{draft.status === "Aceita pelo cliente" && acceptedOption && <><dt>Opção aceita</dt><dd>{acceptedOption.name} · {formatMoney(acceptedOption.value)}</dd></>}{draft.status === "Perdida" && <><dt>Motivo</dt><dd>{draft.lossReason || "Não registrado"}</dd></>}</dl>
    </Surface>
    {requestBlock}
    {historyBlock}
  </>;
  const newMain = <>
    <p className="quote-flow__lead">Confira o que o cliente pediu. Se estiver tudo claro, comece a cotar; se faltar algo, peça a informação.</p>
    {requestBlock}
    {historyBlock}
  </>;

  const screens: Record<string, { aside?: React.ReactNode; main: React.ReactNode }> = { cost: { aside: costAside, main: costMain }, preview: { aside: sendAside, main: previewBlock }, decision: { aside: decisionAside, main: decisionMain }, waiting: { main: waitingMain }, terminal: { main: terminalMain }, request: { main: newMain } };
  const { aside, main } = screens[view];
  const moreMenu = <Menu align="start" trigger={(props) => <Button {...props} variant="secondary" icon={<MoreHorizontal size={18} />} aria-label="Mais ações" />} actions={[
    ...(task ? [{ id: "task", label: "Ver tarefa", icon: <Link2 size={14} />, onSelect: () => onOpenTask?.(task.id) }] : []),
    ...(!terminalQuote && !awaitingDecision ? [{ id: "cancel", label: "Cancelar cotação", disabled: saving, onSelect: () => openResult("Cancelada") }] : []),
    ...(onDeleteQuote ? [{ id: "delete", label: "Excluir cotação", icon: <Trash2 size={14} />, tone: "danger" as const, disabled: saving, onSelect: () => setDeleteOpen(true) }] : []),
  ]} />;
  const saveButton = <Button variant="secondary" icon={<Save size={15} />} disabled={saving} onClick={() => save()}>{saving ? "Salvando…" : "Salvar alterações"}</Button>;
  const sendButton = <Button icon={<Send size={16} />} disabled={saving || Boolean(composerBusy) || !proposalSummary.valid} onClick={registerProposalSent}>{awaitingDecision ? "Registrar novo envio" : "Registrar envio"}</Button>;
  const footer = <footer className="bt-drawer__foot quote-flow__foot">
    {moreMenu}
    {(costView || view === "request") && <Button variant="secondary" disabled={saving} onClick={actions.wait}>Aguardar informação</Button>}
    {view === "waiting" && task && <Button variant="secondary" disabled={saving} onClick={actions.resume}>Retomar cotação</Button>}
    {previewOpen && awaitingDecision && <Button variant="secondary" disabled={saving} onClick={resetComposer}>Voltar</Button>}
    <span className="quote-flow__grow">{previewOpen && !awaitingDecision && <span className="quote-flow__hint">Ainda não enviada</span>}</span>
    {dirty && !costView && !terminalQuote && saveButton}
    {view === "request" && <Button disabled={saving} onClick={actions.start}>Começar a cotar</Button>}
    {costView && <Button icon={<Save size={16} />} disabled={saving} onClick={() => save()}>{saving ? "Salvando…" : "Salvar preços"}</Button>}
    {previewOpen && !awaitingDecision && <Button variant="secondary" disabled={saving} onClick={actions.send}>Enviei ao cliente</Button>}
    {previewOpen && sendButton}
    {view === "decision" && <Button icon={<Check size={16} />} disabled={saving || !decisionOptions.length} onClick={() => registerResult()}>Registrar decisão</Button>}
    {view === "waiting" && canReturn && <Button className="drawer-return-action" disabled={saving} onClick={actions.return}>Registrar retorno</Button>}
    {terminalQuote && <Button variant="secondary" disabled={saving} onClick={reopen}>Reabrir cotação</Button>}
  </footer>;

  return <div className="quote-v3-layer" onClick={(event) => { if ((event.target as any).matches(".quote-v3-layer") && !cancelOpen && !deleteOpen && !waitingOpen && !confirmMissingDeadline) requestClose(); }}>
    <div className={`quote-flow${fullWidth ? " quote-flow--full" : ""}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quote-management-title">
    <header className="bt-drawer__head quote-flow__head">
      <div className="bt-drawer__heading"><span className="bt-drawer__eyebrow">{[draft.code || "Sem número", draft.client, draft.title].filter(Boolean).join(" · ")}</span><h2 id="quote-management-title" className="bt-drawer__title">{stepTitle}</h2></div>
      <div className="quote-flow__badges"><StatusBadge tone={STATUS_TONE[draft.status] || "neutral"}>{draft.status || "Sem status"}</StatusBadge>{awaitingDecision ? <StatusBadge tone="info">{sentLabel(draft)}</StatusBadge> : !terminalQuote && <StatusBadge tone={overdue || draft.deadline === localDateKey() ? "danger" : "neutral"}>{deadlineLabel}</StatusBadge>}{task?.assigneeNames?.length > 0 && <span className="quote-flow__assignee">{task.assigneeNames.join(", ")}</span>}</div><button ref={closeRef} className="bt-drawer__close" type="button" onClick={requestClose} aria-label="Fechar cotação"><X size={18} /></button>
    </header>
    <ol className="quote-flow__steps quote-stage-stepper" aria-label="Etapas da cotação">{STEPS.map((label, index) => { const state = index < stepIndex || terminalQuote ? "done" : index === stepIndex ? "active" : ""; return <li key={label} className={state} aria-current={state === "active" ? "step" : undefined}><b>{state === "done" ? <Check size={12} aria-hidden="true" /> : index + 1}</b>{label}{state === "active" && view === "waiting" && " · parado"}</li>; })}</ol>
    <div className="quote-flow__content">
    {(saveError || quoteConflict) && <div className="quote-flow__notice"><Alert tone="danger" action={quoteConflict ? <Button variant="secondary" size="compact" onClick={reloadQuote}>Recarregar cotação</Button> : undefined}>{quoteConflict ? "Esta cotação mudou em outra edição." : saveError}</Alert></div>}
    {saveMessage && <div className="quote-flow__notice"><Alert tone="success">{saveMessage}</Alert></div>}
    {resultError && !awaitingDecision && !cancelOpen && <div className="quote-flow__notice"><Alert tone="danger">{resultError}</Alert></div>}
    {quote.status === "Cotada" && task?.status === "done" && !quote.responseSent && <div className="quote-flow__notice"><Alert tone="warning">Registro anterior: tarefa concluída sem envio confirmado. Confira o envio antes de dar baixa; nenhum envio foi presumido.</Alert></div>}
    <div className={fullWidth ? "quote-flow__split" : "quote-flow__body"}>
      {fullWidth && <aside className="quote-flow__aside">{aside}</aside>}
      <div className={`quote-flow__main${previewOpen ? " quote-flow__main--preview" : ""}`}>{main}</div>
    </div>
    </div>
    {footer}
    </div>
  {confirmMissingDeadline && <MissingDeadlineDialog onCancel={() => { setConfirmMissingDeadline(false); document.getElementById("quote-deadline")?.focus(); }} onConfirm={() => save(true, pendingSavePatch.current)} />}
  <Dialog open={cancelOpen} tone="danger" title="Cancelar cotação?" onClose={() => { if (!saving) setCancelOpen(false); }} actions={<><Button variant="secondary" disabled={saving} onClick={() => setCancelOpen(false)}>Voltar</Button><Button variant="danger" disabled={saving} onClick={() => registerResult()}>{saving ? "Salvando…" : "Cancelar cotação"}</Button></>}>Esta ação encerra toda a cotação como Cancelada, incluindo todas as opções{task ? ", e conclui a tarefa" : ""}.{resultError && <p role="alert">{resultError}</p>}</Dialog>
  {waitingOpen && <QuoteWaitingDialog initial={draft.status === QUOTE_WAITING_STATUS ? draft : {}} saving={saving} onCancel={() => setWaitingOpen(false)} onConfirm={confirmWaiting} />}
  {deleteOpen && <QuoteDeleteDialog quote={quote} onCancel={() => setDeleteOpen(false)} onDelete={onDeleteQuote} />}
  <Dialog open={confirmClose} title="Descartar alterações?" onClose={() => setConfirmClose(false)} actions={<><Button variant="secondary" onClick={() => setConfirmClose(false)}>Continuar editando</Button><Button onClick={() => onClose?.()}>Descartar</Button></>}>As alterações não salvas nos dados e nas opções da cotação serão perdidas.</Dialog>
  </div>;
}
