// V2.1: "Aguardar informação" na edição da cotação: o que falta, de quem e quando deve voltar.
import React, { useState } from "react";
import { localDateKey } from "../../domain/management";
import { defaultWaitingReturnDate, QUOTE_WAITING_LIMITS, validateQuoteWaiting, type QuoteWaitingFields } from "../../domain/quoteWaiting";
import { FormDateInput, FormTextArea, FormTextInput, QuoteField } from "./QuoteFields";

interface Props {
  initial?: QuoteWaitingFields;
  saving?: boolean;
  onCancel: () => void;
  /** Devolve "" quando gravou ou a mensagem do que impediu. */
  onConfirm: (fields: Required<QuoteWaitingFields>) => Promise<string>;
}

export default function QuoteWaitingDialog({ initial = {}, saving = false, onCancel, onConfirm }: Props) {
  const [start] = useState<Required<QuoteWaitingFields>>(() => ({
    waitingFor: initial.waitingFor || "",
    waitingFrom: initial.waitingFrom || "",
    waitingReturnDate: initial.waitingReturnDate || defaultWaitingReturnDate(localDateKey()),
  }));
  const [fields, setFields] = useState(start);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = fields.waitingFor !== start.waitingFor || fields.waitingFrom !== start.waitingFrom || fields.waitingReturnDate !== start.waitingReturnDate;
  // Overlay, Esc e Voltar: com algo digitado, confirma antes de descartar; salvando, não fecha.
  const requestCancel = () => { if (saving) return; if (dirty) setConfirmDiscard(true); else onCancel(); };
  const set = (key: keyof QuoteWaitingFields) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setError(""); setFields((current) => ({ ...current, [key]: event.target.value })); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const invalid = validateQuoteWaiting(fields);
    if (invalid) { setError(invalid); return; }
    setError(await onConfirm(fields));
  };
  return <div className="quote-v3-confirm-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) requestCancel(); }}>
    {confirmDiscard ? <div className="quote-v3-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quote-waiting-discard-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setConfirmDiscard(false); } }}>
      <h3 id="quote-waiting-discard-title">Descartar alterações?</h3>
      <p>O que você informou para aguardar não será salvo.</p>
      <div><button className="button button-secondary" type="button" autoFocus onClick={() => setConfirmDiscard(false)}>Continuar editando</button><button className="button button-danger" type="button" onClick={onCancel}>Descartar</button></div>
    </div> : <form className="quote-v3-dialog quote-waiting-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-waiting-title" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); requestCancel(); } }}>
      <h3 id="quote-waiting-title">Aguardar informação</h3>
      <QuoteField id="quote-waiting-for" label="O que falta" required wide><FormTextArea id="quote-waiting-for" autoFocus rows={3} maxLength={QUOTE_WAITING_LIMITS.waitingFor} value={fields.waitingFor} onChange={set("waitingFor")} placeholder="Ex.: horário do voo de volta" /></QuoteField>
      <QuoteField id="quote-waiting-from" label="De quem" required wide><FormTextInput id="quote-waiting-from" maxLength={QUOTE_WAITING_LIMITS.waitingFrom} value={fields.waitingFrom} onChange={set("waitingFrom")} placeholder="Ex.: cliente, motorista, fornecedor" /></QuoteField>
      <QuoteField id="quote-waiting-return" label="Data de retorno" required><FormDateInput id="quote-waiting-return" value={fields.waitingReturnDate} onChange={set("waitingReturnDate")} /></QuoteField>
      <p className="quote-stage-hint">No dia do retorno, quem criou a cotação e o Financeiro recebem um lembrete.</p>
      {error && <p role="alert">{error}</p>}
      <div><button className="button button-secondary" type="button" disabled={saving} onClick={requestCancel}>Voltar</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Salvando…" : "Aguardar"}</button></div>
    </form>}
  </div>;
}
