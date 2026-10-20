import { daysBetween, diaSP } from '../data/dates'
import { MANUT, VEICULO } from '../data/schema'
import type { Manutencao, Ref, Veiculo } from '../data/types'
import { SERVICOS_MANUT } from './manutencaoCatalogo'

/** Limiares das regras proativas da frota (spec 2026-10-20-frota-proativa). A Custom API usa os mesmos valores. */
export const LIMIARES = {
  reincidenciaCurta: { vezes: 3, dias: 120 },
  reincidenciaLonga: { vezes: 5, dias: 365 },
  prioridadeGrauMinimo: 3,
  solicitadoParadoDias: 2,
  aprovadoSemDataDias: 5,
  hodometroHoras: 48,
  custoJanelaDias: 90,
  custoFatorMediana: 1.5,
  custoMinimoVeiculos: 3,
} as const

const ANULADAS: number[] = [MANUT.CANCELADO, MANUT.REPROVADO]
const diaDe = (m: Manutencao) => diaSP(m.dataManutencao) ?? diaSP(m.criadoEm) ?? m.criadoEm.slice(0, 10)
const rotuloServico = (valor: number) => SERVICOS_MANUT.find((s) => s.value === valor)?.label ?? `Serviço ${valor}`
const ativo = (v: Veiculo) => v.status !== VEICULO.VENDIDO

export type Ocorrencia = { id: string; dia: string; estabelecimento: string | null; valor: number | null }
export type Reincidencia = { veiculo: Ref; servico: number; servicoLabel: string; vezes: number; janelaDias: number; custo: number; ocorrencias: Ocorrencia[] }

/** Mesmo serviço classificado no mesmo veículo repetido além do limiar curto ou do longo; vale a janela que disparar primeiro. */
export function reincidencias(manutencoes: Manutencao[], today: string): Reincidencia[] {
  const grupos = new Map<string, { veiculo: Ref; servico: number; itens: Manutencao[] }>()
  for (const m of manutencoes) {
    if (!m.veiculo || (m.status !== null && ANULADAS.includes(m.status))) continue
    for (const servico of new Set(m.servicos)) {
      const chave = `${m.veiculo.id}:${servico}`
      const grupo = grupos.get(chave) ?? { veiculo: m.veiculo, servico, itens: [] }
      grupo.itens.push(m)
      grupos.set(chave, grupo)
    }
  }
  const result: Reincidencia[] = []
  for (const { veiculo, servico, itens } of grupos.values()) {
    for (const { vezes, dias } of [LIMIARES.reincidenciaCurta, LIMIARES.reincidenciaLonga]) {
      const naJanela = itens.filter((m) => { const d = daysBetween(diaDe(m), today); return d >= 0 && d <= dias })
      if (naJanela.length < vezes) continue
      const ocorrencias = naJanela.map((m) => ({ id: m.id, dia: diaDe(m), estabelecimento: m.estabelecimento, valor: m.valor })).sort((a, b) => b.dia.localeCompare(a.dia))
      result.push({ veiculo, servico, servicoLabel: rotuloServico(servico), vezes: naJanela.length, janelaDias: dias, custo: ocorrencias.reduce((s, o) => s + (o.valor ?? 0), 0), ocorrencias })
      break
    }
  }
  return result.sort((a, b) => b.vezes - a.vezes || b.custo - a.custo)
}

/** Alta/Urgente parada: Solicitada há mais de N dias ou Aprovada sem data há mais de M dias (contados da criação). */
export function prioridadeParada(m: Manutencao, today: string): number | null {
  if ((m.grau ?? 0) < LIMIARES.prioridadeGrauMinimo) return null
  const dias = daysBetween(diaSP(m.criadoEm) ?? m.criadoEm.slice(0, 10), today)
  if (m.status === MANUT.SOLICITADO && dias > LIMIARES.solicitadoParadoDias) return dias
  if (m.status === MANUT.APROVADO && !m.agendarPara && dias > LIMIARES.aprovadoSemDataDias) return dias
  return null
}

/** Veículo ativo com hodômetro do Infleet parado há mais do limiar; sem leitura nenhuma não entra (veículo fora do Infleet). */
export function hodometrosAtrasados(veiculos: Veiculo[], agora: Date): { veiculo: Veiculo; horas: number }[] {
  return veiculos
    .filter((v) => ativo(v) && v.hodometroEm)
    .map((v) => ({ veiculo: v, horas: Math.floor((agora.getTime() - new Date(v.hodometroEm as string).getTime()) / 3_600_000) }))
    .filter((x) => x.horas > LIMIARES.hodometroHoras)
    .sort((a, b) => b.horas - a.horas)
}

/** Custo de manutenções realizadas na janela acima de N× a mediana dos veículos com custo; exige um mínimo de veículos. */
export function custoForaDaCurva(veiculos: Veiculo[], manutencoes: Manutencao[], today: string): { veiculo: Veiculo; custo: number; mediana: number }[] {
  const porVeiculo = new Map<string, number>()
  for (const m of manutencoes) {
    if (m.status !== MANUT.REALIZADO || !m.veiculo || !m.valor) continue
    const d = daysBetween(diaDe(m), today)
    if (d < 0 || d > LIMIARES.custoJanelaDias) continue
    porVeiculo.set(m.veiculo.id, (porVeiculo.get(m.veiculo.id) ?? 0) + m.valor)
  }
  const custos = veiculos.filter(ativo).map((v) => porVeiculo.get(v.id) ?? 0).filter((c) => c > 0).sort((a, b) => a - b)
  if (custos.length < LIMIARES.custoMinimoVeiculos) return []
  const meio = Math.floor(custos.length / 2)
  const mediana = custos.length % 2 ? custos[meio] : (custos[meio - 1] + custos[meio]) / 2
  return veiculos
    .filter(ativo)
    .map((v) => ({ veiculo: v, custo: porVeiculo.get(v.id) ?? 0, mediana }))
    .filter((x) => x.custo > mediana * LIMIARES.custoFatorMediana)
    .sort((a, b) => b.custo - a.custo)
}
