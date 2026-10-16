import { CP, FAT, OP, PAG } from '../domain/codes'
import type { OpResumo, PaganteResumo, Reserva } from '../domain/types'

const dia = (now: Date, n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(9, 30, 0, 0); return d }

export type MockPendencias = { ops: OpResumo[]; reservas: Reserva[]; pagantes: PaganteResumo[] }

/** Um caso de cada tipo (1, 2, 3, 4, 5) e um alinhado, que não deve aparecer. Ids `mock-op-p*` não colidem com os do módulo de OPs. */
export function createMockPendencias(now: Date): MockPendencias {
  const op = (n: number, status: number, valor: number, cliente: string): OpResumo => ({ id: `mock-op-p${n}`, codigo: `OP-${500 + n}`, status, valor, cliente })
  const res = (n: number, opN: number, fat: number, cp: number, cliente: string): Reserva => ({
    id: `mock-res-p${n}`, codigo: `RES-${700 + n}`, saida: dia(now, n), cliente, clienteId: `mock-cli-${n}`, status: 202410008, fatStatus: fat,
    fatLabel: '', opId: `mock-op-p${opN}`, opCodigo: `OP-${500 + opN}`, cpId: `mock-cp-p${n}`, cpStatus: cp, cpValor: 600,
  })
  // tipo 4: dois serviços mensais concluídos, sem OP, no dia 10 do mês anterior
  const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 10, 12, 0, 0)
  const mensal = (n: number): Reserva => ({
    id: `mock-res-p${n}`, codigo: `RES-${700 + n}`, saida: mesAnterior, cliente: 'Construtora Horizonte', clienteId: 'mock-cli-mensal', status: 202410008,
    fatStatus: FAT.mensal, fatLabel: '', opId: null, opCodigo: '', cpId: `mock-cp-p${n}`, cpStatus: CP.pendente, cpValor: 450,
  })
  const pag = (n: number, opN: number, status: number, valor: number): PaganteResumo => ({ id: `mock-pag-p${n}`, opId: `mock-op-p${opN}`, status, valor })
  return {
    ops: [
      op(1, OP.paga, 600, 'Grupo Atlântico'),          // tipo 1: OP paga, reserva Pendente
      op(2, OP.pendente, 500, 'Lumen Consultoria'),    // tipo 2: reserva Pago, pagante pago, OP não Paga
      op(3, OP.pendente, 700, 'Hotel Unique'),         // tipo 3: sem pagante pago, reserva Pago
      op(5, OP.pendente, 1000, 'Particular'),          // tipo 5: rateio 900 x 1000
      op(6, OP.paga, 600, 'Grupo Atlântico'),          // alinhado
    ],
    reservas: [
      res(1, 1, FAT.pendente, CP.pendente, 'Grupo Atlântico'),
      res(2, 2, FAT.pago, CP.concluida, 'Lumen Consultoria'),
      res(3, 3, FAT.pago, CP.concluida, 'Hotel Unique'),
      res(5, 5, FAT.pendente, CP.pendente, 'Particular'),
      res(6, 6, FAT.pago, CP.concluida, 'Grupo Atlântico'),
      mensal(41), mensal(42),
    ],
    pagantes: [
      pag(2, 2, PAG.pago, 500),
      pag(51, 5, PAG.pendente, 400), pag(52, 5, PAG.pendente, 500),
      pag(6, 6, PAG.pago, 600),
    ],
  }
}
