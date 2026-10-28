import { describe, expect, it } from 'vitest'
import { applyQuoteWaiting, defaultWaitingReturnDate, QUOTE_WAITING_STATUS, validateQuoteWaiting } from './quoteWaiting'

const filled = { waitingFor: 'Horário do voo', waitingFrom: 'Cliente', waitingReturnDate: '2026-10-30' }

describe('defaultWaitingReturnDate', () => {
  it('hoje + 2 dias úteis', () => {
    expect(defaultWaitingReturnDate('2026-10-28')).toBe('2026-10-30') // qua → sex
    expect(defaultWaitingReturnDate('2026-10-30')).toBe('2026-11-03') // sex → ter
  })
})

describe('validateQuoteWaiting', () => {
  it('exige os três campos', () => {
    expect(validateQuoteWaiting(filled)).toBe('')
    expect(validateQuoteWaiting({ ...filled, waitingFor: ' ' })).toMatch(/o que falta/)
    expect(validateQuoteWaiting({ ...filled, waitingFrom: '' })).toMatch(/de quem/)
    expect(validateQuoteWaiting({ ...filled, waitingReturnDate: '' })).toMatch(/data de retorno/)
  })
  it('respeita os limites das colunas', () => {
    expect(validateQuoteWaiting({ ...filled, waitingFor: 'x'.repeat(501) })).toMatch(/500/)
    expect(validateQuoteWaiting({ ...filled, waitingFrom: 'x'.repeat(201) })).toMatch(/200/)
  })
})

describe('applyQuoteWaiting', () => {
  it('ao entrar valida e gera o contexto da tarefa legada', () => {
    const patch = applyQuoteWaiting('Em análise pelo financeiro', { status: QUOTE_WAITING_STATUS, ...filled })
    expect(patch.waitingFor).toBe('Horário do voo')
    expect(patch.waitingContext).toMatchObject({ subject: 'Horário do voo', onType: 'external', onNames: ['Cliente'], expectedDate: '2026-10-30' })
  })
  it('ao entrar sem os campos recusa', () => {
    expect(() => applyQuoteWaiting('Nova', { status: QUOTE_WAITING_STATUS })).toThrow(/o que falta/)
  })
  it('ao sair limpa os campos', () => {
    expect(applyQuoteWaiting(QUOTE_WAITING_STATUS, { status: 'Em análise pelo financeiro' })).toEqual({ status: 'Em análise pelo financeiro', waitingFor: '', waitingFrom: '', waitingReturnDate: '' })
  })
  it('sem mudança de status não mexe nos campos', () => {
    expect(applyQuoteWaiting('Nova', { notes: 'x' })).toEqual({ notes: 'x' })
    expect(applyQuoteWaiting(QUOTE_WAITING_STATUS, { status: QUOTE_WAITING_STATUS, notes: 'x' })).toEqual({ status: QUOTE_WAITING_STATUS, notes: 'x' })
  })
})
