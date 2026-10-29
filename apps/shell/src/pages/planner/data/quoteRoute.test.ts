// Porte de Tela Planner/tests/quoteRoute.test.mjs (trajeto da cotação no domínio e no mock).
import assert from 'node:assert/strict'
import { afterAll, test, vi } from 'vitest'
import { buildQuoteEmailHtml, buildQuotePlainText, normalizeQuoteRoute, quoteRoutePoints, validateQuoteRoute, validateQuoteStep } from '../domain/quoteDomain'
import { createQuote, seedState, updateQuote } from './mock'

afterAll(() => { vi.unstubAllGlobals() })

test('normaliza separadores e espaços sem perder pontos intermediários', () => {
  assert.equal(normalizeQuoteRoute('  Guarulhos/  Hotel  /Escritório  '), 'Guarulhos / Hotel / Escritório')
  assert.deepEqual(quoteRoutePoints({ route: 'Guarulhos / Hotel / Escritório' }), ['Guarulhos', 'Hotel', 'Escritório'])
})

test('exige dois locais e rejeita trechos vazios', () => {
  assert.equal(validateQuoteRoute('Guarulhos / Hotel'), '')
  assert.equal(validateQuoteRoute('Guarulhos/Hotel'), '')
  assert.match(validateQuoteRoute('Guarulhos'), /pelo menos dois locais/)
  for (const value of ['/Guarulhos', 'Guarulhos/', 'Guarulhos//Hotel', 'Guarulhos / / Hotel']) {
    assert.match(validateQuoteRoute(value), /Preencha todos os locais/)
  }
  assert.equal(validateQuoteStep({ route: 'Guarulhos / Hotel' }, 'request').errors.route, undefined)
  assert.equal(validateQuoteStep({ route: '' }, 'request').errors.route, undefined)
  assert.equal(validateQuoteStep({ route: 'Guarulhos' }, 'request').errors.route, undefined)
})

test('limita o trajeto normalizado a 10.000 caracteres', () => {
  assert.equal(validateQuoteRoute(`${'A'.repeat(4998)}/${'B'.repeat(4998)}`), '')
  assert.match(validateQuoteRoute(`${'A'.repeat(4999)}/${'B'.repeat(4999)}`), /10.000 caracteres/)
})

test('mantém trajeto no texto e escapa o pedido original no HTML', () => {
  const quote = { clientContact: 'Renan', route: 'GRU / Hotel <Centro> / GRU', notes: 'Hotel <Centro>' }
  assert.match(buildQuotePlainText(quote), /Trajeto: GRU \/ Hotel <Centro> \/ GRU/)
  assert.match(buildQuoteEmailHtml(quote), /Hotel &lt;Centro&gt;/)
  assert.doesNotMatch(buildQuoteEmailHtml(quote), /Hotel <Centro>/)
})

test('usa origem e destino legados quando cotação antiga não tem trajeto', () => {
  assert.deepEqual(quoteRoutePoints({ origin: 'GRU', destination: 'Hotel' }), ['GRU', 'Hotel'])
})

test('mock grava trajeto completo e deriva origem e destino em criação e edição', () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) })
  const created = createQuote(seedState(), { title: 'Transfer', client: 'Cliente', clientContact: 'Renan', route: 'GRU/Hotel/Escritório/GRU' })
  const quote = created.quotes[0]
  assert.equal(quote.route, 'GRU / Hotel / Escritório / GRU')
  assert.equal(quote.origin, 'GRU')
  assert.equal(quote.destination, 'GRU')
  const updated = updateQuote(created, quote.id, { route: 'GRU / Hotel / Escritório' })
  assert.equal(updated.quotes.find((item) => item.id === quote.id)?.route, 'GRU / Hotel / Escritório')
  assert.equal(updated.quotes.find((item) => item.id === quote.id)?.destination, 'Escritório')
})
