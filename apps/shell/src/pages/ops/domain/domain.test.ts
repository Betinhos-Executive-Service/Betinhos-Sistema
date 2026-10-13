import { describe, expect, it } from 'vitest'
import { createMockPagantes } from '../../pagantes/data/mock'
import { STATUS } from '../../pagantes/domain/status'
import { dateOnly, mapOp } from '../data/queries'
import { passageirosCurto, periodo } from '../components/OpsList'
import { BUILTIN_VIEWS, EMPTY_FILTERS, VIEWS_KEY, filterOps, loadViews, matchView } from './filters'
import { OP_STATUS, cancelBlock, resumoRateio } from './status'
import { buildTimeline } from './timeline'
import { FALLBACK_OP_CHOICES } from './status'
import { createMockOps } from '../data/mock'

const now = new Date(2026, 9, 8, 10)
const ops = createMockOps(now)
const pagantes = createMockPagantes(now)
const rateioDe = (opId: string) => pagantes.filter((p) => p.opId === opId)

describe('mapOp', () => {
  it('lê data "somente data" sem voltar um dia e trata "null" de flow como vazio', () => {
    const op = mapOp({ cr40f_financeiroid: '{D5F22DD4-6487-F111-AB0E-E4FADE0391A7}', cr40f_idfinanceiro: 'OP-58', cr40f_status: 100000001, cr40f_valor: 1840.5, new_clientedaop: 'null', cr40f_datado1servico: '2026-07-27T00:00:00', createdon: '2026-07-24T10:37:43Z' })
    expect(op.id).toBe('d5f22dd4-6487-f111-ab0e-e4fade0391a7')
    expect(op.cliente).toBe('')
    expect(op.primeiroServico?.getDate()).toBe(27)
    expect(op.ultimoServico).toBeNull()
    expect(dateOnly('lixo')).toBeNull()
  })
})

describe('cancelBlock', () => {
  it('só libera OP aberta/pendente sem pagante ativo', () => {
    expect(cancelBlock({ status: OP_STATUS.cancelada }, [])).toMatch(/já está cancelada/)
    expect(cancelBlock({ status: OP_STATUS.paga }, [])).toMatch(/paga/)
    expect(cancelBlock({ status: OP_STATUS.aberta }, null)).toMatch(/Aguarde/)
    expect(cancelBlock({ status: OP_STATUS.parcial }, rateioDe('mock-op-1'))).toMatch(/pagamento confirmado/)
    expect(cancelBlock({ status: OP_STATUS.pendente }, rateioDe('mock-op-2'))).toMatch(/o pagante ativo/)
    // OP 7 só tem pagante cancelado; OP 12 não tem nenhum.
    expect(cancelBlock({ status: OP_STATUS.aberta }, rateioDe('mock-op-7'))).toBeNull()
    expect(cancelBlock({ status: OP_STATUS.aberta }, [])).toBeNull()
  })
})

describe('resumoRateio', () => {
  it('soma parcelas ativas, separa o recebido e compara com o valor da OP', () => {
    const r = resumoRateio({ valor: 2500 }, rateioDe('mock-op-1'), [])
    expect(r).toMatchObject({ parcelas: 2, soma: 2500, recebido: 1250, diferenca: 0 })
    expect(resumoRateio({ valor: 2600 }, rateioDe('mock-op-3'), []).diferenca).toBe(-200)
    // Sem parcela não há diferença a apontar.
    expect(resumoRateio({ valor: 310 }, rateioDe('mock-op-7'), []).diferenca).toBe(0)
    expect(resumoRateio({ valor: null }, rateioDe('mock-op-1'), []).referencia).toBeNull()
  })
})

describe('filtros e visões', () => {
  it('busca sem acento por cliente e passageiro e filtra por status', () => {
    expect(filterOps(ops, { ...EMPTY_FILTERS, query: 'lumen helena' }).map((o) => o.codigo)).toEqual(['OP-402', 'OP-408'])
    expect(filterOps(ops, { ...EMPTY_FILTERS, status: [OP_STATUS.cancelada] }).map((o) => o.codigo)).toEqual(['OP-413'])
    expect(matchView(BUILTIN_VIEWS, { periodo: '90', status: [OP_STATUS.parcial, OP_STATUS.aberta, OP_STATUS.pendente] })?.id).toBe('em-aberto')
  })

  it('descarta visões salvas inválidas', () => {
    const kv = new Map<string, string>()
    kv.set(VIEWS_KEY, JSON.stringify({ views: [{ id: 'a', nome: 'Boa', filters: { periodo: '30', status: [1] } }, { id: 'b', nome: 'Ruim', filters: { periodo: '7' } }, { id: 'todas', nome: 'Clone', filters: {} }], last: 'a' }))
    const stored = loadViews({ getItem: (k) => kv.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined })
    expect(stored.views.map((v) => v.nome)).toEqual(['Boa'])
    expect(stored.last).toBe('a')
  })
})

describe('apresentação', () => {
  it('encurta passageiros e período', () => {
    expect(passageirosCurto('Ana - 11 9999\nBeto - 21 8888\nCaio - 31 7777')).toBe('Ana, Beto +1')
    expect(periodo({ primeiroServico: new Date(2026, 6, 27, 12), ultimoServico: new Date(2026, 6, 27, 12) })).toBe('27/07/2026')
    expect(periodo({ primeiroServico: null, ultimoServico: null })).toBe('Sem data de serviço')
  })

  it('monta a linha do tempo com pagamentos e status atual por último', () => {
    const op = ops[0]
    const events = buildTimeline(op, FALLBACK_OP_CHOICES, rateioDe(op.id))
    const datas = events.slice(0, -1).map((e) => e.at?.getTime() ?? Infinity)
    expect(datas).toEqual([...datas].sort((x, y) => x - y))
    expect(events.some((e) => e.key === 'criada')).toBe(true)
    expect(events.some((e) => e.title === 'Pagamento de Ricardo Menezes')).toBe(true)
    expect(events.at(-1)?.title).toBe('Status atual: Pagamento Parcial')
    expect(rateioDe(op.id).some((p) => p.status === STATUS.pago)).toBe(true)
  })
})
