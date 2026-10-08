import { FAT_MENSAL, FAT_PAGANTE_EM_VIAGEM, FAT_PAGO, MESES_CURTOS } from './codes'
import { agrupar, ehServico, mesesComDados, passaSegmentos, soma, temSegmento } from './base'
import { brl, brlS, int, normL } from './format'
import { fixoNoPeriodo } from './meta'
import { entre, mesesDoAno, mostrarLM, parseDia, hojeBR, periodoAnoAnterior, periodoMesAnterior, type Periodo } from './periodo'
import { previsao } from './previsao'
import type { Chip, Filtros, Kpi, PontoSerie, Reserva } from './types'

export const ticketElegivel = (r: Reserva) => r.cpConcluida && r.valor > 0
export function ticketStats(rows: Reserva[]) {
  const eleg = rows.filter(ticketElegivel)
  const value = soma(eleg)
  return { value, count: eleg.length, ticket: eleg.length ? value / eleg.length : 0 }
}

export function recebimentoStats(rows: Reserva[]) {
  const recebido = soma(rows.filter((r) => r.fatStatus === FAT_PAGO && r.valor > 0))
  const base = soma(rows.filter((r) => r.fatStatus !== FAT_PAGANTE_EM_VIAGEM && r.fatStatus !== FAT_MENSAL && r.valor > 0))
  return { recebido, base, percentual: base ? (recebido / base) * 100 : 0 }
}

/** `isProducedReservation`. */
export const produzido = (r: Reserva) => { const k = normL(r.statusLabel); return k.includes('conclu') || k.includes('realiz') || k.includes('finaliz') }
/** `isReservableService`. */
export const reservavel = (r: Reserva) => { const k = normL(r.statusLabel); return !k.includes('cancel') && !k.includes('recus') }

/** `getSemValorRows`: uma linha por CP pendente de serviço já produzido com faturamento pendente. */
export function cpPendentes(rows: Reserva[]) {
  const vistos = new Set<string>()
  return rows.filter((r) => {
    if (!r.cpId || vistos.has(r.cpId)) return false
    const ok = r.cpPendente && produzido(r) && normL(r.fatStatusLabel).includes('pend') && normL(r.categoriaItemLabel).includes('servico')
    if (ok) vistos.add(r.cpId)
    return ok
  })
}

export const servicosFuturos = (rows: Reserva[], nowMs: number) =>
  rows.filter((r) => Number.isFinite(r.saidaMs) && r.saidaMs > nowMs && normL(r.categoriaItemLabel).includes('servico') && reservavel(r) && !produzido(r))

export const aReceber = (rows: Reserva[]) => soma(rows.filter((r) => r.cpConcluida && r.opId && r.fatStatus !== FAT_PAGO && r.valor > 0))

/** `getPeriodValueAndCount`: soma do Dataverse; zero sem segmento cai no histórico fixo (contagem fica null). */
export function valorDoPeriodo(todas: Reserva[], inicio: string, fim: string, f: Filtros) {
  const rows = todas.filter((r) => ehServico(r) && entre(r.dia, inicio, fim) && passaSegmentos(r, f))
  const value = soma(rows)
  if (value === 0 && !temSegmento(f)) {
    const fixo = fixoNoPeriodo(inicio, fim)
    if (fixo > 0) return { value: fixo, count: null as number | null, hasData: true }
  }
  return { value, count: rows.length as number | null, hasData: value > 0 || rows.length > 0 }
}

/** `getTicketStatsForPeriod`: sem filtro de categoria, como no legado. */
export const ticketDoPeriodo = (todas: Reserva[], inicio: string, fim: string, f: Filtros) =>
  ticketStats(todas.filter((r) => entre(r.dia, inicio, fim) && passaSegmentos(r, f)))

/** `fmtKpiChip`: sem valor anterior o chip não aparece. */
export function chipValor(rotulo: string, atual: number, anterior: number, fmt: (v: number) => string): Chip | null {
  if (!anterior) return null
  return { rotulo, tipo: 'valor', anterior: fmt(anterior), variacao: ((atual - anterior) / anterior) * 100 }
}
export const semDado = (rotulo: string): Chip => ({ rotulo, tipo: 'sem-dado' })
/** Chip que vira "s/dado" quando não há anterior (Serviços e Ticket no legado). */
export const chipOuSemDado = (rotulo: string, atual: number, anterior: number | null, fmt: (v: number) => string) =>
  chipValor(rotulo, atual, anterior ?? 0, fmt) ?? semDado(rotulo)

export type Contexto = { todas: Reserva[]; rv: Reserva[]; f: Filtros; now: Date }
export type Comparacao = { lm: Periodo | null; ly: Periodo; lmValor: number; lyValor: number; lmServicos: number; lyServicos: number | null; produzido: number }

