import { mesesComDelta, mesesOuAno, topByShare, ticketMensal, type MesComDelta, type TicketMensal } from '../analises'
import { agrupar, soma } from '../base'
import { SEM_CLIENTE } from '../codes'
import { comparar, servicosAnteriores, type ChipAnterior } from '../comparar'
import { brlS, int, normL } from '../format'
import { comparacao, recebimentoStats, ticketStats, type Contexto } from '../kpis'
import { DIA_MS, mesRotulo } from '../periodo'
import type { Pagante, Reserva } from '../types'

/** Status "Pago" de `cr40f_pagantes` (`isReceivedPayment` do legado, L10465). */
export const PAGANTE_PAGO = 202410002
/** O Status de faturamento do legado só olha serviços com saída a partir desta data (`tblFatStatus`, L14359). */
export const CORTE_STATUS_FATURAMENTO = '2026-04-01'
const LIMITE_ATRASO_MS = 5 * DIA_MS

/** `isReceivedPayment`: código 202410002 ou rótulo (sem acento e sem caixa) igual a "pago"/"paga". */
export const recebido = (p: Pagante) => { const k = normL(p.statusLabel); return p.status === PAGANTE_PAGO || k === 'pago' || k === 'paga' }
/** `isCardPayment`: forma com cartão, crédito, link ou máquina. */
export const cartao = (p: Pagante) => { const k = normL(p.formaLabel); return k.includes('cartao') || k.includes('credito') || k.includes('link') || k.includes('maquina') }
const somaPag = (rows: Pagante[]) => rows.reduce((s, p) => s + (p.valor || 0), 0)
const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)

/** Todos os números em valor cru; `null` é o "s/dado" do legado. */
export type KpisFinanceiro = {
  maiorServico: number
  clientesAtivos: number
  /** `recebidoProduzido`: soma das reservas com faturamento "Pago" (não depende dos pagantes). */
  totalRecebido: number
  cartao: number | null
  atrasados: number | null
  /** Dias, média entre `createdon` e `cr40f_datadoprimeiropagamento` dos pagantes recebidos. */
  tempoMedioPagamento: number | null
  /** Apoio: "X de Y pagamentos com data confiável". */
  pagamentosMedidos: number
  pagamentosRecebidos: number
}
export type CicloFinanceiro = {
  prazoFaturar: number | null
  prazoPagar: number | null
  ciclo: number | null
  cpMaisAntiga: number | null
  /** Fixo em s/dado no legado: sem vínculo confirmado de repasse. */
  rodoanel: null
  /** Apoio: "N CPs: finalização até cobrança". */
  cpsMedidas: number
  /** Pagantes recebidos com intervalo válido entre criação e primeiro pagamento. */
  pagamentosMedidos: number
  /** Apoio: "N pagamentos medidos" ou, quando falso, "campo ainda não publicado no ambiente". */
  dataPagamentoDisponivel: boolean
  /** Apoio da CP mais antiga: valor e `createdon` bruto do pagante pendente. */
  cpMaisAntigaValor: number | null
  cpMaisAntigaDesde: string
}
/** `pct` é a participação do legado (por quantidade no status de faturamento, por valor nos pagantes); `pctQtd` é a coluna de contagem. */
type Distribuicao = { qtd: number; valor: number; pct: number; pctQtd: number }
export type LinhaStatusFat = Distribuicao & { status: string }
export type LinhaForma = Distribuicao & { forma: string }
export type LinhaStatusPag = Distribuicao & { status: string }
export type LinhaClienteFin = {
  cliente: string; servicos: number; faturamento: number; ticket: number
  /** Participação no faturamento (barra do `tbFat`). */
  pct: number
  /** Participação nos serviços (coluna de quantidade do `tbFat`). */
  pctServicos: number
  meses: MesComDelta[]
}
export type Financeiro = {
  kpis: KpisFinanceiro
  /** Chips "ANT." de Maior serviço e Clientes ativos (só reservas) contra o período anterior de mesma duração. */
  ant: { maiorServico: ChipAnterior; clientesAtivos: ChipAnterior }
  ciclo: CicloFinanceiro
  statusFaturamento: LinhaStatusFat[]
  ticketMensal: TicketMensal
  meses: { mes: string; rotulo: string }[]
  clientes: LinhaClienteFin[]
  porForma: LinhaForma[]
  porStatus: LinhaStatusPag[]
}

/** `renderDistributionTable`: agrupa, ordena por quantidade e aplica `topByShare` sobre a base da participação. */
function distribuir<T>(rows: T[], chave: (r: T) => string, valor: (rows: T[]) => number, porValor: boolean) {
  const grupos = [...agrupar(rows, chave)].sort((a, b) => b[1].length - a[1].length)
  const linhas = grupos.map(([rotulo, g]) => ({ rotulo, qtd: g.length, valor: valor(g) }))
  const base = porValor ? linhas.reduce((s, l) => s + l.valor, 0) : rows.length
  return topByShare(linhas, base, (l) => (porValor ? l.valor : l.qtd)).map((l) => ({
    rotulo: l.rotulo, qtd: l.qtd, valor: l.valor,
    pct: base ? ((porValor ? l.valor : l.qtd) / base) * 100 : 0,
    pctQtd: rows.length ? (l.qtd / rows.length) * 100 : 0,
  }))
}

