import { describe, expect, it } from 'vitest'
import { CP, FAT, OP, PAG } from './codes'
import { detectarPendencias } from './detect'
import { BUILTIN_VIEWS, EMPTY_FILTERS, VIEWS_KEY, filterPendencias, loadViews, matchView, newView, viewFilters } from './filters'
import { pendenciasQuery } from './query'
import type { OpResumo, PaganteResumo, Reserva } from './types'

const op = (id: string, status: number, valor: number | null = 1000): OpResumo => ({ id, codigo: `OP-${id}`, status, valor, cliente: 'AGC' })
const res = (id: string, opId: string | null, fat: number, cp: number | null = CP.pendente, cpValor = 1000): Reserva => ({
  id, codigo: `OS-${id}`, saida: new Date(2026, 9, 1), cliente: 'AGC', clienteId: 'c1', status: 202410008,
  fatStatus: fat, fatLabel: '', opId, opCodigo: opId ? `OP-${opId}` : '', cpId: cp == null ? null : `cp-${id}`, cpStatus: cp, cpValor,
})
const pag = (opId: string, status: number, valor: number): PaganteResumo => ({ id: `${opId}-${status}-${valor}`, opId, status, valor })

describe('detectarPendencias', () => {
  it('tipo 1: OP paga com reserva não paga ou CP pendente', () => {
    const p = detectarPendencias([op('1', OP.paga)], [res('a', '1', FAT.pagante, CP.pendente)], [pag('1', PAG.pago, 1000)])
    expect(p.map((x) => x.tipo)).toEqual(['op-paga-desalinhada'])
    expect(p[0]).toMatchObject({ opId: '1', reservaIds: ['a'], corrigivel: true })
  })

  it('tipo 1 não aparece quando tudo está alinhado', () => {
    expect(detectarPendencias([op('1', OP.paga)], [res('a', '1', FAT.pago, CP.concluida)], [pag('1', PAG.pago, 1000)])).toEqual([])
  })

  it('tipo 2: reserva Pago sem OP ou com OP não paga', () => {
    const p = detectarPendencias([op('1', OP.parcial)], [res('a', null, FAT.pago), res('b', '1', FAT.pago)], [pag('1', PAG.pago, 400), pag('1', PAG.pendente, 600)])
    const t2 = p.filter((x) => x.tipo === 'pago-sem-op-paga')
    expect(t2.map((x) => x.reservaIds[0]).sort()).toEqual(['a', 'b'])
    expect(t2.every((x) => !x.corrigivel)).toBe(true)
  })

  it('tipo 3: OP cancelada ou sem pagante ativo com reserva ainda Pago', () => {
    const p = detectarPendencias(
      [op('1', OP.cancelada), op('2', OP.aberta)],
      [res('a', '1', FAT.pago), res('b', '2', FAT.pago)],
      [pag('2', PAG.cancelado, 1000)],
    )
    const t3 = p.filter((x) => x.tipo === 'op-sem-pagamento-reserva-paga')
    expect(t3.map((x) => x.opId).sort()).toEqual(['1', '2'])
    expect(t3.every((x) => x.corrigivel)).toBe(true)
    // a reserva do tipo 3 não é contada de novo como tipo 2
    expect(p.filter((x) => x.tipo === 'pago-sem-op-paga')).toEqual([])
  })

  it('tipo 5: soma do rateio ativo diferente do total da OP', () => {
    const p = detectarPendencias([op('1', OP.pendente, 1000)], [res('a', '1', FAT.pagamentoPendente)], [pag('1', PAG.pendente, 600), pag('1', PAG.cancelado, 400)])
    expect(p.map((x) => x.tipo)).toEqual(['rateio-nao-fecha'])
  })

  it('tipo 5 usa a soma das CPs quando a OP não tem valor e ignora OP sem pagante', () => {
    expect(detectarPendencias([op('1', OP.pendente, null)], [res('a', '1', FAT.pagamentoPendente, CP.pendente, 1000)], [pag('1', PAG.pendente, 1000)])).toEqual([])
    expect(detectarPendencias([op('2', OP.aberta, 1000)], [res('b', '2', FAT.pendente)], [])).toEqual([])
  })

  it('tipo 4: mensais concluídos sem OP em mês fechado, agrupados por cliente e mês', () => {
    const agora = new Date('2026-10-15T12:00:00Z')
    const m = (id: string, saida: string, extra: Partial<Reserva> = {}): Reserva => ({ ...res(id, null, FAT.mensal, CP.pendente, 300), saida: new Date(saida), ...extra })
    const p = detectarPendencias([], [m('a', '2026-09-10T12:00:00Z'), m('b', '2026-09-30T23:00:00Z'), m('c', '2026-10-01T02:00:00Z')], [], agora)
    // 'c' é 30/09 23:00 em São Paulo → entra em setembro
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ tipo: 'mensal-sem-op', id: 'mensal-sem-op:c1:2026-09', clienteId: 'c1', mes: '2026-09', valor: 900, corrigivel: false, detalhe: '3 serviço(s) de 2026-09' })
    expect(p[0].reservaIds.sort()).toEqual(['a', 'b', 'c'])
  })

  it('tipo 4 ignora mês corrente, reserva com OP e status não concluído', () => {
    const agora = new Date('2026-10-15T12:00:00Z')
    const m = (id: string, extra: Partial<Reserva> = {}): Reserva => ({ ...res(id, null, FAT.mensal), saida: new Date('2026-09-10T12:00:00Z'), ...extra })
    expect(detectarPendencias([], [m('a', { saida: new Date('2026-10-02T12:00:00Z') })], [], agora)).toEqual([])
    expect(detectarPendencias([op('1', OP.aberta)], [m('b', { opId: '1' })], [], agora).filter((x) => x.tipo === 'mensal-sem-op')).toEqual([])
    expect(detectarPendencias([], [m('c', { status: 202410001 })], [], agora)).toEqual([])
  })

  it('ignora reservas informativas sem evento de dinheiro', () => {
    expect(detectarPendencias([op('1', OP.pendente)], [res('a', '1', FAT.pagante)], [pag('1', PAG.pendente, 1000)])).toEqual([])
  })
})

