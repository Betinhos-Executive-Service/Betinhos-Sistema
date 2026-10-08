import { ANOS_MAPA, FAT_FIXO } from '../data/historico'
import { MESES_CURTOS, MESES_TITULO } from './codes'
import { agrupar, mesesComDados, soma, temSegmento } from './base'
import { brl, brlS, dec, int, stL } from './format'
import { chipOuSemDado, chipValor, produzido, semDado, ticketDoPeriodo, ticketStats, valorDoPeriodo, type Comparacao, type Contexto } from './kpis'
import { metaMensal, metaProporcional, totalFixoNoPeriodo } from './meta'
import { diasNoMes, fmtDia, hojeBR, mesRotulo, mesesDoAno, parseDia, periodoNoAno } from './periodo'
import type { Apoio, Chip, Reserva } from './types'

export type Destaque = { valor: string; sub: string; chips: Chip[]; apoio: Apoio[] }
const anoAtual = (now: Date) => parseDia(hojeBR(now)).y
const naoNulos = (chips: (Chip | null)[]) => chips.filter((c): c is Chip => c !== null)

/** `topByShare`: dos 10 primeiros, os acima de 10%; se ficarem menos de 3, os 3 primeiros. */
export function topByShare<T>(rows: T[], total: number, valor: (r: T) => number, max = 10): T[] {
  const ranked = rows.slice(0, max)
  if (!total || ranked.length <= 3) return ranked
  const eleg = ranked.filter((r) => (valor(r) / total) * 100 > 10)
  return eleg.length >= 3 ? eleg : ranked.slice(0, 3)
}

/** Meses do recorte; sem serviço, os 12 do ano corrente. */
export const mesesOuAno = (rv: Reserva[], now: Date) => { const m = mesesComDados(rv); return m.length ? m : mesesDoAno(anoAtual(now)) }

export type TotalProduzido = Destaque & { anos: [number, number, number]; pontos: { rotulo: string; valores: (number | null)[] }[] }

/**
 * Compara os mesmos meses em cada ano: para cada ano do gráfico, o filtro é deslocado para esse ano (`periodoNoAno`)
 * e a série mensal sai dessa janela. O legado aplicava as datas do filtro a cada ano e deixava os anos anteriores vazios.
 * O ano rotula aquele em que a janela termina; um filtro que cruza o ano traz os meses do início no ano anterior.
 * Meses 2026+ vêm do Dataverse; antes disso, da tabela fixa (e só sem segmento).
 */
export function totalProduzido(ctx: Contexto, cmp: Comparacao): TotalProduzido {
  const { todas, f, now } = ctx
  const a1 = anoAtual(now)
  const anos: [number, number, number] = [a1 - 2, a1 - 1, a1]
  const valorDoMes = (ano: number, rs: string, re: string) => {
    if (ano >= 2026) return valorDoPeriodo(todas, rs, re, f).value || null
    const valores = ANOS_MAPA.includes(ano) ? FAT_FIXO[ano] ?? [] : []
    return !temSegmento(f) ? totalFixoNoPeriodo(valores, ano, rs, re) : null
  }
  const serie = (ano: number) => {
    const { inicio, fim } = periodoNoAno(f.inicio, f.fim, ano)
    const fimJanela = parseDia(fim)
    const valores: (number | null)[] = Array.from({ length: 12 }, () => null)
    for (let { y, m } = parseDia(inicio); y < fimJanela.y || (y === fimJanela.y && m <= fimJanela.m); m === 11 ? (y++, (m = 0)) : m++) {
      const ms = fmtDia(y, m, 1)
      const me = fmtDia(y, m, diasNoMes(y, m))
      const v = valorDoMes(y, inicio > ms ? inicio : ms, fim < me ? fim : me)
      if (v !== null) valores[m] = (valores[m] ?? 0) + v
    }
    return valores
  }
  const series = anos.map(serie)
  // Eixo: meses cobertos pela janela do filtro, a partir do mês inicial; sem nenhum valor, os 12.
  const ordem = Array.from({ length: 12 }, (_, k) => (parseDia(f.inicio).m + k) % 12)
  const indices = ordem.filter((i) => series.some((s) => s[i] !== null))
  const usar = indices.length ? indices : Array.from({ length: 12 }, (_, i) => i)
  const meta = metaProporcional(f.inicio, f.fim)
  const acumulado = cmp.produzido
  const progresso = meta ? (acumulado / meta) * 100 : 0
  return {
    anos,
    pontos: usar.map((i) => ({ rotulo: MESES_TITULO[i], valores: series.map((s) => s[i]) })),
    valor: brlS(acumulado),
    sub: `${anos[0]} a ${anos[2]}`,
    chips: naoNulos([cmp.lm ? chipValor('LM', acumulado, cmp.lmValor, brlS) : null, chipValor('LY', acumulado, cmp.lyValor, brlS)]),
    apoio: meta > 0 ? [{ rotulo: 'Meta', texto: `${brlS(meta)} · ${progresso.toFixed(0)}%${progresso >= 100 ? ' atingida' : ''}`, atencao: progresso < 100 }] : [],
  }
}

