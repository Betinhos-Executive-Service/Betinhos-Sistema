import assert from 'node:assert/strict'
import { test } from 'vitest'
import { filterQuotes, matchesQuoteSearch, quoteCreatorName, quoteSearchTerms } from './quoteDomain'
import { filterQuoteHistory } from './quoteHistory'
import type { QuoteInput } from './types'

const quote: QuoteInput = {
  id: 'q1', code: 'COT-0042', title: 'Transfer executivo', client: 'Embraer', clientContact: 'João Araújo',
  clientEmail: 'joao@embraer.com.br', clientPhone: '(12) 99876-5432', status: 'Em análise', priority: 'urgent',
  origin: 'Aeroporto de Guarulhos', destination: 'São José dos Campos', serviceDate: '2026-11-18', deadline: '2026-11-12',
  value: 'R$ 1.250,00', notes: 'Executivo bilíngue', options: [{ id: 'o1', name: 'Opção blindada', items: [{ vehicleType: 'Van Blindado' }] }],
}
const find = (query: string, names: string[] = []) => matchesQuoteSearch(quote, quoteSearchTerms(query), names)

test('busca ignora acento, caixa e ordem das palavras', () => {
  assert.ok(find('sao jose'))
  assert.ok(find('ARAUJO joão'))
  assert.ok(find('campos embraer'))
  assert.ok(!find('embraer campinas'))
})

test('busca acha número, telefone, valor e datas em formatos do dia a dia', () => {
  for (const query of ['cot0042', '42', '99876', '12998765432', '1250', '1.250', '18/11', '18/11/2026', '12/11']) assert.ok(find(query), query)
})

test('busca acha rota, veículo das opções, prioridade, observações e responsável', () => {
  for (const query of ['guarulhos', 'van blindado', 'urgente', 'bilingue', 'joao@embraer']) assert.ok(find(query), query)
  assert.ok(find('marina', ['Marina Souza']))
  assert.ok(!find('marina'))
})

test('pendentes e histórico usam a mesma busca', () => {
  const tasks = [{ id: 't1', quoteId: 'q1', assigneeIds: ['e1'], assigneeNames: ['Marina Souza'] }]
  assert.deepEqual(filterQuotes([quote], tasks, { query: 'marina guarulhos' }).map((item) => item.id), ['q1'])
  assert.deepEqual(filterQuoteHistory([{ ...quote, status: 'Perdida', lossReason: 'Preço acima' }], { query: 'preco' }).map((item) => item.id), ['q1'])
})

test('pendentes e histórico acham responsável e quem criou', () => {
  const tasks = [{ id: 't1', quoteId: 'q1', assigneeIds: ['e1'], assigneeNames: ['Marina Souza'] }]
  const employees = [{ id: 'e2', name: 'Carla Dias' }]
  const created = { ...quote, creatorEmployeeId: 'e2' }
  assert.deepEqual(filterQuotes([created], tasks, { query: 'carla' }, undefined, employees).map((item) => item.id), ['q1'])
  const closed = { ...created, status: 'Perdida' }
  for (const query of ['marina', 'carla dias']) assert.deepEqual(filterQuoteHistory([closed], { query, tasks, employees }).map((item) => item.id), ['q1'], query)
  assert.deepEqual(filterQuoteHistory([closed], { query: 'carla' }), [])
  assert.equal(quoteCreatorName({ ...created, creatorName: 'Carla D.' }, []), 'Carla D.')
})

test('busca acha valor cru do Dataverse no formato em reais e data e hora no fuso de São Paulo', () => {
  const live = { ...quote, value: '1250.5', serviceDate: '2026-11-19T01:30:00Z', options: null as unknown as QuoteInput['options'] }
  for (const query of ['1.250,50', '1250', '18/11/2026', '22:30']) assert.ok(matchesQuoteSearch(live, quoteSearchTerms(query)), query)
  assert.ok(!matchesQuoteSearch(live, quoteSearchTerms('19/11')))
})