describe('correções da revisão', () => {
  it('tipo 2: ids distintos e valor da CP de cada reserva', () => {
    const p = detectarPendencias([op('1', OP.parcial)], [res('a', '1', FAT.pago), res('b', '1', FAT.pago)], [pag('1', PAG.pago, 400), pag('1', PAG.pendente, 600)])
    const t2 = p.filter((x) => x.tipo === 'pago-sem-op-paga')
    expect(t2.map((x) => x.id).sort()).toEqual(['pago-sem-op-paga:a', 'pago-sem-op-paga:b'])
    expect(t2.map((x) => x.valor)).toEqual([1000, 1000])
  })
  it('busca por código da OS', () => {
    const p = detectarPendencias([op('1', OP.paga), op('2', OP.paga)], [res('a', '1', FAT.pagante), res('b', '2', FAT.pagante)], [pag('1', PAG.pago, 1000), pag('2', PAG.pago, 1000)])
    expect(filterPendencias(p, { ...EMPTY_FILTERS, q: 'os-a' }).map((x) => x.opId)).toEqual(['1'])
  })
  it('tipo 5 compara em centavos', () => {
    expect(detectarPendencias([op('1', OP.pendente, 0.3)], [res('a', '1', FAT.pagamentoPendente)], [pag('1', PAG.pendente, 0.1), pag('1', PAG.pendente, 0.2)])).toEqual([])
  })
})

describe('filterPendencias', () => {
  const base = detectarPendencias(
    [op('1', OP.paga), op('2', OP.cancelada)],
    [res('a', '1', FAT.pagante), res('b', '2', FAT.pago)],
    [pag('1', PAG.pago, 1000)],
  )
  it('filtra por tipo', () => {
    expect(filterPendencias(base, { ...EMPTY_FILTERS, tipos: ['op-sem-pagamento-reserva-paga'] }).map((p) => p.opId)).toEqual(['2'])
  })
  it('busca por OP, OS e cliente sem acento nem caixa', () => {
    expect(filterPendencias(base, { ...EMPTY_FILTERS, q: 'op-1' }).map((p) => p.opId)).toEqual(['1'])
    expect(filterPendencias(base, { ...EMPTY_FILTERS, q: 'agc' })).toHaveLength(2)
  })
  it('visão "Corrigíveis" mostra só tipos 1 e 3', () => {
    const v = BUILTIN_VIEWS.find((x) => x.id === 'corrigiveis')!
    expect(filterPendencias(base, viewFilters(v)).every((p) => p.corrigivel)).toBe(true)
  })
  it('visões salvas: casa por filtros, descarta inválidas e usa a chave própria', () => {
    expect(VIEWS_KEY).toBe('betinhos.pendencias.visoes.v1')
    expect(matchView(BUILTIN_VIEWS, { periodo: '90', tipos: ['rateio-nao-fecha'] })?.id).toBe('rateio')
    const kv = new Map<string, string>()
    kv.set(VIEWS_KEY, JSON.stringify({ views: [{ id: 'a', nome: 'Boa', filters: { periodo: '30', tipos: ['rateio-nao-fecha'] } }, { id: 'b', nome: 'Ruim', filters: { periodo: '7' } }, { id: 'c', nome: 'Tipo', filters: { tipos: ['x'] } }], last: 'a' }))
    expect(loadViews({ getItem: (k) => kv.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined }).views.map((v) => v.nome)).toEqual(['Boa'])
    expect(viewFilters(newView('Minha', { ...EMPTY_FILTERS, q: 'x', periodo: '30' }), 'abc')).toMatchObject({ q: 'abc', periodo: '30', tipos: [] })
  })
})

describe('pendenciasQuery', () => {
  it('lê e grava q, periodo e tipos', () => {
    const f = pendenciasQuery.ler(new URLSearchParams('q=agc&periodo=30&tipos=rateio-nao-fecha,lixo'))
    expect(f).toEqual({ q: 'agc', periodo: '30', tipos: ['rateio-nao-fecha'] })
    expect(pendenciasQuery.gravar(EMPTY_FILTERS)).toEqual({ q: null, periodo: null, tipos: null })
    expect(pendenciasQuery.gravar(f)).toEqual({ q: 'agc', periodo: '30', tipos: 'rateio-nao-fecha' })
  })
})
