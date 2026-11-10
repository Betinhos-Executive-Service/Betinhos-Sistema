import assert from 'node:assert/strict'
import { test } from 'vitest'
import { filterQuotes } from './quoteDomain'
import { filterQuoteHistory } from './quoteHistory'
import { matchesQuoteSearch, quoteSearchTerms } from './quoteSearch'
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
