// Porte de Tela Planner/src/quotes/QuoteKanban.jsx (sem mudança de comportamento).
import React, { memo, useCallback, useMemo } from "react";
import { BadgeDollarSign, CalendarDays, CircleHelp, ClipboardList, Clock3, FileText, GripVertical, ScanSearch, Send } from "lucide-react";
import { formatMoney, getQuoteNextAction, QUOTE_OPEN_STATUSES, QUOTE_PRIORITIES, sentLabel } from '../../domain/quoteDomain';
import { canRegisterWaitingReturn, formatDate, waitingContextSummary } from '../../domain/domain';
import { localDateKey } from '../../domain/management';
import { normalizeQuoteOptions } from '../../domain/quoteScenarios';
import KanbanBoard from '../KanbanBoard';

const STATUS_META = {
  "Nova": { tone: "neutral", Icon: ClipboardList },
  "Em análise pelo financeiro": { tone: "action", Icon: ScanSearch },
  "Aguardando informação": { tone: "warning", Icon: CircleHelp },
  "Cotada": { tone: "purple", Icon: BadgeDollarSign },
  "Respondida ao cliente": { tone: "success", Icon: Send },
};

const PRIORITY_TONES = { low: "neutral", medium: "action", high: "warning", urgent: "danger" };

const QuoteCard = memo(function QuoteCard({ quote, task, today, currentEmployee, teams = [], isDragging, draggable, onOpen, onAction, onDragStart, onDragEnd }: any) {
  const priority = QUOTE_PRIORITIES.find((item) => item.id === quote.priority) || QUOTE_PRIORITIES[1];
  const sent = quote.status === "Respondida ao cliente";
  // Depois do envio o prazo interno já foi cumprido: o card passa a contar os dias sem retorno.
  const overdue = !sent && Boolean(quote.deadline && quote.deadline < today);
  const waitingSummary = quote.status === "Aguardando informação" ? waitingContextSummary(task?.waitingContext) : "";
  const optionCount = normalizeQuoteOptions(quote).length;
  const action = getQuoteNextAction(quote).primary;
  const showAction = action.id === "return" ? canRegisterWaitingReturn(task, currentEmployee, teams) : Boolean(onAction);
  return <article
    className={`task-card quote-kanban-card${overdue ? " task-overdue" : ""}${isDragging ? " task-card-dragging" : ""}`}
    draggable={draggable}
    tabIndex={0}
    data-kanban-id={quote.id}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/quote-id", quote.id); onDragStart(event); }}
    onDragEnd={onDragEnd}
    onClick={() => onOpen?.(quote.id)}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen?.(quote.id); } }}
  >
    <div className="task-card-top"><span className={`priority priority-${(PRIORITY_TONES as any)[priority.id] || "neutral"}`} aria-label={`Prioridade: ${priority.label}`}>{priority.label}</span>{overdue && <span className="overdue-label">Vencida</span>}{sent ? <span className="date-chip quote-sent-chip" title="Dias desde o envio da proposta"><Send size={13} aria-hidden="true" />{sentLabel(quote, today)}</span> : <span className={overdue ? "date-chip overdue" : "date-chip"} title={`Prazo: ${formatDate(quote.deadline)}`}><CalendarDays size={13} aria-hidden="true" />{formatDate(quote.deadline)}</span>}</div>
    <div className="task-card-title-row"><h3>{quote.title || "Cotação sem título"}</h3></div>
    <div className="task-link"><GripVertical size={13} aria-hidden="true" /><FileText size={13} aria-hidden="true" /><em>{quote.code || "Sem número"}{quote.client ? ` · ${quote.client}` : ""}</em></div>
    {optionCount > 0 && <div className="quote-option-count"><span className="quote-option-badge">{`${optionCount} ${optionCount === 1 ? "opção" : "opções"}`}</span>{quote.status === "Cotada" && <span className="quote-option-state">Pronta para enviar</span>}</div>}
    {quote.value !== null && quote.value !== undefined && String(quote.value).trim() && <div className="quote-kanban-value" aria-label={`Valor da cotação: ${formatMoney(quote.value)}`}><span className="quote-kanban-value-icon" aria-hidden="true"><BadgeDollarSign size={14} /></span><span className="quote-kanban-value-content"><small>Valor</small><strong>{formatMoney(quote.value)}</strong></span></div>}
    {waitingSummary && <div className="task-waiting-summary" title={waitingSummary}><Clock3 size={13} /><span>{waitingSummary}</span></div>}
    {quote.passengerProfile && <p className="task-description">{quote.passengerProfile}</p>}
    {showAction && <div className="task-card-footer quote-kanban-card-footer"><button className="task-quick-action task-return-action" type="button" onClick={(event) => { event.stopPropagation(); onAction?.(quote, action); }} onKeyDown={(event) => event.stopPropagation()}>{action.label}</button></div>}
  </article>;
});

const COLUMNS = QUOTE_OPEN_STATUSES.map((status) => ({ id: status, label: status, tone: (STATUS_META as any)[status]?.tone || "neutral" }));

export default function QuoteKanban({ quotes, tasksByQuote, currentEmployee, teams = [], onOpen, onAction, onMove }: any) {
  const today = localDateKey();
  const quotesByColumn = useMemo(() => Object.fromEntries(QUOTE_OPEN_STATUSES.map((status) => [status, quotes.filter((quote: any) => quote.status === status)])), [quotes]);
  const getSourceColumnId = useCallback((quote: any) => quote?.status || "", []);
  const getDropIndex = useCallback((grouped: any, columnId: any, draggedQuote: any) => {
    if (!draggedQuote) return 0;
    return [...(grouped[columnId] || []), draggedQuote].sort((left, right) => String(left.deadline || "9999-12-31").localeCompare(String(right.deadline || "9999-12-31"))).findIndex((quote) => quote.id === draggedQuote.id);
  }, []);
  const handleMove = useCallback((quote: any, status: any) => {
    if (!status || status === quote.status) return false;
    return onMove?.(quote, status);
  }, [onMove]);
  const handleBoardMove = useCallback((quoteId: any, column: any) => {
    const quote = quotes.find((item: any) => item.id === quoteId);
    return quote ? handleMove(quote, column.id) : false;
  }, [handleMove, quotes]);
  return <div className="quote-v3-kanban-shell" aria-label="Kanban de cotações"><KanbanBoard
    items={quotes}
    columns={COLUMNS}
    itemsByColumn={quotesByColumn}
    getSourceColumnId={getSourceColumnId}
    getDropIndex={getDropIndex}
    onMove={handleBoardMove}
    itemLabel="cotação"
    itemLabelPlural="cotações"
    transferType="text/quote-id"
    renderColumnIcon={(column: any) => { const Icon = (STATUS_META as any)[column.id]?.Icon || ClipboardList; return <Icon className={`status-column-icon status-column-icon-${column.tone}`} size={17} strokeWidth={2.2} aria-hidden="true" />; }}
    renderCard={(quote: any, dragProps: any) => <QuoteCard key={quote.id} quote={quote} task={tasksByQuote.get(quote.id)} today={today} currentEmployee={currentEmployee} teams={teams} onOpen={onOpen} onAction={onAction} {...dragProps} draggable={QUOTE_OPEN_STATUSES.includes(quote.status)} />}
  /></div>;
}