/** LM/LY e faturamento produzido do período (L13440–13462). */
export function comparacao({ todas, f, now }: Contexto): Comparacao {
  const lm = mostrarLM(f.inicio, f.fim, now) ? periodoMesAnterior(f.inicio, f.fim) : null
  const ly = periodoAnoAnterior(f.inicio, f.fim)
  const lmData = lm ? valorDoPeriodo(todas, lm.inicio, lm.fim, f) : null
  const lyData = valorDoPeriodo(todas, ly.inicio, ly.fim, f)
  return {
    lm, ly,
    lmValor: lmData?.hasData ? lmData.value : 0,
    lyValor: lyData.hasData ? lyData.value : 0,
    lmServicos: lmData?.count ?? 0,
    lyServicos: lyData.count,
    produzido: valorDoPeriodo(todas, f.inicio, f.fim, f).value,
  }
}

/** Últimos 8 meses com serviço; sem nenhum, mai–dez do ano corrente (L13626–13636). */
function mesesTendencia(rv: Reserva[], now: Date) {
  const meses = mesesComDados(rv)
  return (meses.length ? meses : mesesDoAno(parseDia(hojeBR(now)).y)).slice(-8)
}

export function kpisExecutivos(ctx: Contexto, cmp: Comparacao): Kpi[] {
  const { todas, rv, f, now } = ctx
  const lm = cmp.lm
  const tk = ticketStats(rv).ticket
  const fat = soma(rv)
  const semValor = cpPendentes(rv)
  const futuros = servicosFuturos(rv, now.getTime())
  const receber = aReceber(rv)
  const receb = recebimentoStats(rv)
  const prev = previsao(rv, f.inicio, f.fim, now)
  const lmTk = lm ? ticketDoPeriodo(todas, lm.inicio, lm.fim, f).ticket : 0
  const lyTk = ticketDoPeriodo(todas, cmp.ly.inicio, cmp.ly.fim, f).ticket

  const byM = agrupar(rv, (r) => r.mes)
  const meses = mesesTendencia(rv, now)
  const serie = (fn: (rows: Reserva[]) => number): PontoSerie[] =>
    meses.map((mes) => ({ mes, rotulo: MESES_CURTOS[Number(mes.slice(5, 7)) - 1], valor: fn(byM.get(mes) ?? []) }))
  const compact = (chips: (Chip | null)[]) => chips.filter((c): c is Chip => c !== null)

  return [
    {
      id: 'faturamento', rotulo: 'Faturamento', valor: brlS(cmp.produzido),
      chips: compact([lm ? chipValor('LM', cmp.produzido, cmp.lmValor, brlS) : null, chipValor('LY', cmp.produzido, cmp.lyValor, brlS)]),
      apoio: [{ rotulo: prev.rotulo, texto: prev.texto }],
      serie: serie(soma),
    },
    {
      id: 'servicos', rotulo: 'Serviços', valor: int(rv.length),
      chips: [...(lm ? [chipOuSemDado('LM', rv.length, cmp.lmServicos, int)] : []), chipOuSemDado('LY', rv.length, cmp.lyServicos, int)],
      apoio: [],
      serie: serie((rows) => rows.length),
    },
    {
      id: 'ticket', rotulo: 'Ticket médio', valor: brl(tk),
      chips: [...(lm ? [chipOuSemDado('LM', tk, lmTk, brlS)] : []), chipOuSemDado('LY', tk, lyTk, brlS)],
      apoio: [],
      serie: serie((rows) => ticketStats(rows).ticket),
    },
    {
      id: 'aReceber', rotulo: 'A receber', valor: brlS(receber), chips: [],
      apoio: [{ rotulo: '% do faturamento', texto: `${fat > 0 ? ((receber / fat) * 100).toFixed(0) : 0}% pendente` }],
      serie: serie(aReceber),
    },
    {
      id: 'cpPendente', rotulo: 'CP pendente', valor: int(semValor.length), chips: [],
      apoio: [
        { rotulo: 'Projeção', texto: brlS(tk * semValor.length), atencao: semValor.length > 0 },
        { rotulo: 'Futuros', texto: `${int(futuros.length)} · ${brlS(futuros.length * tk)}` },
      ],
      serie: serie((rows) => cpPendentes(rows).length),
    },
    {
      id: 'recebimento', rotulo: 'Recebimento', valor: `${receb.percentual.toFixed(0)}%`, chips: [],
      apoio: [{ rotulo: 'Recebido', texto: `${brlS(receb.recebido)} de ${brlS(receb.base)}` }],
      serie: serie((rows) => recebimentoStats(rows).percentual),
    },
  ]
}
