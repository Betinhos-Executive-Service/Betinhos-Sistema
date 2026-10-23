import { addMonths, diaSP, formatBR } from '../data/dates'
import type { ResumoTermo, TermoStatus } from '../data/types'

export type FormaPagamento = 'guia' | 'folha'
export type Acordo = { forma: FormaPagamento; parcelas: 1 | 2 | 3; valorTotal: number; primeiraCompetencia: string /* 'YYYY-MM-01' */ }
export type Parcela = { numero: number; competencia: string; valor: number }
export type ContextoAcordo = { temAditivo: boolean; recursoPendente: boolean; temMotorista: boolean; termoPendente: boolean }

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])-01$/

/** Reais em centavos inteiros; toFixed evita o erro de ponto flutuante (1,005 * 100 = 100.49999...). */
export const emCentavos = (valor: number) => Math.round(Number((valor * 100).toFixed(2)))
const parcelasValidas = (n: number) => Number.isInteger(n) && n >= 1 && n <= 3

/** Parcelas do desconto em folha, em centavos inteiros: a sobra vai para as primeiras e a soma fecha exata. Guia não parcela; acordo de folha inválido lança erro. */
export function calcularParcelas(a: Acordo): Parcela[] {
  if (a.forma !== 'folha') return []
  if (!parcelasValidas(a.parcelas) || !COMPETENCIA.test(a.primeiraCompetencia)) throw new Error('Acordo de folha inválido.')
  const total = emCentavos(a.valorTotal)
  const base = Math.floor(total / a.parcelas)
  const sobra = total - base * a.parcelas
  return Array.from({ length: a.parcelas }, (_, i) => ({
    numero: i + 1,
    competencia: addMonths(a.primeiraCompetencia, i),
    valor: (base + (i < sobra ? 1 : 0)) / 100,
  }))
}

/** Primeiro impedimento do acordo, ou null quando ele pode ser gerado. */
export function validarAcordo(a: Acordo, ctx: ContextoAcordo): string | null {
  if (!ctx.temMotorista) return 'A multa não tem motorista indicado.'
  if (!ctx.temAditivo) return 'O motorista ainda não tem o aditivo de assinatura eletrônica registrado.'
  if (ctx.termoPendente) return 'Já existe um termo pendente para esta multa.'
  if (!parcelasValidas(a.parcelas)) return 'Escolha de 1 a 3 parcelas.'
  if (!COMPETENCIA.test(a.primeiraCompetencia)) return 'Competência inválida.'
  if (!(emCentavos(a.valorTotal) >= a.parcelas)) return 'Informe um valor maior que zero.'
  if (a.forma === 'folha' && ctx.recursoPendente) return 'Há recurso pendente: o desconto só pode ser acordado depois do resultado.'
  return null
}

/** Prazo para o motorista assinar ou contestar (decisão de 23/10/2026; o flow de expiração usa o mesmo número). */
export const PRAZO_TERMO_DIAS = 7

/** Dia (São Paulo) em que o termo enviado expira. */
export function expiraEm(enviadoEm: string | null): string | null {
  const dia = diaSP(enviadoEm)
  if (!dia) return null
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + PRAZO_TERMO_DIAS)
  return d.toISOString().slice(0, 10)
}

/** Tom do badge por status (texto sempre junto: status não depende só de cor). */
export const TERMO_TOM: Record<TermoStatus, 'warning' | 'success' | 'danger' | 'neutral'> = { pendente: 'warning', assinado: 'success', contestado: 'danger', expirado: 'neutral', cancelado: 'neutral' }

export const TERMO_ROTULO: Record<TermoStatus, string> = { pendente: 'Pendente', assinado: 'Assinado', contestado: 'Contestado', expirado: 'Expirado', cancelado: 'Cancelado' }

/** Texto da coluna Termo da lista de multas. */
export function rotuloTermo(termo: ResumoTermo | null | undefined): string {
  if (!termo) return ''
  const expira = termo.status === 'pendente' ? expiraEm(termo.enviadoEm) : null
  return expira ? `${TERMO_ROTULO.pendente} · expira ${formatBR(expira).slice(0, 5)}` : TERMO_ROTULO[termo.status]
}