/** `renderFaturamentoCycle` (L14243). */
function cicloFinanceiro(rv: Reserva[], pags: Pagante[], nowMs: number): CicloFinanceiro {
  const porOp = agrupar(pags.filter((p) => p.opId), (p) => p.opId.toLowerCase())
  const faturar: number[] = []
  for (const r of rv) {
    const fim = Date.parse(r.finalizadoRaw || '')
    const avisos = (porOp.get(r.opId.toLowerCase()) ?? []).map((p) => Date.parse(p.criadoRaw || '')).filter(Number.isFinite)
    const dias = (Math.min(...avisos) - fim) / DIA_MS
    if (Number.isFinite(dias) && dias >= 0) faturar.push(dias)
  }
  const pagar = pags.filter(recebido).map((p) => (Date.parse(p.primeiroPagamentoRaw || '') - Date.parse(p.criadoRaw || '')) / DIA_MS).filter((d) => Number.isFinite(d) && d >= 0)
  const dataPagamentoDisponivel = pags.some((p) => Number.isFinite(Date.parse(p.primeiroPagamentoRaw || '')))
  const prazoFaturar = media(faturar)
  const prazoPagar = dataPagamentoDisponivel ? media(pagar) : null
  const pendentes = pags.filter((p) => !recebido(p) && Date.parse(p.criadoRaw || '')).sort((a, b) => Date.parse(a.criadoRaw) - Date.parse(b.criadoRaw))
  const antiga = pendentes[0]
  return {
    prazoFaturar, prazoPagar,
    ciclo: prazoFaturar === null || prazoPagar === null ? null : prazoFaturar + prazoPagar,
    cpMaisAntiga: antiga ? Math.max(0, (nowMs - Date.parse(antiga.criadoRaw)) / DIA_MS) : null,
    rodoanel: null,
    cpsMedidas: faturar.length,
    pagamentosMedidos: pagar.length,
    dataPagamentoDisponivel,
    cpMaisAntigaValor: antiga ? antiga.valor || 0 : null,
    cpMaisAntigaDesde: antiga?.criadoRaw ?? '',
  }
}

/** Uma tabela no lugar de `tbFat`, Top volume, Top faturamento e Faturamento por cliente: todos, por faturamento, "Sem cliente" no fim. */
function clientes(rv: Reserva[], meses: string[]): LinhaClienteFin[] {
  const fat = soma(rv)
  return [...agrupar(rv, (r) => r.cliente)]
    .map(([cliente, rows]): LinhaClienteFin => {
      const faturamento = soma(rows)
      return {
        cliente, servicos: rows.length, faturamento, ticket: ticketStats(rows).ticket,
        pct: fat > 0 ? (faturamento / fat) * 100 : 0,
        pctServicos: rv.length ? (rows.length / rv.length) * 100 : 0,
        meses: mesesComDelta(rows, meses),
      }
    })
    .sort((a, b) => Number(a.cliente === SEM_CLIENTE) - Number(b.cliente === SEM_CLIENTE) || b.faturamento - a.faturamento)
}

const maior = (rows: Reserva[]) => rows.reduce((m, r) => Math.max(m, r.valor || 0), 0)
const ativos = (rows: Reserva[]) => new Set(rows.map((r) => r.cliente).filter((c) => c !== SEM_CLIENTE)).size

/** Aba Financeiro (= Faturamento + Pagamentos do legado). `indisponivel`: pagantes falharam e os cards deles mostram s/dado. */
export function calcularFinanceiro(ctx: Contexto, pagantes: Pagante[], indisponivel: boolean): Financeiro {
  const { rv, now } = ctx
  const nowMs = now.getTime()
  const pags = indisponivel ? [] : pagantes
  const recebidos = pags.filter(recebido)
  const ciclo = cicloFinanceiro(rv, pags, nowMs)
  const atrasados = pags.filter((p) => { const t = Date.parse(p.criadoRaw || ''); return !recebido(p) && Number.isFinite(t) && nowMs - t > LIMITE_ATRASO_MS })
  const meses = mesesOuAno(rv, now)
  const statusRows = rv.filter((r) => r.saidaRaw.slice(0, 10) >= CORTE_STATUS_FATURAMENTO)
  const ant = servicosAnteriores(ctx)
  const maiorServico = maior(rv)
  const clientesAtivos = ativos(rv)
  return {
    ant: {
      maiorServico: comparar(maiorServico, ant ? maior(ant) : null, brlS, 'sobe'),
      clientesAtivos: comparar(clientesAtivos, ant ? ativos(ant) : null, int, 'sobe'),
    },
    kpis: {
      maiorServico,
      clientesAtivos,
      totalRecebido: recebimentoStats(rv).recebido,
      cartao: indisponivel ? null : somaPag(recebidos.filter(cartao)),
      atrasados: indisponivel ? null : atrasados.length,
      tempoMedioPagamento: ciclo.prazoPagar,
      pagamentosMedidos: ciclo.pagamentosMedidos,
      pagamentosRecebidos: recebidos.length,
    },
    ciclo,
    statusFaturamento: distribuir(statusRows, (r) => r.fatStatusLabel, soma, false).map(({ rotulo, ...l }) => ({ status: rotulo, ...l })),
    ticketMensal: ticketMensal(ctx, comparacao(ctx)),
    meses: meses.map((mes) => ({ mes, rotulo: mesRotulo(mes) })),
    clientes: clientes(rv, meses),
    porForma: distribuir(pags, (p) => p.formaLabel, somaPag, true).map(({ rotulo, ...l }) => ({ forma: rotulo, ...l })),
    porStatus: distribuir(pags, (p) => p.statusLabel, somaPag, true).map(({ rotulo, ...l }) => ({ status: rotulo, ...l })),
  }
}
