// Porte de Tela Planner/src/quotes/QuoteFields.jsx (sem mudança de comportamento).
import React, { forwardRef, useEffect, useRef, useState } from "react";
import { ContactRound, PencilLine } from "lucide-react";
import { deadlineFromPreset, formatDateTime, formatMoney, parseQuoteMoney, QUOTE_COMPLETED_STATUSES, QUOTE_DEADLINE_PRESETS, quoteRoutePoints } from '../../domain/quoteDomain';
import { localDateKey } from '../../domain/management';
import { loadQuoteClients, loadQuoteRequesters } from '../../data/dataverse';
import { InputSelect } from '../AssignmentFields';
import PriorityPicker from '../PriorityPicker';
import { DateInput } from '../DateInput';
import SearchableSelect from '../SearchableSelect';

export function QuoteStatus({ status }: any) { return <span className="quote-v3-status"><span />{status || "Sem status"}</span>; }

export function QuoteField({ id, label, error, required = false, wide = false, children }: any) {
  return <label className={`quote-v3-field drawer-title-field${wide ? " quote-v3-field-wide" : ""}${error ? " is-invalid" : ""}`} htmlFor={id}>
    <span className="drawer-title-label">{label}{required && <b aria-hidden="true"> *</b>}</span>
    {children}
    {error && <small id={`${id}-error`} className="quote-v3-field-error">{error}</small>}
  </label>;
}

export const FormTextInput = forwardRef<any, any>(function FormTextInput({ error, className = "", ...props }: any, ref) {
  const errorId = props.id && error ? `${props.id}-error` : undefined;
  return <input ref={ref} {...props} className={`form-general-input${className ? ` ${className}` : ""}`} aria-invalid={error ? true : undefined} aria-describedby={errorId || props["aria-describedby"]} />;
});

function moneyDisplay(value: any) {
  if (value === "" || value === null || value === undefined) return "";
  const number = parseQuoteMoney(value);
  return Number.isFinite(number) ? formatMoney(number) : String(value);
}

export const FormMoneyInput = forwardRef<any, any>(function FormMoneyInput({ error, className = "", value, onChange, ...props }: any, ref) {
  const [editing, setEditing] = useState<any>(false);
  return <FormTextInput ref={ref} {...props} value={editing ? String(value ?? "") : moneyDisplay(value)} onChange={onChange} onFocus={(event: any) => { setEditing(true); props.onFocus?.(event); }} onBlur={(event: any) => { setEditing(false); props.onBlur?.(event); }} error={error} inputMode="decimal" type="text" className={className} />;
});

const FormDateInput = forwardRef<any, any>(function FormDateInput({ error, className = "", ...props }: any, ref) {
  const errorId = props.id && error ? `${props.id}-error` : undefined;
  const handleKeyDown = (event: any) => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Tab") return;
    const scope = event.currentTarget.closest(".quote-v3-drawer-body");
    if (!scope) return;
    const controls = [...scope.querySelectorAll("input:not([type='hidden']), textarea, [data-searchable-select-trigger], [role='radio'][tabindex='0'], button:not([type='submit']):not([tabindex='-1'])")]
      .filter((control) => !control.disabled && control.tabIndex >= 0 && control.offsetParent !== null && !control.closest("[hidden]"));
    const next = controls[controls.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };
  return <DateInput ref={ref} {...props} onKeyDown={handleKeyDown} className={`form-general-input${className ? ` ${className}` : ""}`} aria-invalid={error ? true : undefined} aria-describedby={errorId || props["aria-describedby"]} />;
});

export const FormTextArea = forwardRef<any, any>(function FormTextArea({ error, className = "", ...props }: any, ref) {
  const errorId = props.id && error ? `${props.id}-error` : undefined;
  return <textarea ref={ref} {...props} className={`form-general-input form-general-textarea${className ? ` ${className}` : ""}`} aria-invalid={error ? true : undefined} aria-describedby={errorId || props["aria-describedby"]} />;
});

