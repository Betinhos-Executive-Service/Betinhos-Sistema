import { describe, expect, it } from 'vitest'
import { financeMemberIds, followUpNotices, LOSS_REASONS, readyNotice, urgentNotices } from './quoteNotifications'
import type { QuoteData } from './types'

const base: QuoteData = { id: 'q1', code: 'COT-0001', title: 'Aeroporto', status: 'Nova', deadline: '2026-10-27', creatorEmployeeId: 'e-criador', options: [], proposalVersions: [] }

describe('urgentNotices', () => {
  it('avisa cada financeiro quando o prazo é hoje', () => {
    const out = urgentNotices(base, ['f1', 'f2'], '2026-10-27')
    expect(out.map((n) => n.recipientEmployeeId)).toEqual(['f1', 'f2'])
    expect(out[0].type).toBe('quote_urgent')
    expect(out[0].quoteId).toBe('q1')
  })
  it('não avisa prazo futuro nem sem financeiro', () => {
    expect(urgentNotices({ ...base, deadline: '2026-10-29' }, ['f1'], '2026-10-27')).toEqual([])
    expect(urgentNotices(base, [], '2026-10-27')).toEqual([])
  })
})

describe('readyNotice', () => {
  it('avisa o criador ao entrar em Cotada', () => {
    const n = readyNotice({ ...base, status: 'Em análise pelo financeiro' }, { ...base, status: 'Cotada' })
    expect(n?.recipientEmployeeId).toBe('e-criador')
    expect(n?.type).toBe('quote_ready')
  })
  it('não avisa se já estava Cotada ou sem criador', () => {
    expect(readyNotice({ ...base, status: 'Cotada' }, { ...base, status: 'Cotada' })).toBeNull()
    expect(readyNotice({ ...base, status: 'Em análise pelo financeiro', creatorEmployeeId: '' }, { ...base, status: 'Cotada', creatorEmployeeId: '' })).toBeNull()
  })
})

describe('followUpNotices', () => {
  const sent: QuoteData = { ...base, status: 'Respondida ao cliente', proposalVersions: [{ id: 'v1', sentAt: '2026-10-23T12:00:00-03:00' }] }
  it('lembra o criador 2 dias úteis após o envio', () => {
    const out = followUpNotices([sent], '2026-10-27') // sex 23 + 2 úteis = ter 27
    expect(out).toHaveLength(1)
    expect(out[0].recipientEmployeeId).toBe('e-criador')
    expect(out[0].type).toBe('quote_follow_up')
  })
  it('não lembra antes do prazo nem depois da decisão', () => {
    expect(followUpNotices([sent], '2026-10-26')).toEqual([])
    expect(followUpNotices([{ ...sent, status: 'Perdida' }], '2026-10-30')).toEqual([])
    expect(followUpNotices([{ ...sent, status: 'Aceita pelo cliente' }], '2026-10-30')).toEqual([])
  })
  it('conta os dias úteis a partir da data de São Paulo, não da data UTC', () => {
    // Enviada qui 22/10 às 22:30 em SP (sex 23/10 01:30 UTC): qui + 2 úteis = seg 26.
    const lateSend: QuoteData = { ...sent, proposalVersions: [{ id: 'v1', sentAt: '2026-10-23T01:30:00.000Z' }] }
    expect(followUpNotices([lateSend], '2026-10-26')).toHaveLength(1)
  })
  it('data de envio inválida não derruba a geração dos lembretes', () => {
    expect(followUpNotices([{ ...sent, proposalVersions: [{ id: 'v1', sentAt: 'sem data' }] }], '2026-10-30')).toEqual([])
  })
  it('dedupe por dia', () => {
    const [a] = followUpNotices([sent], '2026-10-27')
    const [b] = followUpNotices([sent], '2026-10-28')
    expect(a.dedupeKey).not.toBe(b.dedupeKey)
  })
})

it('motivos de perda fixos', () => {
  expect(LOSS_REASONS).toEqual(['Preço', 'Fechou com outro', 'Desistiu', 'Sem resposta'])
})

describe('financeMemberIds', () => {
  it('acha a equipe Financeiro ignorando caixa e espaços e devolve ids como texto', () => {
    expect(financeMemberIds({ teams: [{ name: 'Operação', memberIds: ['x'] }, { name: ' financeiro ', memberIds: ['a', 2] }] })).toEqual(['a', '2'])
    expect(financeMemberIds({})).toEqual([])
  })
})
