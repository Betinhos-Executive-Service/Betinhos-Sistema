// domain/vencimento.ts
import { addMonths, daysBetween } from '../../funcionarios/data/dates'
import type { Marco, Status, TipoDoc } from './types'

/** Maior antecedência de aviso (dias). Também vale para os alertas de Funcionários e o card de CNH do Dashboard. */
export const JANELA_DIAS = 60

/** Marco de aviso: vencido (< 0), 7 (0–7), 30 (8–30), 60 (31–60); acima disso nenhum. */
export function marcoDe(dias: number): Marco | null {
  if (dias < 0) return 'vencido'
  if (dias <= 7) return '7'
  if (dias <= 30) return '30'
  if (dias <= JANELA_DIAS) return '60'
  return null
}

const STATUS_DO_MARCO: Record<Marco, Status> = { vencido: 'vencido', '7': 'vence7', '30': 'vence30', '60': 'vence60' }

export function statusDe(validade: string | null, hoje: string, temValidade: boolean): { status: Status; dias: number | null } {
  if (!temValidade || !validade) return { status: 'semValidade', dias: null }
  const dias = daysBetween(hoje, validade)
  const marco = marcoDe(dias)
  return { status: marco ? STATUS_DO_MARCO[marco] : 'ok', dias }
}

export function validadeSugerida(tipo: Pick<TipoDoc, 'temValidade' | 'validadePadraoMeses'>, emissao: string | null) {
  return tipo.temValidade && tipo.validadePadraoMeses && emissao ? addMonths(emissao, tipo.validadePadraoMeses) : null
}

export function rotuloPrazo(dias: number | null) {
  if (dias == null) return ''
  if (dias < 0) return `vencido há ${-dias} dia${dias === -1 ? '' : 's'}`
  if (dias === 0) return 'vence hoje'
  return `vence em ${dias} dia${dias === 1 ? '' : 's'}`
}
