import { describe, expect, it } from 'vitest'
import { CP, FAT, OP, PAG } from './codes'
import { detectarPendencias } from './detect'
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

  it('ignora reservas informativas sem evento de dinheiro', () => {
    expect(detectarPendencias([op('1', OP.pendente)], [res('a', '1', FAT.pagante)], [pag('1', PAG.pendente, 1000)])).toEqual([])
  })
})
