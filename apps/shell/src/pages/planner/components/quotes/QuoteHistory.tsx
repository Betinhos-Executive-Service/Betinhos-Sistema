// Porte de Tela Planner/src/quotes/QuoteHistory.jsx (sem mudança de comportamento).
import React, { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Ban, ArrowDown, ArrowUp } from "lucide-react";
import { formatMoney } from '../../domain/quoteDomain';
import { DateInput } from '../DateInput';
import SearchableSelect from '../SearchableSelect';
import { acceptedHistorySummary, quoteHistoryDate, quoteResultLabel, resolveQuoteHistoryPeriod, selectQuoteHistory } from '../../domain/quoteHistory';

const periods = [{ value: "all", label: "Todo o histórico" }, { value: "last30", label: "Últimos 30 dias" }, { value: "last90", label: "Últimos 90 dias" }, { value: "thisMonth", label: "Este mês" }, { value: "custom", label: "Personalizado" }];
const outcomes = [["", "Todas", "all"], ["Aceita pelo cliente", "Aceitas", "accepted"], ["Perdida", "Negadas", "rejected"], ["Cancelada", "Canceladas", "cancelled"]];
const money = (value: any) => value !== null && value !== undefined && String(value).trim() ? formatMoney(value) : "Não informado";
const dateLabel = (value: any) => quoteHistoryDate(value) ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informado";
function Result({ status }: any) {
  const Icon = status === "Aceita pelo cliente" ? CheckCircle2 : status === "Perdida" ? XCircle : Ban;
  return <span className={`quote-history-result ${status === "Aceita pelo cliente" ? "accepted" : status === "Perdida" ? "rejected" : "cancelled"}`}><Icon size={13} aria-hidden="true" />{quoteResultLabel(status)}</span>;
}

