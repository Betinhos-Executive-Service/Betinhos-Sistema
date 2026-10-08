import { int } from './format'
import { entre } from './periodo'
import type { AlertaItem, EventoConducao, TelemetriaDia, Tom, Viagem } from './types'

/** Uma linha por (motorista, mês), como `scoreRowsByKey` do `renderDriverSafetyScore` do legado. */
export type LinhaScore = {
  motoristaId: string
  mes: string
  distancia: number
  /** Eventos por 100 km; null sem distância. */
  taxaAceleracao: number | null
  taxaFrenagem: number | null
  /** Minutos ociosos por 100 km; null sem distância ou sem o ocioso conhecido. */
  taxaOcioso: number | null
  suficiente: boolean
  nota: number | null
}
export type ResultadoScore = { media: number | null; validas: number }

const DISTANCIA_MINIMA_KM = 100
const SLUG_ACELERACAO = 'hardacceleration'
const SLUG_FRENAGEM = 'hardbraking'

/** `componentScore` do legado: 100 até o limite bom, 0 a partir do ruim, proporcional entre os dois. */
const componente = (taxa: number, bom: number, ruim: number) => (taxa <= bom ? 100 : taxa >= ruim ? 0 : (100 * (ruim - taxa)) / (ruim - bom))

type Acumulado = { motoristaId: string; mes: string; distancia: number; aceleracao: number; frenagem: number; ocioso: number; ocioConhecido: boolean }

/**
 * Port literal do `renderDriverSafetyScore` (Dashboard.html L15691–15763), sem escopo de veículo. Os três conjuntos entram filtrados
 * pelo dia (`entre`, fim inclusivo); o mês de cada linha é o texto bruto `mes` (sem fuso). O ocioso do veículo só vai para o motorista
 * quando ele é o único motorista daquele veículo no mês.
 */
export function linhasScore(viagens: Viagem[], eventos: EventoConducao[], telemetria: TelemetriaDia[], inicio: string, fim: string): LinhaScore[] {
  const linhas = new Map<string, Acumulado>()
  const garantir = (motoristaId: string, mes: string) => {
    const chave = `${motoristaId}|${mes}`
    let linha = linhas.get(chave)
    if (!linha) { linha = { motoristaId, mes, distancia: 0, aceleracao: 0, frenagem: 0, ocioso: 0, ocioConhecido: false }; linhas.set(chave, linha) }
    return linha
  }
  const motoristasPorVeiculoMes = new Map<string, Set<string>>()
  for (const x of viagens) {
    if (!entre(x.dia, inicio, fim)) continue
    if (!x.motoristaId || !x.veiculoId || !x.mes) continue
    garantir(x.motoristaId, x.mes).distancia += x.distancia
    const chave = `${x.veiculoId}|${x.mes}`
    const motoristas = motoristasPorVeiculoMes.get(chave) ?? new Set<string>()
    motoristas.add(x.motoristaId)
    motoristasPorVeiculoMes.set(chave, motoristas)
  }
  for (const x of eventos) {
    if (!entre(x.dia, inicio, fim)) continue
    if (!x.motoristaId || !x.mes) continue
    const tipo = x.tipo.trim().toLowerCase()
    const linha = garantir(x.motoristaId, x.mes)
    if (tipo === SLUG_ACELERACAO) linha.aceleracao += 1
    if (tipo === SLUG_FRENAGEM) linha.frenagem += 1
  }
  for (const x of telemetria) {
    if (!entre(x.dia, inicio, fim)) continue
    const motoristas = motoristasPorVeiculoMes.get(`${x.veiculoId}|${x.mes}`)
    if (!x.veiculoId || !x.mes || !motoristas || motoristas.size !== 1) continue
    const [motoristaId] = motoristas
    const linha = garantir(motoristaId, x.mes)
    linha.ocioso += x.ociosoMin
    linha.ocioConhecido = true
  }
  return [...linhas.values()].map((l) => {
    const taxaAceleracao = l.distancia ? (l.aceleracao / l.distancia) * 100 : null
    const taxaFrenagem = l.distancia ? (l.frenagem / l.distancia) * 100 : null
    const taxaOcioso = l.distancia && l.ocioConhecido ? (l.ocioso / l.distancia) * 100 : null
    const suficiente = l.distancia >= DISTANCIA_MINIMA_KM && taxaOcioso !== null
    const nota = suficiente
      ? Math.round(componente(taxaAceleracao as number, 0.5, 4) * 0.35 + componente(taxaFrenagem as number, 0.5, 4) * 0.35 + componente(taxaOcioso as number, 5, 25) * 0.3)
      : null
    return { motoristaId: l.motoristaId, mes: l.mes, distancia: l.distancia, taxaAceleracao, taxaFrenagem, taxaOcioso, suficiente, nota }
  })
}

/** Média (arredondada) das notas das linhas suficientes e quantas são; sem nenhuma, a média é null. */
export function scoreMotoristas(viagens: Viagem[], eventos: EventoConducao[], telemetria: TelemetriaDia[], inicio: string, fim: string): ResultadoScore {
  const notas = linhasScore(viagens, eventos, telemetria, inicio, fim).flatMap((l) => (l.suficiente && l.nota !== null ? [l.nota] : []))
  return { media: notas.length ? Math.round(notas.reduce((t, n) => t + n, 0) / notas.length) : null, validas: notas.length }
}

/** Alerta "Score motoristas" da faixa Operação. `indisponivel`: algum dos três conjuntos do Infleet não carregou. */
export function alertaScore(r: ResultadoScore, indisponivel: boolean): AlertaItem {
  const rotulo = 'Score motoristas'
  if (indisponivel) return { id: 'score', valor: '—', rotulo, status: 's/dado', tom: 'neutral' }
  const tom: Tom = r.media === null ? 'warn' : r.media >= 80 ? 'ok' : r.media >= 60 ? 'warn' : 'danger'
  return { id: 'score', valor: r.media === null ? '—' : int(r.media), rotulo, status: `${r.validas} notas válidas`, tom }
}
