// Porte de Tela Planner/src/quotes/HybridQuotesView.jsx (sem mudança de comportamento).
import React, { useCallback, useMemo, useState } from "react";
import { AlarmClock, CalendarDays, ChevronDown, CircleHelp, FileText, LayoutGrid, List, ListFilter, Plus, Search, UserRound, X } from "lucide-react";
import { formatDate } from '../../domain/domain';
import { deriveQuoteStatus, filterQuotes, getQuoteMetrics, isQuoteOpen, QUOTE_OPEN_STATUSES, QUOTE_PRIORITIES, QUOTE_TERMINAL_STATUSES, validateQuoteCommercial } from '../../domain/quoteDomain';
import QuoteCreateDrawer from './QuoteCreateDrawer';
import QuoteKanban from './QuoteKanban';
import QuoteHistory from './QuoteHistory';
import QuoteManagementDrawer from './QuoteManagementDrawer';
import QuoteSendDialog from './QuoteSendDialog';
import { SearchableMultiSelect } from '../SearchableSelect';
import { FormTextInput, QuoteStatus } from './QuoteFields';
import { readQuoteViewPreference, saveQuoteViewPreference } from '../../domain/quoteViewPreference';
import QuoteOptionsEditor from './QuoteOptionsEditor';
import { chosenQuoteOption, normalizeQuoteOptions } from '../../domain/quoteScenarios';

function quoteOptionsLabel(quote: any) {
  const options = normalizeQuoteOptions(quote);
  if (quote.status === "Aceita pelo cliente") {
    const accepted = chosenQuoteOption(quote);
    return accepted ? `Aceita: ${accepted.name} · ${accepted.value}` : "Aceita pelo cliente";
  }
  return options.length ? `${options.length} ${options.length === 1 ? "opção" : "opções"}${quote.status === "Respondida ao cliente" ? " · Aguardando decisão do cliente" : ""}` : "Aguardando composição";
}

// Arrastar para Cotada: a coluna exige ao menos uma opção com valor, então o
// diálogo abre a etapa de custo. Reabrir uma cotação já enviada pede confirmação.
function MoveDialog({ move, task, saving, onCancel, onConfirm, onAttachment, onDeleteAttachment, loadAttachmentContent, AttachmentSectionComponent }: any) {
  const [options, setOptions] = useState<any>(() => normalizeQuoteOptions(move.quote));
  // Dois modos: montar o custo (destino Cotada) ou reabrir uma cotação já enviada.
  const reopening = move.quote.status === "Respondida ao cliente";
  const pricing = !reopening;
  const validCommercial = !pricing || validateQuoteCommercial({ status: "Cotada", options }).valid;
  return <div className={`quote-v3-confirm-layer${pricing ? " quote-commercial-layer" : ""}`} role={pricing ? "dialog" : undefined} aria-modal={pricing ? true : undefined} aria-labelledby={pricing ? "quote-move-title" : undefined}>{pricing && <aside className="quote-commercial-request" aria-label="Pedido do cliente"><h3>Pedido do cliente</h3><p className="quote-commercial-request-text">{move.quote.notes || "Pedido do cliente não informado."}</p></aside>}<form className={`quote-v3-dialog${pricing ? " quote-commercial-dialog" : ""}`} role={pricing ? undefined : "dialog"} aria-modal={pricing ? undefined : true} onSubmit={(event) => { event.preventDefault(); if (validCommercial) onConfirm(pricing ? { options } : {}); }}><header className="quote-dialog-header"><div><span className="quote-dialog-eyebrow">Atualização da cotação</span><h3 id="quote-move-title">{pricing ? "Montar o custo da cotação" : "Reabrir a cotação para edição?"}</h3></div><button className="icon-button" type="button" onClick={onCancel} aria-label="Fechar"><X size={18} /></button></header><p>{pricing ? "Cadastre as opções com título e valor. A cotação fica pronta para enviar." : `${move.quote.code} volta para ${move.status}. O envio já registrado continua no histórico e a tarefa deixa de aguardar o cliente.`}</p>{pricing && <><QuoteOptionsEditor options={options} onChange={setOptions} actionsInHeading addLabel="Adicionar opção" />{task && AttachmentSectionComponent && <div className="quote-dialog-attachments"><div className="quote-dialog-section-title"><span>Anexos da cotação</span><small>Opcional</small></div><AttachmentSectionComponent taskId={task.id} attachments={task.attachments || []} loadAttachmentContent={loadAttachmentContent} onAttachment={onAttachment} onDeleteAttachment={onDeleteAttachment} itemLabel="à cotação" helperText="" showPreview={false} allowOpen={false} compact /></div>}</>}<div className="quote-dialog-actions"><button className="button button-secondary" type="button" onClick={onCancel}>Voltar</button><button className="button button-primary" type="submit" disabled={saving || !validCommercial}>{saving ? "Atualizando…" : pricing ? "Salvar custo" : "Reabrir"}</button></div></form></div>;
}

