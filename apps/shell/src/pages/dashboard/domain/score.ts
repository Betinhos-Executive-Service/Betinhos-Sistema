import { int } from './format'
import { entre, mesRotulo } from './periodo'
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
  /** Nota (0–100, sem arredondar) de cada componente; null quando a linha não é suficiente. */
  notaAceleracao: number | null
  notaFrenagem: number | null
  notaOcioso: number | null
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
    const notaAceleracao = suficiente ? componente(taxaAceleracao as number, 0.5, 4) : null
    const notaFrenagem = suficiente ? componente(taxaFrenagem as number, 0.5, 4) : null
    const notaOcioso = suficiente ? componente(taxaOcioso as number, 5, 25) : null
    const nota = suficiente ? Math.round((notaAceleracao as number) * 0.35 + (notaFrenagem as number) * 0.35 + (notaOcioso as number) * 0.3) : null
    return { motoristaId: l.motoristaId, mes: l.mes, distancia: l.distancia, taxaAceleracao, taxaFrenagem, taxaOcioso, suficiente, nota, notaAceleracao, notaFrenagem, notaOcioso }
  })
}

/** Média (arredondada) das notas das linhas suficientes e quantas são; sem nenhuma, a média é null. */
export function scoreMotoristas(viagens: Viagem[], eventos: EventoConducao[], telemetria: TelemetriaDia[], inicio: string, fim: string): ResultadoScore {
  const notas = linhasScore(viagens, eventos, telemetria, inicio, fim).flatMap((l) => (l.suficiente && l.nota !== null ? [l.nota] : []))
  return { media: notas.length ? Math.round(notas.reduce((t, n) => t + n, 0) / notas.length) : null, validas: notas.length }
}

/** Ordem da tabela "Score por motorista e mês" do legado: mês desc, nota desc (sem nota conta como -1) e km desc. */
export const ordenarLinhasScore = (linhas: LinhaScore[]) =>
  [...linhas].sort((a, b) => b.mes.localeCompare(a.mes) || (b.nota ?? -1) - (a.nota ?? -1) || b.distancia - a.distancia)

export type PosicaoMensal = { motoristaId: string; nome: string; nota: number; distancia: number }
export type RankingMes = { mes: string; rotulo: string; ranking: PosicaoMensal[] }

/** `tblTopMotMonthly`: por mês (em ordem), as 5 maiores notas válidas; desempate por km desc e depois pelo nome. */
export function rankingMensal(linhas: LinhaScore[], nome: (motoristaId: string) => string): RankingMes[] {
  const validas = linhas.filter((l) => l.suficiente && l.nota !== null)
  return [...new Set(validas.map((l) => l.mes))].sort().map((mes) => ({
    mes,
    rotulo: mesRotulo(mes),
    ranking: validas
      .filter((l) => l.mes === mes)
      .sort((a, b) => (b.nota as number) - (a.nota as number) || b.distancia - a.distancia || nome(a.motoristaId).localeCompare(nome(b.motoristaId)))
      .slice(0, 5)
      .map((l) => ({ motoristaId: l.motoristaId, nome: nome(l.motoristaId), nota: l.nota as number, distancia: l.distancia })),
  }))
}

export type NotaMes = { mes: string; rotulo: string; nota: number; validas: number }

/** `cDriverSafetyScore`: média (sem arredondar, como o gráfico do legado) das notas válidas de cada mês, meses em ordem. */
export function notaPorMes(linhas: LinhaScore[]): NotaMes[] {
  const porMes = new Map<string, number[]>()
  for (const l of linhas) {
    if (!l.suficiente || l.nota === null) continue
    const notas = porMes.get(l.mes) ?? []
    notas.push(l.nota)
    porMes.set(l.mes, notas)
  }
  return [...porMes.keys()].sort().map((mes) => {
    const notas = porMes.get(mes) ?? []
    return { mes, rotulo: mesRotulo(mes), nota: notas.reduce((t, n) => t + n, 0) / notas.length, validas: notas.length }
  })
}

/** Alerta "Score motoristas" da faixa Operação. `indisponivel`: algum dos três conjuntos do Infleet não carregou. */
export function alertaScore(r: ResultadoScore, indisponivel: boolean): AlertaItem {
  const rotulo = 'Score motoristas'
  if (indisponivel) return { id: 'score', valor: '—', rotulo, status: 's/dado', tom: 'neutral' }
  const tom: Tom = r.media === null ? 'warn' : r.media >= 80 ? 'ok' : r.media >= 60 ? 'warn' : 'danger'
  return { id: 'score', valor: r.media === null ? '—' : int(r.media), rotulo, status: `${r.validas} notas válidas`, tom }
}
