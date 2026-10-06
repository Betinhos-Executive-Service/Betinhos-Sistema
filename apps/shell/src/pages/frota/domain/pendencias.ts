import { daysBetween } from '../data/dates'
import { COLISAO, MANUT, MULTA } from '../data/schema'
import type { FrotaData, Kind, Ref } from '../data/types'

export type PendenciaTipo = 'aprovar' | 'programar' | 'agendada' | 'notificar' | 'indicar' | 'colisao'
export type Pendencia = { tipo: PendenciaTipo; kind: Kind; id: string; titulo: string; veiculo: Ref | null; pessoa: Ref | null; prazo: string | null; dias: number | null; peso: number }

export const PENDENCIA_ORDEM: PendenciaTipo[] = ['aprovar', 'programar', 'agendada', 'notificar', 'indicar', 'colisao']
export const PENDENCIA_LABEL: Record<PendenciaTipo, string> = {
  aprovar: 'Manutenções aguardando aprovação',
  programar: 'Manutenções aprovadas sem data',
  agendada: 'Manutenções aprovadas ou programadas vencidas ou para os próximos 7 dias',
  notificar: 'Multas: notificar o condutor',
  indicar: 'Multas com prazo de indicação vencido ou em até 7 dias',
  colisao: 'Colisões em aberto',
}

const JANELA_DIAS = 7

export function buildPendencias(data: Pick<FrotaData, 'manutencoes' | 'multas' | 'colisoes'>, today: string): Pendencia[] {
  const result: Pendencia[] = []

  for (const item of data.manutencoes) {
    const base = { kind: 'manutencao' as const, id: item.id, titulo: item.descricao, veiculo: item.veiculo, pessoa: item.solicitante }
    if (item.status === MANUT.SOLICITADO) result.push({ ...base, tipo: 'aprovar', prazo: null, dias: null, peso: -(item.grau ?? 0) })
    if (item.status === MANUT.APROVADO && !item.agendarPara) result.push({ ...base, tipo: 'programar', prazo: null, dias: null, peso: -(item.grau ?? 0) })
    if ((item.status === MANUT.APROVADO || item.status === MANUT.PROGRAMADO) && item.agendarPara) {
      const dias = daysBetween(today, item.agendarPara)
      if (dias <= JANELA_DIAS) result.push({ ...base, tipo: 'agendada', prazo: item.agendarPara, dias, peso: dias })
    }
  }

  for (const item of data.multas) {
    const base = { kind: 'multa' as const, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista }
    if (item.status === MULTA.NOTIFICAR) result.push({ ...base, tipo: 'notificar', prazo: item.dataParaIndicar, dias: item.dataParaIndicar ? daysBetween(today, item.dataParaIndicar) : null, peso: item.dataParaIndicar ? daysBetween(today, item.dataParaIndicar) : 9999 })
    if (item.status === MULTA.NOTIFICADO && !item.indicado && item.dataParaIndicar) {
      const dias = daysBetween(today, item.dataParaIndicar)
      if (dias <= JANELA_DIAS) result.push({ ...base, tipo: 'indicar', prazo: item.dataParaIndicar, dias, peso: dias })
    }
  }

  for (const item of data.colisoes) {
    if (item.status === COLISAO.ENVIADO || item.status === COLISAO.ANALISE) {
      result.push({ tipo: 'colisao', kind: 'colisao', id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista, prazo: null, dias: null, peso: item.status === COLISAO.ENVIADO ? 0 : 1 })
    }
  }

  return result
    .map((item, index) => ({ item, index }))
    .sort((a, b) => PENDENCIA_ORDEM.indexOf(a.item.tipo) - PENDENCIA_ORDEM.indexOf(b.item.tipo) || a.item.peso - b.item.peso || a.index - b.index)
    .map(({ item }) => item)
}
