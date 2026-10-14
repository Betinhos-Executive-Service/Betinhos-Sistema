import { addMonths, daysBetween, diaSP } from '../data/dates'
import { MANUT, PROPRIO, VEICULO } from '../data/schema'
import type { Baseline, ItemPlano, Manutencao, Ref, Veiculo } from '../data/types'

export type EstadoPreventiva = 'vencido' | 'a_vencer' | 'em_dia' | 'sem_base'
/** `complementadaPorBaseline`: a manutenção não tinha km ou data e o campo veio da última execução informada. */
export type UltimaExecucao = { km: number | null; data: string | null; origem: 'manutencao' | 'baseline'; manutencaoId: string | null; complementadaPorBaseline: boolean }
export type Preventiva = {
  veiculo: Ref; item: ItemPlano; estado: EstadoPreventiva; emAndamento: boolean
  kmAtual: number | null; kmEstimado: boolean
  kmProxima: number | null; dataProxima: string | null; faltamKm: number | null; faltamDias: number | null
  ultima: UltimaExecucao | null
}
export type VeiculoPrev = Pick<Veiculo, 'id' | 'placa' | 'status' | 'categoria' | 'hodometro' | 'hodometroEm'>
export type ManutencaoPrev = Pick<Manutencao, 'id' | 'status' | 'dataManutencao' | 'criadoEm' | 'km' | 'veiculo' | 'servicos'>
export type EntradaPreventiva = { veiculos: VeiculoPrev[]; manutencoes: ManutencaoPrev[]; itens: ItemPlano[]; baselines: Baseline[] }

export const ESTADO_ORDEM: EstadoPreventiva[] = ['vencido', 'a_vencer', 'em_dia', 'sem_base']
export const ESTADO_LABEL: Record<EstadoPreventiva, string> = { vencido: 'Vencido', a_vencer: 'A vencer', em_dia: 'Em dia', sem_base: 'Sem base' }
export const ESTADO_TONE: Record<EstadoPreventiva, 'danger' | 'warning' | 'success' | 'neutral'> = { vencido: 'danger', a_vencer: 'warning', em_dia: 'success', sem_base: 'neutral' }

const EM_ANDAMENTO: number[] = [MANUT.SOLICITADO, MANUT.APROVADO, MANUT.PROGRAMADO]

/** Km atual do veículo: hodômetro Infleet; sem ele, o maior km das manutenções (estimado). */
export function kmAtualDe(veiculo: VeiculoPrev, manutencoes: ManutencaoPrev[]): { km: number | null; estimado: boolean } {
  if (veiculo.hodometro !== null) return { km: veiculo.hodometro, estimado: false }
  const kms = manutencoes.filter((m) => m.veiculo?.id === veiculo.id && m.km !== null).map((m) => m.km as number)
  return kms.length ? { km: Math.max(...kms), estimado: true } : { km: null, estimado: false }
}

function ultimaExecucao(item: ItemPlano, doVeiculo: ManutencaoPrev[], baseline: Baseline | undefined): UltimaExecucao | null {
  let melhor: { m: ManutencaoPrev; dia: string } | null = null
  for (const m of doVeiculo) {
    if (m.status !== MANUT.REALIZADO || item.servico === null || !m.servicos.includes(item.servico)) continue
    const dia = diaSP(m.dataManutencao ?? m.criadoEm)
    if (dia && (!melhor || dia > melhor.dia)) melhor = { m, dia }
  }
  if (melhor) {
    // A data sempre existe (manutenção sem dia não entra); o km pode faltar e vir da última execução informada,
    // só se ela não for anterior à manutenção (baseline mais antiga daria um km velho para uma execução nova).
    const baselineValida = baseline && (baseline.data === null || baseline.data >= melhor.dia) ? baseline : undefined
    const km = melhor.m.km ?? baselineValida?.km ?? null
    return { km, data: melhor.dia, origem: 'manutencao', manutencaoId: melhor.m.id, complementadaPorBaseline: melhor.m.km === null && km !== null }
  }
  if (baseline && (baseline.km !== null || baseline.data !== null)) return { km: baseline.km, data: baseline.data, origem: 'baseline', manutencaoId: null, complementadaPorBaseline: false }
  return null
}

