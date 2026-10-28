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

// Avisos desta cotação (as cotações de exemplo do mock também geram lembretes).
const ofQuote = (state: MockState, id: string) => (state.notifications || []).filter((n) => n.quoteId === id).length

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

  const waiting = { status: 'Aguardando informação', waitingFor: 'Horário do voo', waitingFrom: 'Walter', waitingReturnDate: '2026-10-30' }

  it('Aguardando informação grava o que falta, de quem e o retorno, sem tarefa', () => {
    const created = createQuote(state, input)
    const id = created.quotes[0].id
    const next = updateQuote(created, id, waiting)
    expect(next.quotes[0]).toMatchObject(waiting)
    expect(() => updateQuote(created, id, { status: 'Aguardando informação' })).toThrow('Informe o que falta.')
  })

  it('sair de Aguardando limpa os campos', () => {
    const created = createQuote(state, input)
    const id = created.quotes[0].id
    const resumed = updateQuote(updateQuote(created, id, waiting), id, { status: 'Em análise pelo financeiro' })
    expect(resumed.quotes[0]).toMatchObject({ waitingFor: '', waitingFrom: '', waitingReturnDate: '' })
  })

  it('na data de retorno lembra criador e Financeiro, uma vez por dia', () => {
    const created = createQuote(state, input)
    const id = created.quotes[0].id
    const next = updateQuote(created, id, waiting)
    expect(ofQuote(syncQuoteFollowUps(next, '2026-10-29'), id)).toBe(ofQuote(next, id))
    const due = syncQuoteFollowUps(next, '2026-10-30')
    const recipients = (due.notifications || []).filter((n) => n.quoteId === id && n.type === 'quote_waiting_return').map((n) => n.recipientEmployeeId)
    const finance = state.teams?.find((team) => team.name === 'Financeiro')?.memberIds || []
    expect(recipients).toContain('employee-renan')
    expect(finance.every((member) => recipients.includes(String(member)))).toBe(true)
    expect(ofQuote(syncQuoteFollowUps(due, '2026-10-30'), id)).toBe(ofQuote(due, id))
  })

  it('Cotada derivada avisa o criador uma vez', () => {
    const { id, state: next } = priced(state)
    expect(next.quotes[0].status).toBe('Cotada')
    expect((next.notifications || []).filter((n) => n.quoteId === id && n.type === 'quote_ready' && n.recipientEmployeeId === 'employee-renan')).toHaveLength(1)
  })

  it('Preço pronto avisa de novo a cada nova entrada em Cotada', () => {
    const { id, state: first } = priced(state)
    const back = updateQuote(first, id, { status: 'Em análise pelo financeiro', options: [] })
    vi.setSystemTime(Date.now() + 60_000)
    const again = updateQuote(back, id, { options: priceOption })
    vi.useRealTimers()
    expect(again.quotes[0].status).toBe('Cotada')
    expect((again.notifications || []).filter((n) => n.quoteId === id && n.type === 'quote_ready')).toHaveLength(2)
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
    expect(ofQuote(syncQuoteFollowUps(sent, sentDay), id)).toBe(ofQuote(sent, id))
    const later = syncQuoteFollowUps(sent, '2099-01-01')
    expect((later.notifications || []).filter((n) => n.quoteId === id && n.type === 'quote_follow_up')).toHaveLength(1)
    expect(ofQuote(syncQuoteFollowUps(later, '2099-01-01'), id)).toBe(ofQuote(later, id))
  })

  it('lembrete some com a decisão', () => {
    const { id, state: pricedState } = priced(state)
    const sent = markQuoteSent(pricedState, id)
    const versionId = String(sent.quotes[0].proposalVersions?.at(-1)?.id)
    const decided = setQuoteOutcome(sent, id, 'Aceita pelo cliente', '', { acceptedOptionId: 'o1', acceptedProposalVersionId: versionId })
    expect(decided.quotes[0].acceptedOptionId).toBe('o1')
    expect(decided.quotes[0].status).toBe('Aceita pelo cliente')
    expect(ofQuote(syncQuoteFollowUps(decided, '2099-01-01'), id)).toBe(ofQuote(decided, id))
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
