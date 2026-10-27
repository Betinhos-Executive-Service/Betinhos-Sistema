import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { QuoteInput } from './types'
import { acceptedHistoryOption, filterQuoteHistory, quoteResultLabel } from "./quoteHistory";
import * as history from "./quoteHistory";

const quotes = [
  { id: "open", status: "Respondida ao cliente" },
  { id: "old", status: "Perdida", client: "Árvore", lossReason: "Preço" },
  { id: "accepted", status: "Aceita pelo cliente", code: "COT-2", finalizationAt: "2026-09-28T01:00:00Z", acceptedProposalVersionId: "v1", acceptedOptionId: "a", options: [{ id: "a", value: "999" }], proposalVersions: [{ id: "v1", options: [{ id: "a", name: "Executivo", value: "100", commercialTerms: "À vista" }] }] },
  { id: "cancelled", status: "Cancelada", finalizationAt: "2026-09-28T12:00:00Z" },
];
test("histórico contém apenas encerradas, mais recentes primeiro e sem data ao final", () => {
  assert.deepEqual(filterQuoteHistory(quotes).map((quote) => quote.id), ["cancelled", "accepted", "old"]);
  assert.equal(quoteResultLabel("Perdida"), "Negada");
});
test("busca sem acento, resultado e período inclusivo em São Paulo", () => {
  assert.equal(filterQuoteHistory(quotes, { query: "arvore" })[0].id, "old");
  assert.deepEqual(filterQuoteHistory(quotes, { from: "2026-09-27", to: "2026-09-27" }).map((quote) => quote.id), ["accepted"]);
  assert.equal(filterQuoteHistory(quotes, { status: "Cancelada", query: "COT-2" }).length, 0);
});
test("opção aceita usa versão enviada, sem inferir opção ausente", () => {
  assert.equal(acceptedHistoryOption(quotes[2]!)!.value, "100");
  assert.equal(acceptedHistoryOption({ ...quotes[2], acceptedProposalVersionId: "missing" }), null);
  assert.equal(acceptedHistoryOption(quotes[1]), null);
});

test("presets contam dias de calendário inclusivos em viradas de mês e ano", () => {
  assert.deepEqual(history.resolveQuoteHistoryPeriod("last30", "2026-09-29"), { from: "2026-08-31", to: "2026-09-29" });
  assert.deepEqual(history.resolveQuoteHistoryPeriod("last30", "2024-03-01"), { from: "2024-02-01", to: "2024-03-01" });
  assert.deepEqual(history.resolveQuoteHistoryPeriod("last30", "2026-01-01"), { from: "2025-12-03", to: "2026-01-01" });
  assert.deepEqual(history.resolveQuoteHistoryPeriod("last90", "2026-03-31"), { from: "2026-01-01", to: "2026-03-31" });
  assert.deepEqual(history.resolveQuoteHistoryPeriod("thisMonth", "2026-09-29"), { from: "2026-09-01", to: "2026-09-29" });
  assert.deepEqual(history.resolveQuoteHistoryPeriod("all", "2026-09-29"), { from: "", to: "" });
  assert.deepEqual(history.resolveQuoteHistoryPeriod("custom", "2026-09-29", { from: "2026-01-01" }), { from: "2026-01-01", to: "" });
});

test("contadores usam busca e período antes do resultado", () => {
  const selected = history.selectQuoteHistory(quotes, { status: "Perdida" });
  assert.deepEqual(selected.counts, { all: 3, accepted: 1, rejected: 1, cancelled: 1 });
  assert.deepEqual(selected.items.map((quote) => quote.id), ["old"]);
  assert.equal(selected.total, 1);
  assert.deepEqual(history.selectQuoteHistory(quotes, { query: "arvore" }).counts, { all: 1, accepted: 0, rejected: 1, cancelled: 0 });
  const period = history.selectQuoteHistory(quotes, { from: "2026-09-27", to: "2026-09-27" });
  assert.equal(period.counts.all, 1);
  assert.equal(period.items[0].id, "accepted");
});

test("paginação de 21 registros limita página e não altera entrada", () => {
  const rows = Array.from({ length: 21 }, (_, i) => Object.freeze({ id: `q-${i}`, code: String(i).padStart(2, "0"), status: "Cancelada", finalizationAt: "2026-09-29T12:00:00Z" }));
  Object.freeze(rows);
  const first = history.selectQuoteHistory(rows);
  assert.equal(first.items.length, 20);
  assert.deepEqual([first.page, first.pageCount, first.start, first.end, first.total], [1, 2, 1, 20, 21]);
  const last = history.selectQuoteHistory(rows, { page: 2 });
  assert.deepEqual([last.items.length, last.start, last.end], [1, 21, 21]);
  assert.equal(history.selectQuoteHistory(rows.slice(0, 3), { page: 2 }).page, 1);
  const empty = history.selectQuoteHistory([], { page: 3 });
  assert.deepEqual([empty.page, empty.pageCount, empty.start, empty.end], [1, 1, 0, 0]);
});

test("datas ausentes e inválidas ficam ao final em ambas as direções e empates são estáveis", () => {
  const rows = [...quotes, { id: "invalid", status: "Cancelada", finalizationAt: "invalid" }, { ...quotes[2], id: "tie", code: "COT-1" }];
  assert.deepEqual(history.selectQuoteHistory(rows).items.map((quote) => quote.id), ["cancelled", "tie", "accepted", "invalid", "old"]);
  assert.deepEqual(history.selectQuoteHistory(rows, { direction: "asc" }).items.map((quote) => quote.id), ["tie", "accepted", "cancelled", "invalid", "old"]);
  assert.equal(history.selectQuoteHistory(rows, { from: "2026-09-01" }).total, 3);
});

test("resumo usa valor e condição congelados na versão aceita", () => {
  const quote = { ...quotes[2], commercialTerms: "Atual", proposalVersions: [{ id: "v1", number: 2, commercialTerms: "Da versão", options: [{ id: "a", name: "Executivo", value: 0, commercialTerms: " " }] }] };
  const summary = history.acceptedHistorySummary(quote);
  assert.equal(summary.value, 0);
  assert.equal(summary.commercialTerms, "Da versão");
  assert.equal(summary.version!.number, 2);
  assert.equal(summary.legacy, false);
  assert.equal(history.acceptedHistorySummary(quotes[2]).value, "100");
  assert.equal(history.acceptedHistorySummary(quotes[2]).commercialTerms, "À vista");
  const missing = history.acceptedHistorySummary({ ...quote, acceptedProposalVersionId: "missing" });
  assert.equal(missing.option, null);
  assert.equal(missing.value, undefined);
  assert.equal(missing.commercialTerms, "");
});

test("legado tem opção explícita sem inventar versão; negativas mantêm valor registrado", () => {
  const legacy = history.acceptedHistorySummary({ status: "Aceita pelo cliente", acceptedOptionId: "old", options: [{ id: "old", value: 0, commercialTerms: "Legado" }] });
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.version, null);
  assert.equal(legacy.value, 0);
  assert.equal(legacy.commercialTerms, "Legado");
  const denied = history.acceptedHistorySummary({ status: "Perdida", value: "2800", options: [{ value: "1000" }] } as QuoteInput);
  assert.equal(denied.option, null);
  assert.equal(denied.value, "2800");
});