export function QuoteClientFields({ draft, update, errors = {} }: any) {
  const [clients, setClients] = useState<any>([]);
  const [clientError, setClientError] = useState<any>("");
  const [mode, setMode] = useState<any>("registered");
  const [requesters, setRequesters] = useState<any>([]);
  const [requesterError, setRequesterError] = useState<any>("");
  const [requesterMode, setRequesterMode] = useState<any>("registered");
  const [selectedRequesterId, setSelectedRequesterId] = useState<any>("");
  const [pendingRequester, setPendingRequester] = useState<any>(null);
  const automaticValues = useRef<any>({});
  const selectMode = (value: any) => { if (value === mode) return; setMode(value); update("clientId", ""); update("client", ""); };
  const selectRequesterMode = (value: any) => { if (value === requesterMode) return; setRequesterMode(value); setSelectedRequesterId(""); update("clientContact", ""); };
  const applyRequester = (requester: any, overwrite = false) => {
    if (!requester) return;
    const values = { clientContact: requester.name, clientId: requester.clientId, client: requester.clientName, clientEmail: requester.email, clientPhone: requester.phone };
    for (const [key, value] of Object.entries(values)) {
      if (!value) continue;
      if (overwrite || !String(draft[key] || "").trim() || draft[key] === automaticValues.current[key] || key === "clientContact") update(key, value);
    }
    automaticValues.current = values;
    setPendingRequester(null);
  };
  const chooseRequester = (value: any) => {
    const requester = requesters.find((item: any) => item.id === value);
    setSelectedRequesterId(value);
    const pairs = [["client", requester?.clientName], ["clientEmail", requester?.email], ["clientPhone", requester?.phone]];
    const conflicts = pairs.some(([key, next]: any) => next && String(draft[key] || "").trim() && draft[key] !== next && draft[key] !== automaticValues.current[key]);
    if (conflicts) { update("clientContact", requester?.name || ""); setPendingRequester(requester); }
    else applyRequester(requester);
  };
  useEffect(() => {
    let active = true;
    loadQuoteClients().then(({ clients: rows }: any) => {
      if (!active) return;
      setClients(rows);
    }).catch(() => { if (active) setClientError("Não foi possível carregar os clientes cadastrados. Use o nome livre."); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    loadQuoteRequesters().then((rows) => {
      if (!active) return;
      setRequesters(rows);
      if (draft.clientContact && !rows.some((item) => item.name === draft.clientContact)) setRequesterMode("custom");
    }).catch(() => { if (active) setRequesterError("Não foi possível carregar os solicitantes cadastrados. Use o nome livre."); });
    return () => { active = false; };
  }, []);
  return <div className="quote-v3-form-grid">
    <QuoteField id="quote-title" label="Título interno" error={errors.title} wide><FormTextInput id="quote-title" error={errors.title} value={draft.title || ""} onChange={(event: any) => update("title", event.target.value)} placeholder="Ex.: Transfer executivo · GRU" /></QuoteField>
    <div className={`quote-v3-field quote-v3-client-field drawer-title-field${errors.client ? " is-invalid" : ""}`}>
    <div className="quote-v3-client-heading"><label className="drawer-title-label" htmlFor="quote-client">Cliente / empresa</label><div className="assignment-mode quote-v3-client-mode" role="group" aria-label="Origem do cliente"><button type="button" className={mode === "registered" ? "is-selected" : ""} aria-label="Cliente cadastrado" title="Cliente cadastrado" aria-pressed={mode === "registered"} onClick={() => selectMode("registered")}><ContactRound size={13} aria-hidden="true" /></button><button type="button" className={mode === "custom" ? "is-selected" : ""} aria-label="Digitar nome livre" title="Digitar nome livre" aria-pressed={mode === "custom"} onClick={() => selectMode("custom")}><PencilLine size={13} aria-hidden="true" /></button></div></div>
      {mode === "registered" ? <InputSelect value={draft.clientId || ""} onChange={(value: any) => { const client = clients.find((item: any) => item.id === value); update("clientId", client?.id || ""); update("client", client?.name || ""); }} options={clients.map((client: any) => ({ value: client.id, label: client.name }))} placeholder="Selecione um cliente" /> : <FormTextInput id="quote-client" error={errors.client} value={draft.client || ""} onChange={(event: any) => { update("client", event.target.value); update("clientId", ""); }} placeholder="Digite o nome do cliente" />}
      {errors.client && <small id="quote-client-error" className="quote-v3-field-error">{errors.client}</small>}{clientError && <small role="status">{clientError}</small>}
    </div>
    <div className={`quote-v3-field quote-v3-client-field drawer-title-field${errors.clientContact ? " is-invalid" : ""}`}>
    <div className="quote-v3-client-heading"><label className="drawer-title-label" htmlFor="quote-contact">Nome do solicitante<b aria-hidden="true"> *</b></label><div className="assignment-mode quote-v3-client-mode" role="group" aria-label="Origem do solicitante"><button type="button" className={requesterMode === "registered" ? "is-selected" : ""} aria-label="Solicitante cadastrado" title="Solicitante cadastrado" aria-pressed={requesterMode === "registered"} onClick={() => selectRequesterMode("registered")}><ContactRound size={13} aria-hidden="true" /></button><button type="button" className={requesterMode === "custom" ? "is-selected" : ""} aria-label="Digitar solicitante livre" title="Digitar solicitante livre" aria-pressed={requesterMode === "custom"} onClick={() => selectRequesterMode("custom")}><PencilLine size={13} aria-hidden="true" /></button></div></div>
      {requesterMode === "registered" ? <SearchableSelect variant="person-client" value={requesters.some((item: any) => item.id === selectedRequesterId && item.name === draft.clientContact) ? selectedRequesterId : requesters.find((item: any) => item.name === draft.clientContact)?.id || ""} onChange={chooseRequester} options={requesters.map((item: any) => ({ value: item.id, label: item.name, subtitle: [item.clientName, item.classification].filter(Boolean).join(" · "), search: [item.clientName, item.classification, item.email, item.phone].filter(Boolean).join(" ") }))} placeholder="Buscar por nome, empresa, e-mail ou telefone" aria-label="Nome do solicitante" /> : <FormTextInput id="quote-contact" error={errors.clientContact} value={draft.clientContact || ""} onChange={(event: any) => update("clientContact", event.target.value)} placeholder="Digite o nome do solicitante" />}
      {errors.clientContact && <small id="quote-contact-error" className="quote-v3-field-error">{errors.clientContact}</small>}{requesterError && <small role="status">{requesterError}</small>}
      {pendingRequester && <div className="quote-requester-conflict" role="alert"><span>O cadastro possui empresa ou contato diferente.</span><div><button type="button" onClick={() => setPendingRequester(null)}>Manter dados atuais</button><button type="button" onClick={() => applyRequester(pendingRequester, true)}>Usar dados do cadastro</button></div></div>}
    </div>
    <QuoteField id="quote-phone" label="Telefone / WhatsApp" error={errors.clientPhone}><FormTextInput id="quote-phone" type="tel" error={errors.clientPhone} value={draft.clientPhone || ""} onChange={(event: any) => update("clientPhone", event.target.value)} /></QuoteField>
    <QuoteField id="quote-email" label="E-mail" error={errors.clientEmail}><FormTextInput id="quote-email" type="email" error={errors.clientEmail} value={draft.clientEmail || ""} onChange={(event: any) => update("clientEmail", event.target.value)} /></QuoteField>
  </div>;
}

// Dados de agendamento (trajeto, datas, veículo) saíram da cotação; registros
// antigos continuam legíveis para não perder o que já foi preenchido.
function legacySchedulingSummary(draft: any) {
  const route = quoteRoutePoints(draft).join(" / ");
  return [route && `Trajeto: ${route}`, draft.serviceDate && `Saída: ${formatDateTime(draft.serviceDate)}`, draft.returnDate && `Retorno: ${formatDateTime(draft.returnDate)}`, draft.vehicleType && `Veículo: ${draft.vehicleType}`].filter(Boolean);
}

export function QuoteRequestFields({ draft, update, errors = {} }: any) {
  const legacy = legacySchedulingSummary(draft);
  return <div className="quote-v3-form-grid">
    <QuoteField id="quote-notes" label="Pedido do cliente" required error={errors.notes} wide><FormTextArea id="quote-notes" error={errors.notes} rows={5} maxLength="4000" value={draft.notes || ""} onChange={(event: any) => update("notes", event.target.value)} placeholder="Cole aqui a mensagem original do cliente, sem alterar o texto." /><small>Este texto vai na proposta enviada ao cliente.</small></QuoteField>
    <QuoteField id="quote-passengers" label="Número de passageiros"><FormTextInput id="quote-passengers" type="number" min="1" value={draft.passengers || ""} onChange={(event: any) => update("passengers", event.target.value)} /></QuoteField>
    <QuoteField id="quote-passenger-profile" label="Perfil do passageiro" error={errors.passengerProfile}><FormTextInput id="quote-passenger-profile" error={errors.passengerProfile} maxLength="300" value={draft.passengerProfile || ""} onChange={(event: any) => update("passengerProfile", event.target.value)} placeholder="Ex.: diretoria, autônomo, comitiva" /></QuoteField>
    <QuoteField id="quote-internal-notes" label="Observações internas" error={errors.internalNotes} wide><FormTextArea id="quote-internal-notes" error={errors.internalNotes} rows={3} maxLength="4000" value={draft.internalNotes || ""} onChange={(event: any) => update("internalNotes", event.target.value)} placeholder="Só a equipe vê. Não entra na proposta." /></QuoteField>
    {legacy.length > 0 && <div className="quote-v3-field quote-v3-field-wide quote-legacy-scheduling" role="note"><span className="drawer-title-label">Agendamento (registro anterior)</span><ul>{legacy.map((line) => <li key={line}>{line}</li>)}</ul></div>}
  </div>;
}

export function QuoteDeadlineFields({ draft, update, errors = {} }: any) {
  const today = localDateKey();
  const activePreset = QUOTE_DEADLINE_PRESETS.find((preset) => deadlineFromPreset(preset.id, today) === draft.deadline)?.id || "";
  return <div className="quote-v3-form-grid">
    <div className={`quote-v3-field drawer-title-field quote-v3-field-wide${errors.deadline ? " is-invalid" : ""}`}>
      <label className="drawer-title-label" htmlFor="quote-deadline">Prazo para responder<b aria-hidden="true"> *</b></label>
      <div className="quote-deadline-row">
        <div className="quote-deadline-presets" role="group" aria-label="Atalhos de prazo">{QUOTE_DEADLINE_PRESETS.map((preset) => <button key={preset.id} type="button" className={`quote-chip${activePreset === preset.id ? " is-selected" : ""}`} aria-pressed={activePreset === preset.id} onClick={() => update("deadline", deadlineFromPreset(preset.id, today))}>{preset.label}</button>)}</div>
        <FormDateInput id="quote-deadline" type="date" error={errors.deadline} value={draft.deadline || ""} onChange={(event: any) => update("deadline", event.target.value)} />
      </div>
      {errors.deadline && <small id="quote-deadline-error" className="quote-v3-field-error">{errors.deadline}</small>}
    </div>
    <div className="quote-v3-field drawer-title-field quote-v3-priority-field"><span className="drawer-title-label">Prioridade</span><PriorityPicker value={draft.priority || "medium"} onChange={(value: any) => update("priority", value)} includeUrgent /></div>
  </div>;
}

export function QuoteTermsFields({ draft, update, errors = {} }: any) {
  const showCommercialResult = QUOTE_COMPLETED_STATUSES.includes(draft.status);
  return <div className="quote-v3-form-grid">
    {showCommercialResult && !draft.options?.length && <QuoteField id="quote-value" label="Valor total (BRL)" required error={errors.value}><FormMoneyInput id="quote-value" required value={draft.value || ""} onChange={(event: any) => update("value", event.target.value)} placeholder="R$ 0,00" /></QuoteField>}
    <QuoteField id="quote-commercial-terms" label="Condições gerais da cotação" error={errors.commercialTerms} wide><FormTextArea id="quote-commercial-terms" rows={4} value={draft.commercialTerms || ""} onChange={(event: any) => update("commercialTerms", event.target.value)} placeholder="Condições comuns a todas as opções: pagamento, validade, espera e cancelamento" /></QuoteField>
  </div>;
}