export type LinhaMeta = { mes: string; rotulo: string; meta: number; real: number; pct: number; tom: 'success' | 'info' | 'warning' }
export type MetaRealizado = Destaque & { linhas: LinhaMeta[] }

export function metaRealizado(ctx: Contexto, cmp: Comparacao): MetaRealizado {
  const { rv, now } = ctx
  const comDados = mesesComDados(rv)
  const meses = mesesOuAno(rv, now)
  const byM = agrupar(rv, (r) => r.mes)
  const ano = anoAtual(now)
  const linhas = meses.map((mes, i): LinhaMeta => {
    const [y, m] = mes.split('-').map(Number)
    const real = comDados.length ? soma(byM.get(mes) ?? []) : (ANOS_MAPA.includes(ano) ? FAT_FIXO[ano]?.[i] ?? 0 : 0)
    const meta = metaMensal(y, m - 1)
    const pct = meta > 0 ? (real / meta) * 100 : 0
    return { mes, rotulo: mesRotulo(mes), meta, real, pct, tom: pct >= 100 ? 'success' : pct >= 75 ? 'info' : 'warning' }
  })
  const totalMeta = linhas.reduce((t, l) => t + l.meta, 0)
  const totalReal = linhas.reduce((t, l) => t + l.real, 0)
  const pct = totalMeta > 0 ? (totalReal / totalMeta) * 100 : 0
  return {
    linhas,
    valor: brlS(totalReal),
    sub: `${meses.length} meses · ${dec(pct, 1)}% da meta`,
    chips: naoNulos([chipValor('LY', totalReal, cmp.lyValor, brlS)]),
    apoio: totalMeta > 0 ? [{ rotulo: 'Meta', texto: `${brlS(totalMeta)} · ${pct.toFixed(0)}%${pct >= 100 ? ' atingida' : ''}`, atencao: pct < 100 }] : [],
  }
}

export type Delta = { tipo: 'novo' } | { tipo: 'nada' } | { tipo: 'pct'; valor: number }
export type MesComDelta = { mes: string; valor: number; delta: Delta }

/**
 * Faturamento de `rows` em cada mês de `meses` e a variação contra o mês anterior da lista (`fatCliDelta` do legado):
 * o primeiro mês não tem delta; anterior 0 vira "novo" se houver valor, senão "nada"; nos demais, variação %.
 */
export function mesesComDelta(rows: Reserva[], meses: string[]): MesComDelta[] {
  const porMes = agrupar(rows, (r) => r.mes)
  return meses.map((mes, i) => {
    const valor = soma(porMes.get(mes) ?? [])
    const anterior = i > 0 ? soma(porMes.get(meses[i - 1]) ?? []) : null
    const delta: Delta = anterior === null || anterior === 0 ? (anterior === 0 && valor > 0 ? { tipo: 'novo' } : { tipo: 'nada' }) : { tipo: 'pct', valor: ((valor - anterior) / anterior) * 100 }
    return { mes, valor, delta }
  })
}
export type TicketMensal = Destaque & { pontos: { rotulo: string; valor: number | null }[] }

export function ticketMensal(ctx: Contexto, cmp: Comparacao): TicketMensal {
  const { todas, rv, f } = ctx
  const meses = mesesComDados(rv)
  const byM = agrupar(rv, (r) => r.mes)
  const tk = ticketStats(rv).ticket
  const lmTk = cmp.lm ? ticketDoPeriodo(todas, cmp.lm.inicio, cmp.lm.fim, f).ticket : 0
  return {
    pontos: meses.length ? meses.map((mes) => ({ rotulo: mesRotulo(mes), valor: ticketStats(byM.get(mes) ?? []).ticket })) : MESES_CURTOS.map((rotulo) => ({ rotulo, valor: null })),
    valor: brl(tk),
    sub: `${meses.length} meses`,
    // No legado o LY deste card é sempre "s/dado".
    chips: [...(cmp.lm ? [chipOuSemDado('LM', tk, lmTk, brlS)] : []), semDado('LY')],
    apoio: [],
  }
}

export type StatusServicos = Destaque & { linhas: { status: string; qtd: number; pct: number }[] }

export function statusServicos(ctx: Contexto): StatusServicos {
  const { rv } = ctx
  const por = agrupar(rv, (r) => r.statusLabel)
  const chaves = [...por.keys()].sort((a, b) => (por.get(b)?.length ?? 0) - (por.get(a)?.length ?? 0))
  const conc = rv.filter(produzido).length
  const canc = rv.filter((r) => { const k = stL(r.statusLabel); return k.includes('cancel') || k.includes('recus') }).length
  const concPct = rv.length ? (conc / rv.length) * 100 : 0
  return {
    linhas: topByShare(chaves, rv.length, (k) => por.get(k)?.length ?? 0).map((status) => {
      const qtd = por.get(status)?.length ?? 0
      return { status, qtd, pct: rv.length ? (qtd / rv.length) * 100 : 0 }
    }),
    valor: int(rv.length),
    sub: `${int(conc)} concluídos · ${int(canc)} cancelados`,
    chips: [],
    apoio: [{ rotulo: 'Concluídos', texto: `${dec(concPct, 1)}%`, atencao: concPct < 75 }],
  }
}
