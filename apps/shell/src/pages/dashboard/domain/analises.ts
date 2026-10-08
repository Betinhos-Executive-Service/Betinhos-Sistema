import { ANOS_MAPA, FAT_FIXO } from '../data/historico'
import { MESES_CURTOS, MESES_TITULO, SEM_CLIENTE, SEM_MOTORISTA } from './codes'
import { agrupar, mesesComDados, soma, temSegmento } from './base'
import { brl, brlS, dec, int, stL } from './format'
import { chipOuSemDado, chipValor, produzido, semDado, ticketDoPeriodo, ticketStats, valorDoPeriodo, type Comparacao, type Contexto } from './kpis'
import { metaMensal, metaProporcional, totalFixoNoPeriodo } from './meta'
import { diasNoMes, hojeBR, mesRotulo, mesesDoAno, parseDia } from './periodo'
import type { Apoio, Chip, Manutencao, Reserva } from './types'

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
const mesesOuAno = (rv: Reserva[], now: Date) => { const m = mesesComDados(rv); return m.length ? m : mesesDoAno(anoAtual(now)) }

export type TotalProduzido = Destaque & { anos: [number, number, number]; pontos: { rotulo: string; valores: (number | null)[] }[] }

export function totalProduzido(ctx: Contexto, cmp: Comparacao): TotalProduzido {
  const { todas, f, now } = ctx
  const a1 = anoAtual(now)
  const anos: [number, number, number] = [a1 - 2, a1 - 1, a1]
  const recorte = (ano: number, mes: number) => {
    const ms = `${ano}-${String(mes + 1).padStart(2, '0')}-01`
    const me = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diasNoMes(ano, mes)).padStart(2, '0')}`
    return { rs: f.inicio > ms ? f.inicio : ms, re: f.fim < me ? f.fim : me }
  }
  const serie = (ano: number) => Array.from({ length: 12 }, (_, mes) => {
    const { rs, re } = recorte(ano, mes)
    if (ano >= 2026) return rs > re ? null : valorDoPeriodo(todas, rs, re, f).value || null
    const valores = ANOS_MAPA.includes(ano) ? FAT_FIXO[ano] ?? [] : []
    return !temSegmento(f) && rs <= re ? totalFixoNoPeriodo(valores, ano, rs, re) : null
  })
  const series = anos.map(serie)
  const indices = Array.from({ length: 12 }, (_, i) => i).filter((i) => series.some((s) => s[i] !== null))
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
export type LinhaCliente = { cliente: string; total: number; participacao: number; meses: { mes: string; valor: number; delta: Delta }[] }
export type FatPorCliente = Destaque & { meses: { mes: string; rotulo: string }[]; linhas: LinhaCliente[] }

export function faturamentoPorCliente(ctx: Contexto): FatPorCliente {
  const { rv, now } = ctx
  const meses = mesesOuAno(rv, now)
  const fat = soma(rv)
  const top = [...agrupar(rv, (r) => r.cliente)].filter(([c]) => c !== SEM_CLIENTE).sort((a, b) => soma(b[1]) - soma(a[1])).slice(0, 6)
  const linhas = top.map(([cliente, rows]): LinhaCliente => {
    const porMes = agrupar(rows, (r) => r.mes)
    const total = soma(rows)
    return {
      cliente, total, participacao: fat > 0 ? (total / fat) * 100 : 0,
      meses: meses.map((mes, i) => {
        const valor = soma(porMes.get(mes) ?? [])
        const anterior = i > 0 ? soma(porMes.get(meses[i - 1]) ?? []) : null
        const delta: Delta = anterior === null || anterior === 0 ? (anterior === 0 && valor > 0 ? { tipo: 'novo' } : { tipo: 'nada' }) : { tipo: 'pct', valor: ((valor - anterior) / anterior) * 100 }
        return { mes, valor, delta }
      }),
    }
  })
  const apoio = linhas.slice(0, 2).map((l, i) => ({ rotulo: `${i + 1}º`, texto: `${l.cliente} · ${brlS(l.total)} · ${dec(l.participacao, 1)}%` }))
  return { meses: meses.map((mes) => ({ mes, rotulo: mesRotulo(mes) })), linhas, valor: linhas[0] ? brlS(linhas[0].total) : '—', sub: linhas[0]?.cliente ?? 'Sem clientes no período', chips: [], apoio }
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

export type CustoFrota = Destaque & { pontos: { rotulo: string; valor: number }[] }

export function custoFrota(ctx: Contexto, manutencoes: Manutencao[], indisponivel: boolean): CustoFrota {
  if (indisponivel) return { pontos: [], valor: '—', sub: 's/dado', chips: [], apoio: [] }
  const fat = soma(ctx.rv)
  const porMes = agrupar(manutencoes, (m) => m.dia.slice(0, 7))
  const meses = [...porMes.keys()].filter(Boolean).sort()
  const custo = manutencoes.reduce((t, m) => t + (m.valor || 0), 0)
  const pctRec = fat > 0 ? (custo / fat) * 100 : 0
  return {
    pontos: meses.map((mes) => ({ rotulo: mesRotulo(mes), valor: (porMes.get(mes) ?? []).reduce((t, m) => t + (m.valor || 0), 0) })),
    valor: brlS(custo),
    sub: `${int(manutencoes.length)} manutenções · ${dec(pctRec, 1)}% da receita`,
    chips: [],
    apoio: [{ rotulo: '% da receita', texto: `${dec(pctRec, 1)}% · ${pctRec <= 10 ? 'OK' : 'Alto'}`, atencao: pctRec > 10 }],
  }
}

export type TopVolume = Destaque & { linhas: { cliente: string; qtd: number; pct: number }[] }

/** Inclui "Sem cliente", como no legado. */
export function topVolume(ctx: Contexto): TopVolume {
  const { rv } = ctx
  const ranked = [...agrupar(rv, (r) => r.cliente)].sort((a, b) => b[1].length - a[1].length)
  const linhas = topByShare(ranked, rv.length, ([, rows]) => rows.length).map(([cliente, rows]) => ({ cliente, qtd: rows.length, pct: rv.length ? (rows.length / rv.length) * 100 : 0 }))
  return { linhas, valor: linhas[0] ? int(linhas[0].qtd) : '—', sub: linhas[0]?.cliente ?? 'Sem serviços no período', chips: [], apoio: linhas.slice(0, 2).map((l, i) => ({ rotulo: `${i + 1}º`, texto: `${l.cliente} · ${dec(l.pct, 1)}%` })) }
}

export type TopFaturamento = Destaque & { linhas: { cliente: string; valor: string; ticket: string; pct: number }[] }

export function topFaturamento(ctx: Contexto): TopFaturamento {
  const { rv } = ctx
  const fat = soma(rv)
  const ranked = [...agrupar(rv, (r) => r.cliente)].sort((a, b) => soma(b[1]) - soma(a[1]))
  const top = topByShare(ranked, fat, ([, rows]) => soma(rows))
  const linhas = top.map(([cliente, rows]) => ({ cliente, valor: brl(soma(rows)), ticket: brl(ticketStats(rows).ticket), pct: fat ? (soma(rows) / fat) * 100 : 0 }))
  return { linhas, valor: top[0] ? brlS(soma(top[0][1])) : '—', sub: top[0]?.[0] ?? 'Sem serviços no período', chips: [], apoio: linhas.slice(0, 2).map((l, i) => ({ rotulo: `${i + 1}º`, texto: `${l.cliente} · ${dec(l.pct, 1)}%` })) }
}

export type LinhaMotorista = { key: string; nome: string; meses: { qtd: number; pct: string }[]; total: number; pct: number }
export type ServicosPorMotorista = Destaque & { meses: { mes: string; rotulo: string }[]; linhas: LinhaMotorista[] }

export function servicosPorMotorista(ctx: Contexto): ServicosPorMotorista {
  const { rv, now } = ctx
  const mots = new Map<string, string>()
  for (const r of rv) if (r.motorista !== SEM_MOTORISTA) mots.set(r.motoristaKey, r.motorista)
  const meses = mesesOuAno(rv, now)
  const byM = agrupar(rv, (r) => r.mes)
  const totais = meses.map((mes) => (byM.get(mes) ?? []).length)
  const linhas = [...mots].map(([key, nome]): LinhaMotorista => {
    const porMes = meses.map((mes, i) => {
      const qtd = (byM.get(mes) ?? []).filter((r) => r.motoristaKey === key).length
      return { qtd, pct: totais[i] ? `${dec((qtd / totais[i]) * 100, 1)}%` : '—' }
    })
    const total = porMes.reduce((t, m) => t + m.qtd, 0)
    return { key, nome, meses: porMes, total, pct: rv.length ? (total / rv.length) * 100 : 0 }
  }).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
  return {
    meses: meses.map((mes) => ({ mes, rotulo: mesRotulo(mes) })), linhas,
    valor: int(mots.size), sub: `${mots.size ? int(mots.size) : '—'} motoristas ativos`, chips: [],
    apoio: linhas.slice(0, 2).map((l, i) => ({ rotulo: `${i + 1}º`, texto: `${l.nome} · ${dec(l.pct, 1)}%` })),
  }
}
