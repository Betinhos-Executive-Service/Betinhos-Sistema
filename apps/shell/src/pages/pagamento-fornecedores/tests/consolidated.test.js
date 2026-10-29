import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { consolidatedSnapshot, consolidatedTotals, consolidatedReason } from '../domain/consolidated.js';
import { buildConsolidatedXlsx } from '../lib/excel.js';

const fornecedor = { id: 'f1', nome: 'Fornecedor teste', email: 'teste@example.com' };
const service = { id: 's1', favorecidoId: 'f1', motoristaId: 'm1', dataServico: '2026-06-15', identificador: 'S1', valorCobrado: 1000, valorRepasse: 200, status: 'concluido', etag: 1 };
const input = (extra = {}) => ({ mode: 'consolidated', favorecido: fornecedor, from: '2026-01-01', to: '2026-07-31', description: 'Cobrança histórica', repasse: 600, includesHistory: true, revenueConfirmed: false, legacyConfirmed: false, requestId: crypto.randomUUID(), services: [], ...extra });
const block = (extra = {}) => ({ id: 'c1', favorecidoId: 'f1', lotStatus: 'draft', ...consolidatedSnapshot(input(extra), extra.services || []), ...extra });
const fullRange = { from: '2026-01-01', to: '2026-07-31' };

test('histórico sem serviços permite receita pendente e zero confirmado', () => {
  const pending = consolidatedSnapshot(input(), []);
  assert.equal(pending.revenue, null); assert.equal(pending.margin, null); assert.equal(pending.count, 0);
  const zero = consolidatedSnapshot(input({ revenueConfirmed: true, revenue: 0 }), []);
  assert.equal(zero.revenue, 0); assert.equal(zero.margin, -600);
  assert.throws(() => consolidatedSnapshot(input({ includesHistory: false }), []), /Selecione serviços/);
  assert.throws(() => consolidatedSnapshot(input({ repasse: NaN }), []), /total a pagar/);
  assert.throws(() => consolidatedSnapshot(input({ from: '2026-02-30' }), []), /período válido/);
});

test('seleção aceita repasse zero, bloqueia pagos, exige confirmação histórica', () => {
  assert.equal(consolidatedReason({ ...service, valorRepasse: 0 }, 'f1'), '');
  assert.throws(() => consolidatedSnapshot(input(), [{ ...service, pagamentoId: 'outro' }]), /outro lote/);
  assert.throws(() => consolidatedSnapshot(input(), [{ ...service, itemStatus: 'paid' }]), /já pago/);
  const old = { ...service, dataServico: '2026-03-15' };
  assert.throws(() => consolidatedSnapshot(input(), [old]), /históricos/);
  assert.equal(consolidatedSnapshot(input({ legacyConfirmed: true }), [old]).count, 1);
});

test('custo e receita consolidados substituem serviços sem dupla contagem', () => {
  const linked = block({ services: [service], revenueConfirmed: true, revenue: 1400 });
  const ordinary = { ...service, id: 's2', valorCobrado: 500, valorRepasse: 100 };
  const totals = consolidatedTotals([service, ordinary], [linked], fullRange);
  assert.equal(totals.repasse, 700); assert.equal(totals.revenue, 1900); assert.equal(totals.margin, 1200);
  const pending = consolidatedTotals([service, ordinary], [block({ services: [service] })], fullRange);
  assert.equal(pending.revenue, 500); assert.equal(pending.repasse, 700); assert.equal(pending.margin, 400); assert.equal(pending.pendingCost, 600);
});

test('filtros parciais e dimensões não recebem rateio; cancelamento restaura originais', () => {
  const lot = block({ services: [service], revenueConfirmed: true, revenue: 1400 });
  const partial = consolidatedTotals([service], [lot], { from: '2026-06-01', to: '2026-06-30' });
  assert.equal(partial.margin, 0); assert.equal(partial.partial.length, 1);
  const dimensions = consolidatedTotals([service], [lot], fullRange, { driverIds: ['m1'] });
  assert.equal(dimensions.margin, 0); assert.equal(dimensions.dimensionFiltered, true);
  assert.equal(consolidatedTotals([service], [lot], fullRange, { favorecidoIds: ['outro'] }).included.length, 0);
  const cancelled = consolidatedTotals([service], [{ ...lot, lotStatus: 'cancelled' }], fullRange);
  assert.equal(cancelled.margin, 800); assert.equal(cancelled.repasse, 200);
});

