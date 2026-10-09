import { ANOS_MAPA, FAT_FIXO } from '../data/historico'
import { META_FATURAMENTO } from './metas'
import { DIA_MS, diasNoMes, parseDia } from './periodo'

const utc = (s: string) => { const { y, m, d } = parseDia(s); return Date.UTC(y, m, d) }

/** `getTotalForPeriod` do legado: cada mês fixo proporcional aos dias do período que caem nele. */
export function totalFixoNoPeriodo(valores: readonly number[], ano: number, inicio: string, fim: string) {
  const s = utc(inicio)
  const e = utc(fim)
  if (s > e) return 0
  let total = 0
  for (let mes = 0; mes < 12; mes++) {
    const a = Math.max(s, Date.UTC(ano, mes, 1))
    const b = Math.min(e, Date.UTC(ano, mes, diasNoMes(ano, mes)))
    const usados = Math.max(0, Math.floor((b - a) / DIA_MS) + 1)
    if (usados > 0) total += ((valores[mes] || 0) / diasNoMes(ano, mes)) * usados
  }
  return total
}

/** Fallback de `getPeriodValueAndCount`: soma rateada de 2023–2025. */
export const fixoNoPeriodo = (inicio: string, fim: string) =>
  ANOS_MAPA.reduce((total, ano) => total + totalFixoNoPeriodo(FAT_FIXO[ano] ?? [], ano, inicio, fim), 0)

/** `getHistoricalFat` do legado (inclui 2026). */
export const historicoFat = (ano: number, mes: number) => FAT_FIXO[ano]?.[mes] || 0

/** `calcularMetaMensal`: (50% N−1 + 40% N−2 + 10% N−3) × 1,13 (pesos e fator em `META_FATURAMENTO`). */
export function metaMensal(ano: number, mes: number) {
  const base = META_FATURAMENTO.pesos.reduce((s, peso, i) => s + historicoFat(ano - 1 - i, mes) * peso, 0)
  return Math.round(base * META_FATURAMENTO.fator)
}

/** `getMetaParaPeriodoProporcional`: meta mensal rateada pelos dias do período. */
export function metaProporcional(inicio: string, fim: string) {
  const s = utc(inicio)
  const e = utc(fim)
  if (s > e) return 0
  const ini = parseDia(inicio)
  const end = parseDia(fim)
  let meta = 0
  for (let y = ini.y, m = ini.m; y < end.y || (y === end.y && m <= end.m); m === 11 ? (y++, (m = 0)) : m++) {
    const a = Math.max(s, Date.UTC(y, m, 1))
    const b = Math.min(e, Date.UTC(y, m, diasNoMes(y, m)))
    const usados = Math.max(0, Math.floor((b - a) / DIA_MS) + 1)
    meta += (metaMensal(y, m) / diasNoMes(y, m)) * usados
  }
  return Math.round(meta)
}
