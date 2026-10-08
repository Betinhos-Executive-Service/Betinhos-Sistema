import { MESES_CURTOS } from './codes'
import type { Atalho } from './types'

export const DIA_MS = 86_400_000
const BRT_MS = 3 * 3_600_000

/** `businessDateKey` do legado: dia em Brasília; data pura passa direto. */
export function dayKey(raw: string | null | undefined): string {
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? new Date(ms - BRT_MS).toISOString().slice(0, 10) : ''
}
export const hojeBR = (now: Date) => new Date(now.getTime() - BRT_MS).toISOString().slice(0, 10)
export const entre = (dia: string, inicio: string, fim: string) => dia !== '' && dia >= inicio && dia <= fim
/** 00:00 do dia em Brasília. */
export const inicioMs = (dia: string) => Date.parse(`${dia}T00:00:00-03:00`)

export type Ymd = { y: number; m: number; d: number }
/** Mês 0-based, como `Date`. */
export function parseDia(s: string): Ymd {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m: m - 1, d }
}
export const diasNoMes = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
/** Monta AAAA-MM-DD normalizando estouro de mês/dia (dia 0 = último do mês anterior). */
export const fmtDia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
/** `clampDate` do legado: normaliza o mês e limita o dia ao fim dele. */
function clamp(y: number, m: number, d: number) {
  const ref = new Date(Date.UTC(y, m, 1))
  const yy = ref.getUTCFullYear()
  const mm = ref.getUTCMonth()
  return fmtDia(yy, mm, Math.min(d, diasNoMes(yy, mm)))
}

export type Periodo = { inicio: string; fim: string }

/** `quickFilter` do legado; o fim padrão é hoje em Brasília. */
export function atalho(kind: Exclude<Atalho, 'personalizado'>, now: Date): Periodo {
  const hoje = hojeBR(now)
  const { y, m, d } = parseDia(hoje)
  switch (kind) {
    case 'hoje': return { inicio: hoje, fim: hoje }
    case 'ult7': return { inicio: fmtDia(y, m, d - 6), fim: hoje }
    case 'ult30': return { inicio: fmtDia(y, m, d - 29), fim: hoje }
    case 'esteMes': return { inicio: fmtDia(y, m, 1), fim: hoje }
    case 'mesAnt': return { inicio: fmtDia(y, m - 1, 1), fim: fmtDia(y, m, 0) }
    case 'esteAno': return { inicio: `${y}-01-01`, fim: hoje }
    case 'anoAnt': return { inicio: `${y - 1}-01-01`, fim: `${y - 1}-12-31` }
  }
}

/** `samePeriodLastMonth` do legado. */
export function periodoMesAnterior(inicio: string, fim: string): Periodo {
  const s = parseDia(inicio)
  const e = parseDia(fim)
  if (s.d === 1 && e.d === diasNoMes(e.y, e.m)) return { inicio: fmtDia(s.y, s.m - 1, 1), fim: fmtDia(e.y, e.m, 0) }
  return { inicio: clamp(s.y, s.m - 1, s.d), fim: clamp(e.y, e.m - 1, e.d) }
}

/**
 * Janela do filtro deslocada para terminar no ano `ano`, mantendo a diferença de anos entre início e fim
 * (filtro de dez a jan continua cruzando o ano) e limitando 29/02. Com `ano` igual ao do fim, devolve o próprio filtro.
 */
export function periodoNoAno(inicio: string, fim: string, ano: number): Periodo {
  const s = parseDia(inicio)
  const e = parseDia(fim)
  return { inicio: clamp(ano - (e.y - s.y), s.m, s.d), fim: clamp(ano, e.m, e.d) }
}

/** `samePeriodLastYear` do legado. */
export function periodoAnoAnterior(inicio: string, fim: string): Periodo {
  const s = parseDia(inicio)
  const e = parseDia(fim)
  return { inicio: clamp(s.y - 1, s.m, s.d), fim: clamp(e.y - 1, e.m, e.d) }
}

/** `shouldShowLM` do legado: o filtro inteiro dentro do mês corrente. */
export function mostrarLM(inicio: string, fim: string, now: Date) {
  const h = parseDia(hojeBR(now))
  const s = parseDia(inicio)
  const e = parseDia(fim)
  return s.y === h.y && e.y === h.y && s.m === h.m && e.m === h.m
}

/** Primeiro dia carregado: cobre LY do filtro e os três anos do gráfico de total produzido. */
export function cargaDesde(inicio: string, now: Date) {
  return `${Math.min(parseDia(inicio).y - 1, parseDia(hojeBR(now)).y - 2)}-01-01`
}

/** `monthTableLabel` do legado: "mar/26". */
export function mesRotulo(mes: string) {
  const [y, m] = mes.split('-')
  return `${MESES_CURTOS[Number(m) - 1] ?? m}/${y.slice(2)}`
}

/** Os 12 meses (AAAA-MM) de um ano. */
export const mesesDoAno = (ano: number) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
