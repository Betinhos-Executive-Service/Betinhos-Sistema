// Porte de Tela Planner/src/quotes/QuoteSendDialog.jsx (sem mudança de comportamento).
import React, { useEffect, useRef, useState } from "react";
import { defaultQuoteSend, prepareQuoteResponse, QUOTE_SEND_CHANNELS, recipientForChannel, validateQuoteSend } from '../../domain/quoteScenarios';
import { FormTextInput } from './QuoteFields';
import { InputSelect } from '../AssignmentFields';

function localDateTimeValue(iso: any) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Registro do envio: canal, destinatário e momento. A prévia já foi copiada ou
// baixada; aqui fica a prova do que foi enviado e a tarefa passa a aguardar o cliente.
export default function QuoteSendDialog({ quote, onCancel, onConfirm, onReview }: any) {
  const [busy, setBusy] = useState<any>(false);
  const [error, setError] = useState<any>("");
  // sentAt fica no formato do input datetime-local e vira ISO só no envio.
  const [send, setSend] = useState<any>(() => { const initial = defaultQuoteSend(quote); return { ...initial, sentAt: localDateTimeValue(initial.sentAt) }; });
  const requestId = useRef<any>(crypto.randomUUID());
  const pending = useRef<any>(false);
  const dialog = useRef<any>(null);
  const proposal = prepareQuoteResponse(quote);
  const blocked = proposal.error;
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector("input, button")?.focus();
    return () => { if (previous?.isConnected) (previous as any).focus(); };
  }, []);
  const submit = async (event: any) => {
    event.preventDefault();
    if (pending.current || blocked) return;
    // O input é exibido no fuso de São Paulo (UTC-3, sem horário de verão); converter com o mesmo fuso.
    const payload = { ...send, sentAt: send.sentAt ? new Date(`${send.sentAt}:00-03:00`).toISOString() : "" };
    const validation = validateQuoteSend(payload);
    if (validation) { setError(validation); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      const success = await onConfirm({ requestId: requestId.current, send: payload });
      if (success === false) setError("Não foi possível registrar o envio. Sua edição continua aberta; tente novamente.");
    } catch (failure: any) { setError(failure.message || "Não foi possível registrar o envio."); }
    finally { pending.current = false; setBusy(false); }
  };
  const cancel = () => { if (!pending.current) onCancel(); };
  const handleKey = (event: any) => {
    if (event.key === "Escape") { event.stopPropagation(); cancel(); }
    if (event.key !== "Tab") return;
    const controls = [...dialog.current.querySelectorAll("button:not([disabled]), input:not([disabled]), [data-searchable-select-trigger]")].filter((element) => element.getClientRects().length);
    const first = controls[0]; const last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const setChannel = (channel: any) => setSend((current: any) => ({ ...current, channel, recipient: recipientForChannel(quote, channel) || current.recipient }));
  return <div className="quote-v3-confirm-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }} onKeyDown={handleKey}>
    <form ref={dialog} className="quote-v3-dialog quote-send-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-send-title" aria-describedby="quote-send-description" onSubmit={submit}>
      <h3 id="quote-send-title">Registrar envio da proposta</h3>
      {!blocked && <p id="quote-send-description">{`${proposal.options.length} ${proposal.options.length === 1 ? "opção" : "opções"} com valor. A tarefa fica aguardando a decisão do cliente.`}</p>}
      {!blocked && <div className="quote-send-fields">
        <div className="quote-v3-field drawer-title-field" id="quote-send-channel"><span className="drawer-title-label">Canal</span><InputSelect value={send.channel} disabled={busy} onChange={setChannel} options={QUOTE_SEND_CHANNELS.map((channel) => ({ value: channel, label: channel }))} placeholder="Canal do envio" /></div>
        <label className="quote-v3-field drawer-title-field" htmlFor="quote-send-recipient"><span className="drawer-title-label">Destinatário</span><FormTextInput id="quote-send-recipient" type={send.channel === "E-mail" ? "email" : "text"} value={send.recipient} disabled={busy} maxLength={500} onChange={(event: any) => setSend((current: any) => ({ ...current, recipient: event.target.value }))} placeholder={send.channel === "E-mail" ? "cliente@empresa.com" : "Número ou nome do contato"} /></label>
        <label className="quote-v3-field drawer-title-field" htmlFor="quote-send-at"><span className="drawer-title-label">Enviada em</span><FormTextInput id="quote-send-at" type="datetime-local" value={send.sentAt} disabled={busy} onChange={(event: any) => setSend((current: any) => ({ ...current, sentAt: event.target.value }))} /></label>
      </div>}
      {blocked && <p role="alert">{blocked}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="drawer-confirm-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={cancel}>Voltar</button>{blocked && onReview ? <button className="button button-primary" type="button" onClick={onReview}>Abrir cotação</button> : <button className="button button-primary" type="submit" disabled={busy || Boolean(blocked)}>{busy ? "Registrando…" : "Registrar envio"}</button>}</div>
    </form>
  </div>;
}
