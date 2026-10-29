import { isLegacyPaidService, paymentTotals, toCents, fromCents } from './payment.js';

export const CONSOLIDATED_FIELD = 'cr40f_consolidado';
export const isConsolidated = (lot) => lot?.mode === 'consolidated';
export const activeConsolidated = (lots) => lots.filter((lot) => isConsolidated(lot) && lot.lotStatus !== 'cancelled');
export const overlaps = (a, b) => a.from <= b.to && a.to >= b.from;
export const contains = (range, lot) => range.from <= lot.from && range.to >= lot.to;
export const consolidatedRequestSignature = (input) => JSON.stringify([
  input.favorecido?.id, input.from, input.to, String(input.description || '').trim(),
  toCents(input.repasse), Boolean(input.includesHistory), Boolean(input.revenueConfirmed),
  input.revenueConfirmed ? toCents(input.revenue) : null, Boolean(input.legacyConfirmed),
  (input.services || []).map((row) => row.id).sort(),
]);

export function consolidatedReason(service, favorecidoId, lotId = '') {
  if (service.favorecidoId !== favorecidoId) return 'Outro fornecedor';
  if (service.pagamentoId && service.pagamentoId !== lotId) return 'Já vinculado a outro lote';
  if (service.paymentStatus === 'paid' || service.itemStatus === 'paid') return 'Serviço já pago';
  return '';
}

export function validateConsolidated(input, services) {
  if (!input.favorecido?.id) throw new Error('Selecione o fornecedor.');
  const dateValid = (value) => { const date = new Date(`${value}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
  if (!dateValid(input.from) || !dateValid(input.to) || input.from > input.to) throw new Error('Informe um período válido.');
  if (!String(input.description || '').trim()) throw new Error('Descreva a cobrança.');
  if (!Number.isFinite(input.repasse) || toCents(input.repasse) <= 0) throw new Error('Informe um total a pagar maior que zero.');
  if (input.revenueConfirmed && (!Number.isFinite(input.revenue) || input.revenue < 0)) throw new Error('Informe a receita total, incluindo zero quando confirmado.');
  if (!services.length && !input.includesHistory) throw new Error('Selecione serviços ou indique histórico fora do sistema.');
  if (new Set(services.map((row) => row.id)).size !== services.length) throw new Error('Serviços repetidos na seleção.');
  for (const service of services) {
    const reason = consolidatedReason(service, input.favorecido.id, input.lotId);
    if (reason) throw new Error(`${service.identificador || service.id}: ${reason}.`);
    const date = service.dataServico?.slice(0, 10);
    if (!date || date < input.from || date > input.to) throw new Error('Serviço fora do período informado.');
    if (isLegacyPaidService(service) && !input.legacyConfirmed) throw new Error('Confirme que os serviços históricos continuam pendentes.');
  }
}

export function consolidatedSnapshot(input, services) {
  validateConsolidated(input, services);
  const repasse = fromCents(toCents(input.repasse));
  const revenue = input.revenueConfirmed ? fromCents(toCents(input.revenue)) : null;
  return {
    mode: 'consolidated', from: input.from, to: input.to,
    description: input.description.trim(), includesHistory: Boolean(input.includesHistory),
    revenueConfirmed: Boolean(input.revenueConfirmed), legacyConfirmed: Boolean(input.legacyConfirmed),
    requestId: input.requestId, requestSignature: consolidatedRequestSignature({ ...input, services }), serviceIds: services.map((row) => row.id),
    repasse, revenue, margin: revenue === null ? null : fromCents(toCents(revenue) - toCents(repasse)),
    marginPercent: revenue ? ((revenue - repasse) / revenue) * 100 : null,
    count: services.length, year: Number(input.from.slice(0, 4)),
  };
}

// A unidade financeira é o período inteiro. Nunca rateia valores por serviço/mês.
export function consolidatedTotals(services, lots, range, filters = {}) {
  const blocks = activeConsolidated(lots);
  const covered = new Set(blocks.flatMap((lot) => lot.serviceIds || lot.items?.map((item) => item.serviceId || item.compositionId) || []));
  const ordinary = services.filter((row) => !covered.has(row.id) && !blocks.some((lot) => row.pagamentoId === lot.id));
  const scoped = blocks.filter((lot) => (!filters.favorecidoIds?.length || filters.favorecidoIds.includes(lot.favorecidoId)) && overlaps(range, lot));
  const dimensionFiltered = Boolean(filters.driverIds?.length || filters.vehicleTypes?.length);
  const included = dimensionFiltered ? [] : scoped.filter((lot) => contains(range, lot));
  const partial = dimensionFiltered ? scoped : scoped.filter((lot) => !contains(range, lot));
  const pending = included.filter((lot) => !lot.revenueConfirmed);
  const complete = included.filter((lot) => lot.revenueConfirmed);
  const totals = paymentTotals(ordinary);
  for (const lot of complete) {
    totals.revenue += lot.revenue;
    totals.margin += lot.revenue - lot.repasse;
  }
  totals.repasse += included.reduce((sum, lot) => sum + lot.repasse, 0);
  totals.marginPercent = totals.revenue ? (totals.margin / totals.revenue) * 100 : 0;
  for (const field of ['revenue', 'repasse', 'margin']) totals[field] = fromCents(toCents(totals[field]));
  return { ...totals, ordinary, included, partial, pending, pendingCost: fromCents(pending.reduce((sum, lot) => sum + toCents(lot.repasse), 0)), dimensionFiltered };
}