async function mockClient() {
  globalThis.window = { location: { hostname: 'localhost', port: '5192' }, parent: {} };
  const { dataverse } = await (vi.resetModules(), import('../lib/dataverse.js'));
  dataverse.resetMock();
  return dataverse;
}

test('criação idempotente, pagamento, receita posterior e documento com nova versão', async () => {
  const dv = await mockClient();
  const [favorecido] = await dv.listFavorecidos();
  const request = input({ favorecido });
  const created = await dv.saveConsolidated(request);
  const repeated = await dv.saveConsolidated(request);
  assert.equal(created.id, repeated.id); assert.equal((await dv.listLots()).filter((row) => row.id === created.id).length, 1);
  assert.equal(created.paymentStatus, 'open');
  await assert.rejects(() => dv.saveConsolidated({ ...request, repasse: 700 }), /outros valores/);
  await dv.markPaid(created.id);
  await assert.rejects(() => dv.saveConsolidated({ ...request, requestId: crypto.randomUUID() }, created.id), /aberto/);
  const completed = await dv.completeConsolidatedRevenue(created.id, 900);
  assert.equal(completed.paymentStatus, 'paid'); assert.equal(completed.margin, 300);
  assert.equal(completed.version, 2); assert.equal(completed.documentStatus, 'resend_required');
  await assert.rejects(() => dv.completeConsolidatedRevenue(created.id, 950), /complementação/);
  const reverted = await dv.revertPaid(created.id, 'Correção validada');
  assert.equal(reverted.paymentStatus, 'open');
  const edited = await dv.saveConsolidated({ ...request, requestId: crypto.randomUUID(), repasse: 650, revenueConfirmed: true, revenue: 900 }, created.id);
  assert.equal(edited.repasse, 650); assert.equal(edited.margin, 250);
});

test('reserva sem rateio, edição e cancelamento preservam repasses originais', async () => {
  const dv = await mockClient();
  const [favorecido] = await dv.listFavorecidos();
  const selected = (await dv.listFinanceServices()).filter((row) => row.favorecidoId === favorecido.id && !row.pagamentoId && row.dataServico >= '2026-06-01').slice(0, 2);
  assert.equal(selected.length, 2);
  const request = input({ favorecido, from: '2026-06-01', to: '2026-12-31', services: selected });
  const created = await dv.saveConsolidated(request);
  assert.equal(created.items[0].valorRepasse, null);
  const reserved = await dv.listFinanceServices({ compositionIds: selected.map((row) => row.id) });
  assert.equal(reserved[0].valorRepasse, selected[0].valorRepasse);
  assert.equal(reserved[0].pagamentoId, created.id);
  await assert.rejects(() => dv.saveConsolidated({ ...request, requestId: crypto.randomUUID() }), /alterado|outro lote/);
  const edited = await dv.saveConsolidated({ ...request, services: reserved.slice(0, 1), requestId: crypto.randomUUID(), repasse: 450 }, created.id);
  assert.equal(edited.repasse, 450); assert.equal(edited.count, 1);
  await dv.cancelLot(created.id, 'Cobrança corrigida');
  const released = await dv.listFinanceServices({ compositionIds: selected.map((row) => row.id) });
  assert.equal(released.every((row) => !row.pagamentoId), true);
  assert.equal(released[0].valorRepasse, selected[0].valorRepasse);
});

test('falha de reserva não deixa lançamento ou vínculo parcial', async () => {
  const dv = await mockClient(); const [favorecido] = await dv.listFavorecidos();
  const request = input({ favorecido });
  dv.consumeFailure = () => { throw new Error('Falha simulada de reserva'); };
  await assert.rejects(() => dv.saveConsolidated(request), /Falha simulada/);
  assert.equal((await dv.listLots()).some((lot) => lot.id === request.requestId), false);
});

