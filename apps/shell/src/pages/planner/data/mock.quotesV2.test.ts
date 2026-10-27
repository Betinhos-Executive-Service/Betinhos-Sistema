import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuote, loadState, markQuoteSent, resetState, saveState, setQuoteOutcome, syncQuoteFollowUps, updateQuote, type MockState } from './mock'
import { localDateKey } from '../domain/management'

const input = { client: 'Tenaris', clientContact: 'Walter', notes: 'GRU → Centro', deadline: '2026-10-30', actorEmployeeId: 'employee-renan', financeIds: ['employee-fin'], today: '2026-10-27' }
const priceOption = [{ id: 'o1', name: 'Sedan', value: '350' }]

function priced(state: MockState) {
  const created = createQuote(state, input)
  const id = created.quotes[0].id
  return { id, state: updateQuote(updateQuote(created, id, { status: 'Em análise pelo financeiro' }), id, { options: priceOption }) }
}

const values = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) })
afterAll(() => { vi.unstubAllGlobals() })

describe('cotações V2 no mock', () => {
  let state: MockState
  beforeEach(() => { values.clear(); state = resetState() })

  it('cria sem tarefa, grava o criador e avisa o financeiro quando é para hoje', () => {
    const tasksBefore = state.tasks.length
    const next = createQuote(state, { ...input, deadline: '2026-10-27' })
    const quote = next.quotes[0]
    expect(next.tasks).toHaveLength(tasksBefore)
    expect(quote.plannerTaskId ?? '').toBe('')
    expect(quote.creatorEmployeeId).toBe('employee-renan')
    expect(next.notifications?.some((n) => n.quoteId === quote.id && n.type === 'quote_urgent' && n.recipientEmployeeId === 'employee-fin')).toBe(true)
  })

  it('prazo futuro não avisa o financeiro', () => {
    const next = createQuote(state, input)
    expect(next.notifications?.some((n) => n.quoteId === next.quotes[0].id)).toBe(false)
  })

  it('sem financeIds, usa os membros da equipe Financeiro', () => {
    const finance = state.teams?.find((team) => team.name === 'Financeiro')
    const next = createQuote(state, { ...input, financeIds: undefined, deadline: '2026-10-27' })
    const recipients = (next.notifications || []).filter((n) => n.quoteId === next.quotes[0].id).map((n) => n.recipientEmployeeId)
    expect(recipients.length).toBeGreaterThan(0)
    expect(recipients.every((id) => finance?.memberIds?.includes(String(id)))).toBe(true)
  })

  it('Aguardando informação não exige tarefa', () => {
    const created = createQuote(state, input)
    const id = created.quotes[0].id
    const next = updateQuote(created, id, { status: 'Aguardando informação', waitingContext: { subject: 'Horário do voo', onType: 'external', onNames: ['Walter'], expectedDate: '2026-10-28' } })
    expect(next.quotes[0].status).toBe('Aguardando informação')
  })

  it('Cotada derivada avisa o criador uma vez', () => {
    const { id, state: next } = priced(state)
    expect(next.quotes[0].status).toBe('Cotada')
    expect((next.notifications || []).filter((n) => n.quoteId === id && n.type === 'quote_ready' && n.recipientEmployeeId === 'employee-renan')).toHaveLength(1)
  })

  it('Enviei grava só a data, sem canal, e lembra depois de 2 dias úteis', () => {
    const { id, state: pricedState } = priced(state)
    const sent = markQuoteSent(pricedState, id)
    const quote = sent.quotes.find((q) => q.id === id)!
    const version = quote.proposalVersions?.at(-1)
    expect(quote.status).toBe('Respondida ao cliente')
    expect(version?.sentAt).toBeTruthy()
    expect(version?.channel || '').toBe('')
    expect(version?.recipient || '').toBe('')
    const sentDay = String(version?.sentAt).slice(0, 10)
    expect(syncQuoteFollowUps(sent, sentDay).notifications?.length).toBe(sent.notifications?.length)
    const later = syncQuoteFollowUps(sent, '2099-01-01')
    expect((later.notifications || []).filter((n) => n.quoteId === id && n.type === 'quote_follow_up')).toHaveLength(1)
    expect(syncQuoteFollowUps(later, '2099-01-01').notifications?.length).toBe(later.notifications?.length)
  })

  it('lembrete some com a decisão', () => {
    const { id, state: pricedState } = priced(state)
    const sent = markQuoteSent(pricedState, id)
    const versionId = String(sent.quotes[0].proposalVersions?.at(-1)?.id)
    const decided = setQuoteOutcome(sent, id, 'Aceita pelo cliente', '', { acceptedOptionId: 'o1', acceptedProposalVersionId: versionId })
    expect(decided.quotes[0].acceptedOptionId).toBe('o1')
    expect(decided.quotes[0].status).toBe('Aceita pelo cliente')
    expect(syncQuoteFollowUps(decided, '2099-01-01').notifications?.length).toBe(decided.notifications?.length)
  })

  it('carregar o estado gera o lembrete vencido', () => {
    const { id, state: pricedState } = priced(state)
    const sent = markQuoteSent(pricedState, id)
    saveState({ ...sent, quotes: sent.quotes.map((q) => q.id === id ? { ...q, proposalVersions: (q.proposalVersions || []).map((v) => ({ ...v, sentAt: '2020-01-01T12:00:00.000Z' })) } : q) })
    const loaded = loadState()
    expect((loaded.notifications || []).some((n) => n.quoteId === id && n.type === 'quote_follow_up' && n.referenceDate === localDateKey())).toBe(true)
  })

  it('Perdida exige motivo da lista', () => {
    const created = createQuote(state, input)
    const id = created.quotes[0].id
    expect(() => setQuoteOutcome(created, id, 'Perdida', '')).toThrow('Escolha o motivo da perda.')
    expect(() => setQuoteOutcome(created, id, 'Perdida', 'qualquer')).toThrow('Escolha o motivo da perda.')
    expect(setQuoteOutcome(created, id, 'Perdida', 'Preço').quotes[0].lossReason).toBe('Preço')
  })
})
