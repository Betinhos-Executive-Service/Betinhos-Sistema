import { daysBetween, diaSP } from '../data/dates'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'

/** Dia do pedido (createdon) em São Paulo. */
export const diaDoPedido = (m: Pick<Manutencao, 'criadoEm'>) => diaSP(m.criadoEm) ?? m.criadoEm.slice(0, 10)

export const diasEsperando = (m: Pick<Manutencao, 'criadoEm'>, hoje: string) => Math.max(0, daysBetween(diaDoPedido(m), hoje))

/** Fila "A encaixar" (spec): Solicitado, grau maior primeiro (Urgente, Alta, Média, Baixa; sem grau no fim) e, no mesmo grau, a mais antiga. */
export function filaEncaixe(manutencoes: Manutencao[]): Manutencao[] {
  return manutencoes
    .filter((m) => m.status === MANUT.SOLICITADO)
    .sort((a, b) => (b.grau ?? 0) - (a.grau ?? 0) || a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id))
}
