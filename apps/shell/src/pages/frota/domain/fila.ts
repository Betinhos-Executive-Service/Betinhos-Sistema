import { daysBetween, diaSP } from '../data/dates'
import type { Manutencao } from '../data/types'

/** Dia do pedido (createdon) em São Paulo. */
export const diaDoPedido = (m: Pick<Manutencao, 'criadoEm'>) => diaSP(m.criadoEm) ?? m.criadoEm.slice(0, 10)

export const diasEsperando = (m: Pick<Manutencao, 'criadoEm'>, hoje: string) => Math.max(0, daysBetween(diaDoPedido(m), hoje))
