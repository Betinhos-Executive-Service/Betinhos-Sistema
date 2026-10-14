import { JANELA_DIAS } from '../../documentos/domain/vencimento'
import { addMonths, daysBetween, formatBR, nextBirthday } from './dates'

export type AlertKind = 'cnh' | 'aso' | 'aniversario'
export type AlertLevel = 'vencido' | 'critico' | 'atencao' | 'info'

export type Alerta = {
  kind: AlertKind
  level: AlertLevel
  days: number
  date: string
  label: string
}

/** Periodicidade do ASO em meses. Assumido anual; confirmar com o RH. */
export const ASO_VALIDADE_MESES = 12
export const DIAS_CRITICO = 30
export const DIAS_ATENCAO = JANELA_DIAS
export const DIAS_ANIVERSARIO = 7

type AlertSource = {
  status: number | null
  validadeCnh: string | null
  dataAso: string | null
  aniversario: string | null
}

function vencimento(kind: 'cnh' | 'aso', date: string, today: string): Alerta | null {
  const days = daysBetween(today, date)
  const nome = kind === 'cnh' ? 'CNH' : 'ASO'
  if (days < 0) return { kind, level: 'vencido', days, date, label: `${nome} ${kind === 'cnh' ? 'vencida' : 'vencido'} desde ${formatBR(date)}` }
  if (days <= DIAS_CRITICO) return { kind, level: 'critico', days, date, label: days === 0 ? `${nome} vence hoje` : `${nome} vence em ${days} dia${days === 1 ? '' : 's'}` }
  if (days <= DIAS_ATENCAO) return { kind, level: 'atencao', days, date, label: `${nome} vence em ${days} dias` }
  return null
}

export function computeAlertas(source: AlertSource, today: string): Alerta[] {
  if (source.status === 1) return []
  const alertas: Alerta[] = []
  if (source.validadeCnh) {
    const alerta = vencimento('cnh', source.validadeCnh, today)
    if (alerta) alertas.push(alerta)
  }
  if (source.dataAso) {
    const alerta = vencimento('aso', addMonths(source.dataAso, ASO_VALIDADE_MESES), today)
    if (alerta) alertas.push(alerta)
  }
  if (source.aniversario) {
    const date = nextBirthday(source.aniversario, today)
    const days = daysBetween(today, date)
    if (days <= DIAS_ANIVERSARIO) {
      alertas.push({ kind: 'aniversario', level: 'info', days, date, label: days === 0 ? 'Aniversário hoje' : `Aniversário em ${days} dia${days === 1 ? '' : 's'} (${formatBR(date).slice(0, 5)})` })
    }
  }
  return alertas
}