test('changeset verifica erros internos, versão e confirmação de todas as operações', async () => {
  const dv = await mockClient(); dv.apiRoot = 'https://example.invalid/api/data/v9.2';
  dv.entity = async () => ({ entitySet: 'compositions' });
  const previousFetch = globalThis.fetch; let body;
  try {
    globalThis.fetch = async (_url, options) => { body = options.body; return { ok: true, status: 200, text: async () => 'HTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content' }; };
    await dv.atomicChanges([{ table: 't', method: 'PATCH', id: crypto.randomUUID(), etag: 'W/"123"', payload: { lookup: 'id' } }, { table: 't', method: 'POST', payload: { test: 1 } }]);
    assert.match(body, /If-Match: W\/"123"/); assert.match(body, /changeset_/); assert.match(body, /Content-ID: 2/);
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => 'HTTP/1.1 412 Precondition Failed' });
    await assert.rejects(() => dv.atomicChanges([{ table: 't', method: 'PATCH', etag: 'W/"123"' }]), /nenhum vínculo/);
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '' });
    await assert.rejects(() => dv.atomicChanges([{ table: 't', method: 'PATCH', etag: 'W/"123"' }]), /inconclusiva/);
    await assert.rejects(() => dv.atomicChanges([{ table: 't', method: 'PATCH', etag: '*' }]), /Versão do registro/);
  } finally { globalThis.fetch = previousFetch; }
});

test('Excel mantém receita pendente distinta de zero e serviços sem parcelas fictícias', () => {
  const lot = { ...block({ services: [service] }), identifier: 'PC-TESTE', items: [service] };
  const pendingFiles = unzipSync(buildConsolidatedXlsx(lot));
  const pendingXml = strFromU8(pendingFiles['xl/worksheets/sheet1.xml']);
  assert.match(pendingXml, /Lucro pendente de receita/); assert.match(pendingXml, /Repasse no consolidado/);
  assert.match(pendingXml, /Serviços vinculados/);
  const zeroXml = strFromU8(unzipSync(buildConsolidatedXlsx({ ...lot, revenueConfirmed: true, revenue: 0, margin: -600 }))['xl/worksheets/sheet1.xml']);
  assert.match(zeroXml, /<v>0<\/v>/); assert.match(zeroXml, /Confirmada/);
});

test('adaptador remoto monta pagamento, vínculo, item sem rateio e evento em uma transação', async () => {
  const dv = await mockClient();
  dv.mockMode = false; dv.hasConsolidatedSchema = true;
  const selected = { ...service, id: crypto.randomUUID(), compositionId: '', etag: 'W/"42"', reservationId: crypto.randomUUID() };
  selected.compositionId = selected.id;
  let saved = null; let operations;
  dv.entity = async (table) => ({ id: `${table}id`, entitySet: `${table}s` });
  dv.lookupSchema = async (_table, name) => `schema_${name}`;
  dv.listFinanceServices = async () => [selected];
  dv.getLotDetail = async () => { if (!saved) throw new Error('Lote nao encontrado.'); return saved; };
  dv.atomicChanges = async (ops) => {
    operations = ops;
    saved = dv.normalizePayment(ops[0].payload, await dv.entity('cr40f_pagamentoaterceiro'));
    saved.items = [];
  };
  const request = input({ services: [selected] });
  const lot = await dv.saveConsolidated(request);
  assert.equal(lot.revenue, null); assert.equal(lot.margin, null); assert.equal(lot.id, request.requestId);
  assert.equal(operations.length, 4);
  const [payment, composition, item, event] = operations;
  assert.match(payment.payload['schema_cr40f_terceirofavorecido@odata.bind'], /f1/);
  assert.equal(composition.etag, 'W/"42"'); assert.equal(composition.id, selected.id);
  assert.equal('cr40f_valorrepasseterceiro' in composition.payload, false);
  assert.equal(item.payload.cr40f_valorrepasse, null); assert.equal(item.payload.cr40f_valorcobrado, null);
  assert.match(item.payload['schema_cr40f_pagamentoaterceiro@odata.bind'], new RegExp(request.requestId));
  assert.equal(event.table, 'cr40f_eventopagamentoaterceiro');
});

test('versão remota alterada interrompe criação antes de qualquer operação', async () => {
  const dv = await mockClient(); dv.mockMode = false; dv.hasConsolidatedSchema = true;
  dv.getLotDetail = async () => { throw new Error('Lote nao encontrado.'); };
  dv.listFinanceServices = async () => [{ ...service, etag: 'W/"2"' }];
  let writes = 0; dv.atomicChanges = async () => { writes += 1; };
  await assert.rejects(() => dv.saveConsolidated(input({ services: [{ ...service, etag: 'W/"1"' }] })), /alterado/);
  assert.equal(writes, 0);
});
