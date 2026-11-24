import { addMonths, daysBetween, diaSP } from '../data/dates'
import type { TermoStatus } from '../data/types'
import { janelaCompetencia, mesBr } from './multaEtapas'

export type FormaPagamento = 'guia' | 'folha'
export type Acordo = { forma: FormaPagamento; parcelas: number; valorTotal: number; primeiraCompetencia: string /* 'YYYY-MM-01' */ }
export type Parcela = { numero: number; competencia: string; valor: number }
export type ContextoAcordo = { temAditivo: boolean; recursoPendente: boolean; temMotorista: boolean; termoPendente: boolean }
/** `hoje` e `dataParaIndicar` são `yyyy-MM-dd`; `avisado` = motorista já avisado (a multa saiu da etapa 2). */
export type ContextoEnvio = ContextoAcordo & { hoje: string; dataParaIndicar: string | null; avisado: boolean }
/** Margem, em dias, entre a expiração do termo e o prazo de indicação (igual a `TermoPrazos.MargemAntesDoPrazo`). */
export const MARGEM_ANTES_DO_PRAZO = 3
/** Parcelas de termo novo. Termos antigos com 4 a 12 parcelas continuam legíveis (calcularParcelas aceita até 12). */
export const MAXIMO_PARCELAS_TERMO = 3
const MAXIMO_PARCELAS_HISTORICO = 12

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])-01$/

/** Reais em centavos inteiros; toFixed evita o erro de ponto flutuante (1,005 * 100 = 100.49999...). */
export const emCentavos = (valor: number) => Math.round(Number((valor * 100).toFixed(2)))
const parcelasValidas = (n: number, teto = MAXIMO_PARCELAS_TERMO) => Number.isInteger(n) && n >= 1 && n <= teto

/** Parcelas do desconto em folha, em centavos inteiros: o resto de centavos vai para a última e a soma fecha exata. Guia não parcela; acordo de folha inválido lança erro. */
export function calcularParcelas(a: Acordo): Parcela[] {
  if (a.forma !== 'folha') return []
  if (!parcelasValidas(a.parcelas, MAXIMO_PARCELAS_HISTORICO) || !COMPETENCIA.test(a.primeiraCompetencia)) throw new Error('Acordo de folha inválido.')
  const total = emCentavos(a.valorTotal)
  const base = Math.floor(total / a.parcelas)
  const sobra = total - base * a.parcelas
  return Array.from({ length: a.parcelas }, (_, i) => ({
    numero: i + 1,
    competencia: addMonths(a.primeiraCompetencia, i),
    valor: (base + (i === a.parcelas - 1 ? sobra : 0)) / 100,
  }))
}

/** Primeiro impedimento do envio, na mesma ordem de `ValidarAcordo` do plugin: etapa 2, prazo curto, motorista, aditivo, termo pendente, folha, parcelas, competência, janela e valor. */
export function validarAcordo(a: Acordo, ctx: ContextoEnvio): string | null {
  if (ctx.avisado) return 'O termo só é enviado na etapa 2, antes do aviso ao motorista.'
  if (ctx.dataParaIndicar !== null && daysBetween(ctx.hoje, ctx.dataParaIndicar) < MARGEM_ANTES_DO_PRAZO) return 'Faltam menos de 3 dias para o prazo de indicação; avise pelo WhatsApp.'
  if (!ctx.temMotorista) return 'A multa não tem motorista indicado.'
  if (!ctx.temAditivo) return 'O motorista ainda não tem o aditivo de assinatura eletrônica registrado.'
  if (ctx.termoPendente) return 'Já existe um termo pendente para esta multa.'
  if (a.forma !== 'folha') return 'O termo agora é só para desconto em folha.'
  if (!parcelasValidas(a.parcelas)) return 'Escolha de 1 a 3 parcelas.'
  if (!COMPETENCIA.test(a.primeiraCompetencia)) return 'Competência inválida.'
  const { de, ate } = janelaCompetencia(ctx.hoje)
  if (a.primeiraCompetencia < de || a.primeiraCompetencia > ate) return `Escolha um mês entre ${mesBr(de)} e ${mesBr(ate)}.`
  if (!(emCentavos(a.valorTotal) >= a.parcelas)) return 'Informe um valor maior que zero.'
  if (ctx.recursoPendente) return 'Há recurso pendente: o desconto só pode ser acordado depois do resultado.'
  return null
}

/** Prazo para o motorista assinar ou contestar (decisão de 23/10/2026; o flow de expiração usa o mesmo número). */
export const PRAZO_TERMO_DIAS = 7

/** Dia (São Paulo) em que o termo enviado expira: o que vier primeiro entre 7 dias após o envio e 3 dias antes do prazo de indicação (mesma regra de `TermoPrazos.ExpiraEm`). */
export function expiraEm(enviadoEm: string | null, dataParaIndicar: string | null = null): string | null {
  const dia = diaSP(enviadoEm)
  if (!dia) return null
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + PRAZO_TERMO_DIAS)
  const seteDias = d.toISOString().slice(0, 10)
  if (!dataParaIndicar) return seteDias
  const limite = new Date(`${dataParaIndicar}T12:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() - MARGEM_ANTES_DO_PRAZO)
  const antes = limite.toISOString().slice(0, 10)
  return antes < seteDias ? antes : seteDias
}

/** Tom do badge por status (texto sempre junto: status não depende só de cor). */
export const TERMO_TOM: Record<TermoStatus, 'warning' | 'success' | 'danger' | 'neutral'> = { pendente: 'warning', assinado: 'success', contestado: 'danger', expirado: 'neutral', cancelado: 'neutral' }

export const TERMO_ROTULO: Record<TermoStatus, string> = { pendente: 'Pendente', assinado: 'Assinado', contestado: 'Contestado', expirado: 'Expirado', cancelado: 'Cancelado' }
