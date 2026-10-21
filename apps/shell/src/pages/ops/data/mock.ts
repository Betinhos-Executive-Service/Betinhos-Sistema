import { mockVolume } from '../../../app/mockVolume'
import { OP_STATUS } from '../domain/status'
import type { Op } from '../domain/types'

const days = (now: Date, n: number, h = 10) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(h, 15, 0, 0); return d }
const dia = (now: Date, n: number) => { const d = days(now, n, 12); d.setMinutes(0); return d }

/**
 * OPs de exemplo do `pnpm dev`. Os ids batem com os `opId` dos pagantes de exemplo (mock-op-N),
 * então o rateio e os serviços da ficha vêm do mock de Pagantes.
 */
export function createMockOps(now: Date, extra = mockVolume()): Op[] {
  const make = (n: number, status: number, valor: number | null, cliente: string, passageiros: string, extra: Partial<Op> = {}): Op => ({
    id: `mock-op-${n}`, codigo: `OP-${400 + n}`, status, valor, cliente, passageiros,
    trajetos: 'Aeroporto de Guarulhos → Av. Faria Lima, 3500',
    primeiroServico: dia(now, n * 3 + 2), ultimoServico: dia(now, n * 3), idioma: 202410000,
    criadoEm: days(now, n * 3), criadoPor: 'Renan Mendonça', alteradoEm: days(now, n * 3 - 1),
    ...extra,
  })
  // `?volume=N` do pnpm dev: N OPs a mais, espalhadas pelos últimos 2 anos (os períodos filtram de verdade).
  const clientes = ['Grupo Atlântico', 'Lumen Consultoria', 'Particular', 'Hotel Unique']
  const status = [OP_STATUS.pendente, OP_STATUS.paga, OP_STATUS.parcial, OP_STATUS.aberta]
  const volume = Array.from({ length: extra }, (_, i) => make(100 + i, status[i % 4], 300 + (i % 37) * 45.5, clientes[i % 4], `Passageiro ${i + 1}`, {
    codigo: `OP-${2000 + i}`, criadoEm: days(now, Math.floor(i / 8) % 730), primeiroServico: dia(now, Math.floor(i / 8) % 730 + 2), ultimoServico: dia(now, Math.floor(i / 8) % 730),
  }))
  return [
    make(1, OP_STATUS.parcial, 2500, 'Grupo Atlântico', 'Mariana Albuquerque - (11) 99812-4410\nRicardo Menezes - (21) 98765-1200'),
    make(2, OP_STATUS.pendente, 860.5, 'Lumen Consultoria', 'Helena Prado'),
    make(3, OP_STATUS.pendente, 2600, 'Particular', 'Paulo Tavares - 11 3456-7788', { idioma: 202410001 }),
    make(4, OP_STATUS.paga, 540, 'Lumen Consultoria', 'Juliana Costa - (11) 97777-0101'),
    make(5, OP_STATUS.paga, 980, 'Grupo Atlântico', 'Mariana Albuquerque - (11) 99812-4410'),
    make(6, OP_STATUS.pendente, 1320, 'Grupo Atlântico', 'Ricardo Menezes - (21) 98765-1200'),
    make(7, OP_STATUS.aberta, 310, 'Lumen Consultoria', 'Juliana Costa - (11) 97777-0101', { trajetos: '' }),
    make(8, OP_STATUS.pendente, 1999.9, 'Lumen Consultoria', 'Helena Prado', { idioma: 202410002 }),
    make(9, OP_STATUS.pendente, 760, 'Particular', 'Paulo Tavares - 11 3456-7788'),
    make(10, OP_STATUS.paga, 4200, 'Grupo Atlântico', 'Mariana Albuquerque - (11) 99812-4410'),
    make(11, OP_STATUS.pendente, 1500, 'Grupo Atlântico', 'Ricardo Menezes - (21) 98765-1200'),
    // Recém-criada, ainda sem rateio: a única que pode ser cancelada no mock.
    make(12, OP_STATUS.aberta, 1840, 'Hotel Unique', 'Carlos Siqueira', { criadoEm: days(now, 0, 8), alteradoEm: days(now, 0, 8), primeiroServico: dia(now, -2), ultimoServico: dia(now, -2) }),
    make(13, OP_STATUS.cancelada, 720, 'Particular', 'Paulo Tavares - 11 3456-7788', { alteradoEm: days(now, 20) }),
    ...volume,
  ]
}