export default function HybridQuotesView({ state, currentEmployee, WaitingContextFieldsComponent, ReturnsSectionComponent, onOpenTask, onCreateQuote, onUpdateQuote, onDeleteQuote, onRequestWaitingQuote, onRegisterWaitingReturn, onMarkQuoteSent, onSetQuoteOutcome, selectedQuoteId, onSelectQuote, requestedQuoteAction = "", onQuoteActionConsumed, onEnsureTaskDetails, onAttachment, onDeleteAttachment, loadAttachmentContent, AttachmentSectionComponent }: any) {
  // Estáveis: os cards do Kanban são memoizados e recebem estes handlers.
  const openQuote = useCallback((id: any, { initialAction = "" }: any = {}) => onSelectQuote?.(id, initialAction), [onSelectQuote]);
  const closeQuote = () => onSelectQuote?.("");
  const [creating, setCreating] = useState<any>(false);
  const [filtersExpanded, setFiltersExpanded] = useState<any>(false);
  const [view, setView] = useState<any>(() => readQuoteViewPreference());
  const [section, setSection] = useState<any>("pending");
  const [filters, setFilters] = useState<any>({ query: "", responsible: [], priority: [], status: [], deadline: [] });
  const [pendingMove, setPendingMove] = useState<any>(null);
  const [pendingResponse, setPendingResponse] = useState<any>(null);
  const [moving, setMoving] = useState<any>(false);
  const allQuotes = state.quotes || [];
  const quotes = allQuotes.filter((quote: any) => isQuoteOpen(quote.status));
  const tasks = state.tasks || [];
  const tasksByQuote = useMemo(() => new Map(tasks.filter((task: any) => task.quoteId && !task.parentTaskId).map((task: any) => [task.quoteId, task])), [tasks]);
  const filtered = useMemo(() => filterQuotes(quotes, tasks, filters), [filters, quotes, tasks]);
  const metrics = useMemo(() => getQuoteMetrics(quotes, tasks), [quotes, tasks]);
  const selectedQuote = allQuotes.find((quote: any) => quote.id === selectedQuoteId);
  const selectedTask = selectedQuote ? tasksByQuote.get(selectedQuote.id) : null;
  const setFilter = (key: any, value: any) => setFilters((current: any) => ({ ...current, [key]: value }));
  const changeView = (next: any) => { setView(next); saveQuoteViewPreference(next); };
  const requestMove = useCallback((quote: any, status: any) => {
    if (status === "Respondida ao cliente") { setPendingResponse(quote); return true; }
    if (status === "Aguardando informação") { onRequestWaitingQuote?.(quote.id); return true; }
    // Cotada é derivada: uma cotação com opção precificada não "volta" para análise.
    const target = deriveQuoteStatus({ ...quote, status });
    if (target === quote.status) return false;
    if (target === "Cotada" || quote.status === "Respondida ao cliente") { setPendingMove({ quote, status: target }); return true; }
    onUpdateQuote?.(quote.id, { status: target });
    return true;
  }, [onRequestWaitingQuote, onUpdateQuote]);
  const confirmResponse = async (registration: any) => {
    if (!onMarkQuoteSent) return false;
    const result = await onMarkQuoteSent(pendingResponse.id, { ...registration, expectedEtag: pendingResponse.etag, expectedModifiedAt: pendingResponse.modifiedAt });
    if (result !== false) setPendingResponse(null);
    return result;
  };
  const confirmMove = async (patch: any) => { setMoving(true); try { const result = await onUpdateQuote?.(pendingMove.quote.id, { status: pendingMove.status, ...patch }); if (result !== false) setPendingMove(null); } finally { setMoving(false); } };
  // Ação primária do card: "Iniciar cotação" grava direto; as demais abrem a cotação já na ação.
  // Toda ação do card abre a cotação já na ação; "Registrar retorno" vai direto ao retorno da tarefa.
  const runCardAction = useCallback((quote: any, action: any) => {
    if (action.id === "return") { const task = tasksByQuote.get(quote.id); if (task) onRegisterWaitingReturn?.((task as any).id); return; }
    openQuote(quote.id, { initialAction: action.id });
  }, [onRegisterWaitingReturn, openQuote, tasksByQuote]);

  return <div className="page-content quotes-page quote-v3-page" data-view="quotes"><div className="page-header"><div><span className="eyebrow">ACOMPANHAMENTO COMERCIAL</span><h1>Cotações</h1><p>Cadastre, priorize e acompanhe a resposta sem sair da gestão.</p></div><button className="button button-primary" type="button" onClick={() => setCreating(true)}><Plus size={15} />Nova cotação</button></div>
    <div className="quote-v3-view-toggle quote-history-navigation" aria-label="Seção de cotações"><button type="button" className={section === "pending" ? "active" : ""} aria-pressed={section === "pending"} onClick={() => setSection("pending")}>Pendentes <b>{quotes.length}</b></button><button type="button" className={section === "history" ? "active" : ""} aria-pressed={section === "history"} onClick={() => setSection("history")}>Histórico <b>{allQuotes.filter((quote: any) => QUOTE_TERMINAL_STATUSES.includes(quote.status)).length}</b></button></div>
    {section === "pending" && <><div className="quote-v3-metrics" aria-label="Indicadores de cotações">{[
      ["Ativas", metrics.active, FileText, "active", () => setFilters((current: any) => ({ ...current, status: [], deadline: [] }))],
      ["Atrasadas", metrics.overdue, AlarmClock, "overdue", () => setFilter("deadline", ["overdue"])],
      ["Vencem hoje", metrics.dueToday, CalendarDays, "today", () => setFilter("deadline", ["today"])],
      ["Aguardando", metrics.waiting, CircleHelp, "waiting", () => setFilter("status", ["Aguardando informação"])],
    ].map(([label, value, Icon, tone, action]: any) => <button className={`quote-v3-metric quote-v3-metric-${tone}`} key={label} type="button" onClick={action}><span className="quote-v3-metric-icon" aria-hidden="true"><Icon size={17} strokeWidth={2} /></span><span className="quote-v3-metric-label">{label}</span><strong>{value}</strong></button>)}</div>
    <section className="panel quote-v3-panel"><div className={`quote-v3-toolbar${filtersExpanded ? " is-expanded" : ""}`}>
      <div className="search-field"><Search size={16} /><FormTextInput id="quotes-search" aria-label="Buscar cotações" value={filters.query} onChange={(event: any) => setFilter("query", event.target.value)} placeholder="Buscar cotação, cliente ou serviço" />{filters.query && <button className="search-field-clear" type="button" aria-label="Limpar busca" onClick={() => setFilter("query", "")}><X size={14} /></button>}</div>
      <button className="quote-v3-filter-toggle" type="button" aria-expanded={filtersExpanded} onClick={() => setFiltersExpanded((value: any) => !value)}><ListFilter size={15} />Filtros<ChevronDown size={15} /></button>
      <div className="quote-v3-filter-controls">
      <SearchableMultiSelect value={filters.responsible} onChange={(value: any) => setFilter("responsible", value)} options={[{ value: "unassigned", label: "Sem responsável" }, ...(state.employees || []).map((item: any) => ({ value: item.id, label: item.name }))]} placeholder="Todos os responsáveis" />
      <SearchableMultiSelect value={filters.status} onChange={(value: any) => setFilter("status", value)} options={QUOTE_OPEN_STATUSES.map((status) => ({ value: status, label: status }))} placeholder="Todos os status" />
      <SearchableMultiSelect value={filters.priority} onChange={(value: any) => setFilter("priority", value)} options={QUOTE_PRIORITIES.map((item) => ({ value: item.id, label: item.label }))} placeholder="Todas as prioridades" />
      <SearchableMultiSelect value={filters.deadline} onChange={(value: any) => setFilter("deadline", value)} options={[{ value: "overdue", label: "Atrasadas" }, { value: "today", label: "Vencem hoje" }, { value: "no-deadline", label: "Sem prazo" }]} placeholder="Todos os prazos" />
      </div>
      <div className="quote-v3-view-toggle" aria-label="Visualização"><button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => changeView("list")}><List size={15} />Lista</button><button type="button" className={view === "kanban" ? "active" : ""} aria-pressed={view === "kanban"} onClick={() => changeView("kanban")}><LayoutGrid size={15} />Kanban</button></div>
    </div>
      {(filters.query || filters.responsible.length || filters.priority.length || filters.status.length || filters.deadline.length) > 0 && <div className="quote-v3-results"><span>{filtered.length} cotações</span><button className="button button-quiet" type="button" onClick={() => setFilters({ query: "", responsible: [], priority: [], status: [], deadline: [] })}>Limpar filtros</button></div>}
      {view === "kanban" ? <QuoteKanban quotes={filtered} tasksByQuote={tasksByQuote} currentEmployee={currentEmployee} teams={state.teams} onOpen={openQuote} onAction={runCardAction} onMove={requestMove} /> : filtered.length ? <div className="quote-v3-list" role="table" aria-label="Cotações"><div className="quote-v3-list-head" role="row"><span>Cotação</span><span>Cliente</span><span>Status</span><span>Responsável</span><span>Prazo</span><span>Prioridade</span></div>{filtered.map((quote) => { const task = tasksByQuote.get(quote.id); return <button className="quote-v3-list-row" role="row" key={quote.id} type="button" onClick={() => openQuote(quote.id)}><span className="quote-main"><b>{quote.code || "Sem número"}</b><small>{quote.title || "Sem título"}</small><small className="quote-option-count">{quoteOptionsLabel(quote)}</small></span><strong>{quote.client || "Não informado"}</strong><QuoteStatus status={quote.status} /><span><UserRound size={13} />{(task as any)?.assigneeNames?.join(", ") || "Financeiro"}</span><span className="quote-deadline"><CalendarDays size={13} />{formatDate(quote.deadline)}</span><span>{QUOTE_PRIORITIES.find((item) => item.id === quote.priority)?.label || "Média"}</span></button>; })}</div> : <div className="quotes-empty"><FileText size={26} /><strong>Nenhuma cotação encontrada</strong><span>Ajuste os filtros para ampliar o resultado.</span></div>}
    </section></>}
    {section === "history" && <QuoteHistory quotes={allQuotes} onOpen={openQuote} />}
    {creating && <QuoteCreateDrawer employees={state.employees || []} onClose={() => setCreating(false)} onCreate={onCreateQuote} AttachmentSectionComponent={AttachmentSectionComponent} />}
    {selectedQuote && <QuoteManagementDrawer quote={selectedQuote} initialAction={requestedQuoteAction} onActionConsumed={onQuoteActionConsumed} task={selectedTask} employees={state.employees || []} teams={state.teams || []} currentEmployee={currentEmployee} WaitingContextFieldsComponent={WaitingContextFieldsComponent} ReturnsSectionComponent={ReturnsSectionComponent} onClose={closeQuote} onOpenTask={(id: any) => { closeQuote(); onOpenTask?.(id); }} onEnsureTaskDetails={onEnsureTaskDetails} onUpdate={onUpdateQuote} onRequestWaiting={() => onRequestWaitingQuote?.(selectedQuote.id)} onRegisterWaitingReturn={onRegisterWaitingReturn} onMarkSent={onMarkQuoteSent} onOutcome={onSetQuoteOutcome} onDeleteQuote={onDeleteQuote} onAttachment={onAttachment} onDeleteAttachment={onDeleteAttachment} loadAttachmentContent={loadAttachmentContent} AttachmentSectionComponent={AttachmentSectionComponent} />}
    {pendingMove && <MoveDialog move={pendingMove} task={tasksByQuote.get(pendingMove.quote.id)} saving={moving} onCancel={() => setPendingMove(null)} onConfirm={confirmMove} onAttachment={onAttachment} onDeleteAttachment={onDeleteAttachment} loadAttachmentContent={loadAttachmentContent} AttachmentSectionComponent={AttachmentSectionComponent} />}
    {pendingResponse && <QuoteSendDialog quote={pendingResponse} onCancel={() => setPendingResponse(null)} onConfirm={confirmResponse} onReview={() => { setPendingResponse(null); openQuote(pendingResponse.id); }} />}
  </div>;
}
