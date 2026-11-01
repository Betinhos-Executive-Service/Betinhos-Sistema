import { agruparPorVeiculo, chaveVeiculo, type Trecho } from './indicadores'
import type { Abastecimento, Veiculo } from './types'

export type TipoAnomalia = 'tanque' | 'consumo' | 'intervalo'
export type Anomalia = {
  id: string
  abastecimento: Abastecimento
  tipo: TipoAnomalia
  gravidade: 'alta' | 'media'
  motivo: string
}
export const ANOMALIA_ROTULO: Record<TipoAnomalia, string> = { tanque: 'Acima do tanque', consumo: 'Consumo fora da curva', intervalo: 'Dois em menos de 1 h' }

/** Trechos mínimos para o histórico do veículo valer como referência de consumo. */
export const MIN_TRECHOS = 4
export const INTERVALO_MIN = 60
export const DESVIO_MIN = 0.1
const fmt = (n: number, casas = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Regras fixas, na ordem: litros acima da capacidade do tanque; km/l fora de 2 desvios do próprio veículo; dois abastecimentos em menos de 1 h. */
export function detectarAnomalias(lista: Abastecimento[], ts: Trecho[], veiculos: Veiculo[]): Anomalia[] {
  const capacidade = new Map(veiculos.map((v) => [v.id, v.capacidadeTanque]))
  const out: Anomalia[] = []
  for (const a of lista) {
    const cap = a.veiculoId ? capacidade.get(a.veiculoId) : null
    if (cap && a.litros != null && a.litros > cap) out.push({ id: `tanque:${a.id}`, abastecimento: a, tipo: 'tanque', gravidade: 'alta', motivo: `${fmt(a.litros)} L em um tanque de ${cap} L` })
  }
  const porVeiculo = new Map<string, Trecho[]>()
  for (const t of ts) { const k = chaveVeiculo(t.ate); porVeiculo.set(k, [...(porVeiculo.get(k) ?? []), t]) }
  // Cada trecho é comparado com os demais do veículo (sem ele, senão o próprio desvio o esconderia); histórico
  // muito regular ganha um desvio mínimo de 10% da média para não acusar variações pequenas.
  for (const grupo of porVeiculo.values()) {
    if (grupo.length < MIN_TRECHOS) continue
    for (const t of grupo) {
      const outros = grupo.filter((o) => o !== t).map((o) => o.kmPorLitro)
      const media = outros.reduce((s, v) => s + v, 0) / outros.length
      const desvio = Math.max(Math.sqrt(outros.reduce((s, v) => s + (v - media) ** 2, 0) / outros.length), media * DESVIO_MIN)
      if (Math.abs(t.kmPorLitro - media) > 2 * desvio) out.push({ id: `consumo:${t.ate.id}`, abastecimento: t.ate, tipo: 'consumo', gravidade: 'media', motivo: `${fmt(t.kmPorLitro)} km/l; histórico do veículo ${fmt(media)} ± ${fmt(desvio)}` })
    }
  }
  for (const grupo of agruparPorVeiculo(lista).values()) {
    for (let i = 1; i < grupo.length; i++) {
      const minutos = (grupo[i].data.getTime() - grupo[i - 1].data.getTime()) / 60000
      if (minutos < INTERVALO_MIN) out.push({ id: `intervalo:${grupo[i].id}`, abastecimento: grupo[i], tipo: 'intervalo', gravidade: 'media', motivo: `${Math.round(minutos)} min depois do anterior (${hora(grupo[i - 1].data)} e ${hora(grupo[i].data)})` })
    }
  }
  return out.sort((a, b) => b.abastecimento.data.getTime() - a.abastecimento.data.getTime())
}