function calcular(veiculo: VeiculoPrev, item: ItemPlano, entrada: EntradaPreventiva, today: string): Preventiva {
  const doVeiculo = entrada.manutencoes.filter((m) => m.veiculo?.id === veiculo.id)
  const baseline = entrada.baselines.find((b) => b.veiculo?.id === veiculo.id && b.item?.id === item.id)
  const ultima = ultimaExecucao(item, doVeiculo, baseline)
  const { km: kmAtual, estimado: kmEstimado } = kmAtualDe(veiculo, doVeiculo)
  const emAndamento = item.servico !== null && doVeiculo.some((m) => m.status !== null && EM_ANDAMENTO.includes(m.status) && m.servicos.includes(item.servico as number))
  const kmProxima = ultima?.km != null && item.intervaloKm !== null ? ultima.km + item.intervaloKm : null
  const dataProxima = ultima?.data && item.intervaloMeses !== null ? addMonths(ultima.data, item.intervaloMeses) : null
  const faltamKm = kmProxima !== null && kmAtual !== null ? kmProxima - kmAtual : null
  const faltamDias = dataProxima ? daysBetween(today, dataProxima) : null
  let estado: EstadoPreventiva = 'sem_base'
  if (faltamKm !== null || faltamDias !== null) {
    if ((faltamKm !== null && faltamKm < 0) || (faltamDias !== null && faltamDias < 0)) estado = 'vencido'
    else if ((faltamKm !== null && faltamKm <= item.avisoKm) || (faltamDias !== null && faltamDias <= item.avisoDias)) estado = 'a_vencer'
    else estado = 'em_dia'
  }
  return { veiculo: { id: veiculo.id, label: veiculo.placa }, item, estado, emAndamento, kmAtual, kmEstimado, kmProxima, dataProxima, faltamKm, faltamDias, ultima }
}

function ordenar(lista: Preventiva[]): Preventiva[] {
  return lista.sort((a, b) =>
    ESTADO_ORDEM.indexOf(a.estado) - ESTADO_ORDEM.indexOf(b.estado)
    || (a.faltamDias ?? Infinity) - (b.faltamDias ?? Infinity)
    || (a.faltamKm ?? Infinity) - (b.faltamKm ?? Infinity)
    || a.veiculo.label.localeCompare(b.veiculo.label))
}

function montar(entrada: EntradaPreventiva, veiculos: VeiculoPrev[], today: string): Preventiva[] {
  const itens = entrada.itens.filter((item) => item.ativo)
  return ordenar(veiculos.flatMap((veiculo) => itens.map((item) => calcular(veiculo, item, entrada, today))))
}

/** Todas as preventivas de todo veículo Ativo e Próprio × item ativo, ordenadas por estado, depois por faltamDias/faltamKm. */
export function calcularPreventivas(entrada: EntradaPreventiva, today: string): Preventiva[] {
  return montar(entrada, entrada.veiculos.filter((v) => v.status === VEICULO.ATIVO && v.categoria === PROPRIO), today)
}

/** Preventivas de um veículo, mesmo fora do escopo (a ficha de um carro vendido mostra a lista). */
export function preventivasDoVeiculo(entrada: EntradaPreventiva, veiculoId: string, today: string): Preventiva[] {
  return montar(entrada, entrada.veiculos.filter((v) => v.id === veiculoId), today)
}

/** Vencidas e a vencer, só entre as que não têm manutenção em andamento. */
export function resumoPreventivas(lista: Preventiva[]): { vencidas: number; aVencer: number } {
  const abertas = lista.filter((p) => !p.emAndamento)
  return { vencidas: abertas.filter((p) => p.estado === 'vencido').length, aVencer: abertas.filter((p) => p.estado === 'a_vencer').length }
}