export default function QuoteHistory({ quotes, onOpen }: any) {
  const [query, setQuery] = useState<any>("");
  const [status, setStatus] = useState<any>("");
  const [preset, setPreset] = useState<any>("all");
  const [periodChoice, setPeriodChoice] = useState<any>("all");
  const [customRange, setCustomRange] = useState<any>({ from: "", to: "" });
  const [draftRange, setDraftRange] = useState<any>({ from: "", to: "" });
  const [direction, setDirection] = useState<any>("desc");
  const [page, setPage] = useState<any>(1);
  const [expandedQuoteId, setExpandedQuoteId] = useState<any>("");
  const [filtersExpanded, setFiltersExpanded] = useState<any>(false);
  const [periodError, setPeriodError] = useState<any>("");
  const [pointerExpansion, setPointerExpansion] = useState<any>(false);
  const todayKey = quoteHistoryDate(new Date().toISOString());
  const range = resolveQuoteHistoryPeriod(preset, todayKey, customRange);
  const selection = useMemo(() => selectQuoteHistory(quotes, { query, status, ...range, direction, page }), [quotes, query, status, range.from, range.to, direction, page]);
  useEffect(() => {
    if (page !== selection.page) setPage(selection.page);
    if (expandedQuoteId && !selection.items.some((quote) => quote.id === expandedQuoteId)) setExpandedQuoteId("");
  }, [selection, page, expandedQuoteId]);
  const resetRows = () => { setPage(1); setExpandedQuoteId(""); };
  const clear = () => { setQuery(""); setStatus(""); setPreset("all"); setPeriodChoice("all"); setCustomRange({ from: "", to: "" }); setDraftRange({ from: "", to: "" }); setDirection("desc"); setPeriodError(""); resetRows(); };
  const changePeriod = (value: any) => {
    setPeriodChoice(value); setPeriodError("");
    if (value === "custom") { setFiltersExpanded(true); return; }
    setPreset(value); resetRows();
  };
  const applyPeriod = () => {
    if (!draftRange.from && !draftRange.to) { setPeriodError("Informe pelo menos uma data."); return; }
    if (draftRange.from && draftRange.to && draftRange.from > draftRange.to) { setPeriodError("A data inicial deve ser anterior ou igual à final."); return; }
    setCustomRange({ ...draftRange }); setPreset("custom"); setPeriodChoice("custom"); setPeriodError(""); resetRows();
  };
  const expand = (id: any, event: any) => { setPointerExpansion(event.detail > 0); setExpandedQuoteId((current: any) => current === id ? "" : id); };
  const filtered = Boolean(query || status || preset !== "all");
  return <section className="panel quote-history-panel" aria-label="Histórico de cotações">
    <div className="quote-history-toolbar">
      <label className="quote-history-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Buscar no histórico" value={query} onChange={(event) => { setQuery(event.target.value); resetRows(); }} placeholder="Buscar por número, cliente ou serviço" /></label>
      <div className="quote-history-period"><SearchableSelect value={periodChoice} onChange={changePeriod} options={periods} aria-label="Período de encerramento" /></div>
      <button type="button" className="button button-secondary quote-history-filter-toggle" aria-expanded={filtersExpanded} aria-controls="quote-history-filters" onClick={() => setFiltersExpanded((value: any) => !value)}><SlidersHorizontal size={15} aria-hidden="true" />Filtros<ChevronDown size={14} aria-hidden="true" /></button>
    </div>
    {filtersExpanded && <div id="quote-history-filters" className="quote-history-filters">
      <label>Encerradas de<DateInput aria-label="Encerradas de" value={draftRange.from} onChange={(event: any) => setDraftRange((current: any) => ({ ...current, from: event.target.value }))} /></label>
      <label>Até<DateInput aria-label="Encerradas até" value={draftRange.to} onChange={(event: any) => setDraftRange((current: any) => ({ ...current, to: event.target.value }))} /></label>
      <button type="button" className="button button-secondary" onClick={applyPeriod}>Aplicar período</button>
      {periodError && <p className="quote-history-error" role="alert">{periodError}</p>}
    </div>}
    <div className="quote-history-results-bar"><div className="quote-history-chips" aria-label="Resultados">{outcomes.map(([value, label, key]: any) => <button type="button" key={key} aria-pressed={status === value} onClick={() => { setStatus(value); resetRows(); }}>{label}<b>{(selection.counts as any)[key]}</b></button>)}</div>{filtered && <button className="button button-quiet" type="button" onClick={clear}>Limpar filtros</button>}</div>
    <div className="quote-history-scroll" tabIndex={0} role="region" aria-label="Tabela de cotações encerradas"><table className="quote-history-table"><thead><tr>
      <th scope="col">Cotação e serviço</th><th scope="col">Cliente</th><th scope="col">Resultado</th><th scope="col" aria-sort={direction === "desc" ? "descending" : "ascending"}><button className="quote-history-sort" type="button" aria-label={`Encerrada em: ${direction === "desc" ? "mais recentes primeiro; ordenar antigas primeiro" : "mais antigas primeiro; ordenar recentes primeiro"}`} onClick={() => { setDirection((current: any) => current === "desc" ? "asc" : "desc"); resetRows(); }}>Encerrada em{direction === "desc" ? <ArrowDown size={13} /> : <ArrowUp size={13} />}</button></th><th scope="col">Opção escolhida</th><th className="quote-history-money" scope="col">Valor</th><th scope="col"><span className="sr-only">Detalhes</span></th>
    </tr></thead><tbody>{selection.items.map((quote) => {
      const summary = acceptedHistorySummary(quote), expanded = expandedQuoteId === quote.id;
      const detailId = `quote-history-detail-${quote.id}`;
      return <React.Fragment key={quote.id}><tr className={expanded ? "quote-history-row is-expanded" : "quote-history-row"}>
        <td><button type="button" className="quote-history-open" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={(event) => expand(quote.id, event)}><small>{quote.code || "Não informado"}</small><strong>{quote.title || quote.route || "Não informado"}</strong></button></td>
        <td>{quote.client || "Não informado"}</td><td><Result status={quote.status} />{quote.status === "Perdida" && <small className="quote-history-reason">{quote.lossReason || "Não informado"}</small>}</td><td>{dateLabel(quote.finalizationAt)}</td><td>{summary.option?.name || "Não informado"}</td><td className="quote-history-money"><strong>{money(summary.value)}</strong></td><td><button type="button" className="icon-button quote-history-expand" aria-label={`${expanded ? "Recolher" : "Expandir"} ${quote.code || "cotação"}`} aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={(event) => expand(quote.id, event)}><ChevronDown size={16} aria-hidden="true" /></button></td>
      </tr>{expanded && <tr className="quote-history-detail-row"><td colSpan={7}><div id={detailId} className="quote-history-detail" data-motion={pointerExpansion ? "pointer" : "keyboard"}>
        <dl className="quote-history-detail-summary">{quote.status === "Aceita pelo cliente" ? <><div><dt>Proposta enviada</dt><dd>{summary.version ? (summary.version.number ? `Versão ${summary.version.number}` : "Versão não registrada") : summary.legacy ? "Versão não registrada" : "Não informado"}</dd></div><div><dt>Opção escolhida</dt><dd>{summary.option?.name || "Não informado"}</dd></div><div><dt>Condições de pagamento</dt><dd>{summary.commercialTerms || "Não informado"}</dd></div></> : <><div><dt>Resultado</dt><dd>{quoteResultLabel(quote.status)}</dd></div><div><dt>{quote.status === "Perdida" ? "Motivo da negativa" : "Encerrada em"}</dt><dd>{quote.status === "Perdida" ? quote.lossReason || "Não informado" : dateLabel(quote.finalizationAt)}</dd></div></>}<div><dt>{quote.status === "Aceita pelo cliente" ? "Valor aceito" : "Valor registrado"}</dt><dd>{money(summary.value)}</dd></div></dl>
        <div className="quote-history-detail-actions"><button type="button" className="button button-secondary" onClick={() => onOpen?.(quote.id)}>Abrir cotação</button>{quote.proposalVersions?.length ? <button type="button" className="button button-primary" onClick={() => onOpen?.(quote.id)}>Ver proposta</button> : <span>Proposta enviada não registrada</span>}</div>
      </div></td></tr>}</React.Fragment>;
    })}</tbody></table>{!selection.total && <div className="quotes-empty"><strong>Nenhuma cotação encerrada encontrada</strong><span>{filtered ? "Ajuste a busca ou os filtros." : "As cotações aceitas, negadas e canceladas aparecerão aqui."}</span></div>}</div>
    <footer className="quote-history-footer"><span role="status">Mostrando {selection.start}–{selection.end} de {selection.total} cotações</span><div><button type="button" className="icon-button" aria-label="Página anterior" disabled={selection.page === 1 || !selection.total} onClick={() => { setPage(selection.page - 1); setExpandedQuoteId(""); }}><ChevronLeft size={16} /></button><span>Página {selection.page} de {selection.pageCount}</span><button type="button" className="icon-button" aria-label="Próxima página" disabled={selection.page === selection.pageCount || !selection.total} onClick={() => { setPage(selection.page + 1); setExpandedQuoteId(""); }}><ChevronRight size={16} /></button></div></footer>
  </section>;
}
