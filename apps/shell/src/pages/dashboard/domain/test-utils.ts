import { dayKey } from './periodo'
import type { Reserva } from './types'

/** Reserva de teste: serviço concluído de R$ 0 sem motorista, cliente nem veículo; sobrescreva o que importa. */
export function reserva(p: Partial<Reserva> & { saidaRaw?: string } = {}): Reserva {
  const saidaRaw = p.saidaRaw ?? '2026-10-05T15:00:00Z'
  const dia = dayKey(saidaRaw)
  return {
    id: Math.random().toString(36).slice(2), saidaRaw, saidaMs: saidaRaw ? Date.parse(saidaRaw) : NaN, dia, mes: dia.slice(0, 7),
    criadoRaw: '2026-09-01T12:00:00Z', status: 202410008, statusLabel: 'Concluído', fatStatus: null, fatStatusLabel: '—',
    categoriaItem: 100000000, categoriaItemLabel: 'Serviço', tipoVeiculoRaw: '1', tipoVeiculo: 'Executivo', veiculoId: '',
    motoristaId: '', motoristaKey: 'nome:sem motorista', motorista: 'Sem motorista', cliente: 'Sem cliente', cpId: '',
    valor: 0, cpPendente: false, cpConcluida: false, opId: '',
    ...p,
  }
}
