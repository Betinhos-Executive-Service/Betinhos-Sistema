import { daysBetween } from '../data/dates'
import { COLISAO, MANUT, MULTA } from '../data/schema'
import type { FrotaData, Kind, Ref } from '../data/types'
import { calcularPreventivas, type EstadoPreventiva, type Preventiva } from './preventiva'

export type PendenciaTipo = 'aprovar' | 'preventiva' | 'programar' | 'agendada' | 'notificar' | 'indicar' | 'colisao'
export type CriterioPreventiva = 'km' | 'data'
/** `estado` e `criterio` só existem na preventiva (null nos outros tipos); `criterio` é a regra que decide o badge. */
export type Pendencia = { tipo: PendenciaTipo; kind: Kind | 'preventiva'; id: string; titulo: string; veiculo: Ref | null; veiculoId: string | null; pessoa: Ref | null; prazo: string | null; dias: number | null; faltamKm: number | null; peso: number; estado: EstadoPreventiva | null; criterio: CriterioPreventiva | null }

export const PENDENCIA_ORDEM: PendenciaTipo[] = ['aprovar', 'preventiva', 'programar', 'agendada', 'notificar', 'indicar', 'colisao']
export const PENDENCIA_LABEL: Record<PendenciaTipo, string> = {
  aprovar: 'Manutenções aguardando aprovação',
  preventiva: 'Preventivas vencidas ou a vencer (plano da frota)',
  programar: 'Manutenções aprovadas sem data',
  agendada: 'Manutenções aprovadas ou programadas vencidas ou para os próximos 7 dias',
  notificar: 'Multas: notificar o condutor',
  indicar: 'Multas com prazo de indicação vencido ou em até 7 dias',
  colisao: 'Colisões em aberto',
}

const JANELA_DIAS = 7
const SEM_PREVENTIVA = { estado: null, criterio: null } as const

/**
 * Regra que decide a preventiva: a vencida (km antes de data, como na ficha); sem vencida, a que tem menos folga em relação
 * ao próprio aviso; com uma regra só, ela.
 */
export function criterioPreventiva(p: Pick<Preventiva, 'faltamKm' | 'faltamDias' | 'item'>): CriterioPreventiva | null {
  const { faltamKm, faltamDias } = p
  if (faltamKm !== null && faltamKm < 0) return 'km'
  if (faltamDias !== null && faltamDias < 0) return 'data'
  if (faltamKm === null) return faltamDias === null ? null : 'data'
  if (faltamDias === null) return 'km'
  return faltamKm / Math.max(p.item.avisoKm, 1) <= faltamDias / Math.max(p.item.avisoDias, 1) ? 'km' : 'data'
}

/** Vencida: -1000 mais o mais negativo entre km e dias; a vencer: o menor dos dois. */
function pesoPreventiva(p: Pick<Preventiva, 'estado' | 'faltamKm' | 'faltamDias'>): number {
  const valores = [p.faltamKm, p.faltamDias].filter((v): v is number => v !== null)
  if (p.estado === 'vencido') return -1000 + Math.min(...valores.filter((v) => v < 0))
  return Math.min(p.faltamDias ?? Infinity, p.faltamKm ?? Infinity)
}

export function buildPendencias(data: Pick<FrotaData, 'manutencoes' | 'multas' | 'colisoes' | 'veiculos' | 'planoPreventivo' | 'baselines'>, today: string): Pendencia[] {
  const result: Pendencia[] = []

  for (const item of data.manutencoes) {
    const base = { kind: 'manutencao' as const, id: item.id, titulo: item.descricao, veiculo: item.veiculo, pessoa: item.solicitante, veiculoId: item.veiculo?.id ?? null, faltamKm: null, ...SEM_PREVENTIVA }
    if (item.status === MANUT.SOLICITADO) result.push({ ...base, tipo: 'aprovar', prazo: null, dias: null, peso: -(item.grau ?? 0) })
    if (item.status === MANUT.APROVADO && !item.agendarPara) result.push({ ...base, tipo: 'programar', prazo: null, dias: null, peso: -(item.grau ?? 0) })
    if ((item.status === MANUT.APROVADO || item.status === MANUT.PROGRAMADO) && item.agendarPara) {
      const dias = daysBetween(today, item.agendarPara)
      if (dias <= JANELA_DIAS) result.push({ ...base, tipo: 'agendada', prazo: item.agendarPara, dias, peso: dias })
    }
  }

  for (const item of data.multas) {
    const base = { kind: 'multa' as const, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista, veiculoId: item.veiculo?.id ?? null, faltamKm: null, ...SEM_PREVENTIVA }
    if (item.status === MULTA.NOTIFICAR) result.push({ ...base, tipo: 'notificar', prazo: item.dataParaIndicar, dias: item.dataParaIndicar ? daysBetween(today, item.dataParaIndicar) : null, peso: item.dataParaIndicar ? daysBetween(today, item.dataParaIndicar) : 9999 })
    if (item.status === MULTA.NOTIFICADO && !item.indicado && item.dataParaIndicar) {
      const dias = daysBetween(today, item.dataParaIndicar)
      if (dias <= JANELA_DIAS) result.push({ ...base, tipo: 'indicar', prazo: item.dataParaIndicar, dias, peso: dias })
    }
  }

  for (const item of data.colisoes) {
    if (item.status === COLISAO.ENVIADO || item.status === COLISAO.ANALISE) {
      result.push({ tipo: 'colisao', kind: 'colisao', id: item.id, titulo: item.titulo, veiculo: item.veiculo, veiculoId: item.veiculo?.id ?? null, pessoa: item.motorista, prazo: null, dias: null, faltamKm: null, peso: item.status === COLISAO.ENVIADO ? 0 : 1, ...SEM_PREVENTIVA })
    }
  }

  const preventivas = calcularPreventivas({ veiculos: data.veiculos, manutencoes: data.manutencoes, itens: data.planoPreventivo, baselines: data.baselines }, today)
  for (const p of preventivas) {
    if ((p.estado !== 'vencido' && p.estado !== 'a_vencer') || p.emAndamento) continue
    result.push({
      tipo: 'preventiva', kind: 'preventiva', id: `${p.veiculo.id}:${p.item.id}`, titulo: `${p.item.nome} · ${p.veiculo.label}`,
      veiculo: p.veiculo, veiculoId: p.veiculo.id, pessoa: null, prazo: p.dataProxima, dias: p.faltamDias, faltamKm: p.faltamKm,
      peso: pesoPreventiva(p), estado: p.estado, criterio: criterioPreventiva(p),
    })
  }

  return result
    .map((item, index) => ({ item, index }))
    .sort((a, b) => PENDENCIA_ORDEM.indexOf(a.item.tipo) - PENDENCIA_ORDEM.indexOf(b.item.tipo) || a.item.peso - b.item.peso || a.index - b.index)
    .map(({ item }) => item)
}
