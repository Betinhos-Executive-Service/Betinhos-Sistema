import { describe, expect, it } from 'vitest'
import { financeMemberIds, followUpNotices, LOSS_REASONS, readyNotice, urgentNotices, waitingReturnNotices } from './quoteNotifications'
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
    const n = readyNotice({ ...base, status: 'Em análise pelo financeiro' }, { ...base, status: 'Cotada' }, '2026-10-28T10:00:00.000Z')
    expect(n?.recipientEmployeeId).toBe('e-criador')
    expect(n?.type).toBe('quote_ready')
  })
  it('não avisa se já estava Cotada ou sem criador', () => {
    expect(readyNotice({ ...base, status: 'Cotada' }, { ...base, status: 'Cotada' }, 't')).toBeNull()
    expect(readyNotice({ ...base, status: 'Em análise pelo financeiro', creatorEmployeeId: '' }, { ...base, status: 'Cotada', creatorEmployeeId: '' }, 't')).toBeNull()
  })
  it('cada nova entrada em Cotada gera chave própria (avisa de novo após reabrir)', () => {
    const first = readyNotice({ ...base, status: 'Nova' }, { ...base, status: 'Cotada' }, '2026-10-28T10:00:00.000Z')
    const second = readyNotice({ ...base, status: 'Em análise pelo financeiro' }, { ...base, status: 'Cotada' }, '2026-10-28T11:30:00.000Z')
    expect(first?.dedupeKey).not.toBe(second?.dedupeKey)
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

describe('waitingReturnNotices', () => {
  const waiting: QuoteData = { ...base, status: 'Aguardando informação', waitingFor: 'Voo', waitingFrom: 'Cliente', waitingReturnDate: '2026-10-30' }
  it('na data de retorno avisa criador e Financeiro, sem repetir', () => {
    const out = waitingReturnNotices([waiting], ['f1', 'e-criador'], '2026-10-30')
    expect(out.map((n) => n.recipientEmployeeId)).toEqual(['e-criador', 'f1'])
    expect(out[0].type).toBe('quote_waiting_return')
    expect(out[0].message).toContain('Voo')
  })
  it('antes da data, fora de Aguardando ou sem data não avisa', () => {
    expect(waitingReturnNotices([waiting], ['f1'], '2026-10-29')).toEqual([])
    expect(waitingReturnNotices([{ ...waiting, status: 'Em análise pelo financeiro' }], ['f1'], '2026-10-30')).toEqual([])
    expect(waitingReturnNotices([{ ...waiting, waitingReturnDate: '' }], ['f1'], '2026-10-30')).toEqual([])
  })
  it('atrasado continua lembrando, um por dia', () => {
    const [a] = waitingReturnNotices([waiting], [], '2026-10-30')
    const [b] = waitingReturnNotices([waiting], [], '2026-10-31')
    expect(a.dedupeKey).not.toBe(b.dedupeKey)
  })
})

// cr40f_ChaveDedupe aceita no máximo 100 caracteres no PROD (a metadata diz 450, mas
// o INSERT de 101+ falhou com "String or binary data would be truncated").
describe('chave de dedupe dos avisos de cotação', () => {
  const MAX_KEY = 100
  const guid = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`
  const real: QuoteData = { ...base, id: guid(1), creatorEmployeeId: guid(2) }
  const waiting: QuoteData = { ...real, status: 'Aguardando informação', waitingFor: 'Voo', waitingReturnDate: '2026-10-30' }
  const sent: QuoteData = { ...real, status: 'Respondida ao cliente', proposalVersions: [{ id: 'v1', sentAt: '2026-10-23T12:00:00-03:00' }] }

  it('toda chave com GUIDs reais cabe em 100 caracteres', () => {
    const keys = [
      ...urgentNotices(real, [guid(3)], '2026-10-27'),
      ...followUpNotices([sent], '2026-10-27'),
      ...waitingReturnNotices([waiting], [guid(3)], '2026-10-30'),
      readyNotice({ ...real, status: 'Nova' }, { ...real, status: 'Cotada' }, '2026-10-28T10:00:00.000Z')!,
    ]
    expect(keys.map((n) => n.type).sort()).toEqual(['quote_follow_up', 'quote_ready', 'quote_urgent', 'quote_waiting_return', 'quote_waiting_return'])
    keys.forEach((n) => expect(n.dedupeKey.length, `${n.type}: ${n.dedupeKey}`).toBeLessThanOrEqual(MAX_KEY))
  })
  it('quote_urgent mantém o formato antigo (não reenvia avisos já criados)', () => {
    const [n] = urgentNotices(real, [guid(3)], '2026-10-27')
    expect(n.dedupeKey).toBe(`${guid(3)}|${guid(1)}|quote_urgent||`)
  })
  it('mesma cotação, tipo, destinatário e dia geram a mesma chave', () => {
    expect(followUpNotices([sent], '2026-10-27')[0].dedupeKey).toBe(followUpNotices([sent], '2026-10-27')[0].dedupeKey)
    expect(waitingReturnNotices([waiting], [], '2026-10-30')[0].dedupeKey).toBe(waitingReturnNotices([waiting], [], '2026-10-30')[0].dedupeKey)
  })
  it('dia, destinatário, cotação e tipo diferentes geram chaves diferentes', () => {
    const keys = [
      followUpNotices([sent], '2026-10-27')[0],
      followUpNotices([sent], '2026-10-28')[0],
      followUpNotices([{ ...sent, id: guid(4) }], '2026-10-27')[0],
      ...waitingReturnNotices([waiting], [guid(3), guid(5)], '2026-10-30'),
      waitingReturnNotices([waiting], [], '2026-10-31')[0],
    ].map((n) => n.dedupeKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
