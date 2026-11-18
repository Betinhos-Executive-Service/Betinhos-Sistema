import type { FilterCondition, TableFilters } from '@betinhos/ui'
import { emptyFilters } from '@betinhos/ui'
import { agrupar, soma } from './base'
import { brl, brlS, dec, int, normL } from './format'
import { aReceberLinha, type Contexto } from './kpis'
import { calcularResumo } from './resumo'
import type { Chip, Dados, Filtros, Kpi, KpiId, Reserva } from './types'

/* Card ampliado: gráfico, tabela, comparativo, top 5 e o atalho "Ver na lista" de cada indicador, tirados do que já está carregado. */

export type ItemTop = { rotulo: string; valor: string; apoio?: string }
export type Top = { titulo: string; itens: ItemTop[] }
export type ComparativoItem = { codigo: string; rotulo: string; anterior: string; variacao: number }
export type GraficoDetalhe =
  | { tipo: 'barras'; nome: string; dinheiro: boolean; dados: { rotulo: string; valor: number }[] }
  | { tipo: 'anos'; anos: string[]; dados: Record<string, string | number | null>[] }
  | { tipo: 'meta'; dados: { rotulo: string; meta: number; real: number; tom: 'success' | 'info' | 'warning' }[] }
  | { tipo: 'anel'; razao: number; centro: string; recebido: string; base: string }
export type TabelaDetalhe = { colunas: string[]; linhas: string[][] }
/** Lista (rota do shell) que abre já filtrada pelo recorte do card. */
export type ListaAlvo = { rota: string; filtros: TableFilters; /** Aviso quando a lista não expressa todo o recorte do card. */ nota?: string }
export const NOTA_PERIODO = 'Período aplicado; demais filtros não'

export type Extras = {
  /** Valor de destaque do indicador (o número do card). */
  valor?: string
  grafico?: GraficoDetalhe
  /** Só o que foi carregado: sem o período anterior, a seção some. */
  comparativo?: ComparativoItem[]
  tops?: Top[]
  lista?: ListaAlvo | null
}

const ROTULO_COMPARATIVO: Record<string, string> = { LM: 'Mês anterior', LY: 'Ano anterior', 'ANT.': 'Período anterior' }

/** Comparativos de um indicador: só os chips com dado (o "s/dado" não vira linha). */
export const comparativoDe = (chips: Chip[]): ComparativoItem[] =>
  chips.flatMap((c) => (c.tipo === 'valor' ? [{ codigo: c.rotulo, rotulo: ROTULO_COMPARATIVO[c.rotulo] ?? c.rotulo, anterior: c.anterior, variacao: c.variacao }] : []))

/** Os `max` primeiros por `medida` (maior primeiro; empate pelo nome); grupo sem nome fica de fora. */
export function top5<T>(rows: T[], chave: (r: T) => string, medida: (grupo: T[]) => number, formatar: (v: number) => string, apoio?: (grupo: T[]) => string, max = 5): ItemTop[] {
  return [...agrupar(rows.filter((r) => chave(r).trim() !== ''), chave).entries()]
    .map(([rotulo, grupo]) => ({ rotulo, v: medida(grupo), grupo }))
    .sort((a, b) => b.v - a.v || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    .slice(0, max)
    .map(({ rotulo, v, grupo }) => ({ rotulo, valor: formatar(v), ...(apoio ? { apoio: apoio(grupo) } : {}) }))
}

const servicosApoio = (g: unknown[]) => `${int(g.length)} ${g.length === 1 ? 'serviço' : 'serviços'}`

/** Top 5 clientes e top 5 motoristas: em R$ (indicador de dinheiro) ou em quantidade de serviços. */
export function topsClientesMotoristas(rows: Reserva[], modo: 'dinheiro' | 'qtd' | 'ticket', rotuloValor = ''): Top[] {
  const medida = modo === 'dinheiro' ? (g: Reserva[]) => soma(g) : modo === 'ticket' ? (g: Reserva[]) => soma(g) / (g.length || 1) : (g: Reserva[]) => g.length
  const fmt = modo === 'qtd' ? int : brl
  const apoio = modo === 'qtd' ? undefined : servicosApoio
  const sufixo = rotuloValor ? ` ${rotuloValor}` : ''
  return [
    { titulo: `Top 5 clientes${sufixo}`, itens: top5(rows, (r) => r.cliente, medida, fmt, apoio) },
    { titulo: `Top 5 motoristas${sufixo}`, itens: top5(rows, (r) => r.motorista, medida, fmt, apoio) },
  ]
}

const CAMPO_DATA = 'cr40f_dataehorriodesada'
const CAMPO_MOTORISTA = 'cr40f_motorista'

/**
 * Lista Geral (serviços) no período e, se houver, no motorista. Só devolve algo quando a Geral consegue expressar
 * o recorte inteiro: filtro de status, cliente ou tipo do dashboard não tem condição equivalente (cliente não tem id), então não há atalho.
 */
export function listaGeral(f: Filtros, todas: Reserva[], motorista?: { key: string; nome: string }, aceitarSegmento = false): ListaAlvo | null {
  if (!aceitarSegmento && (f.status.length || f.clientes.length || f.tipos.length)) return null
  const chaves = motorista ? [motorista.key] : f.motoristas
  if (chaves.some((k) => k.startsWith('nome:'))) return null
  const quick: Record<string, FilterCondition> = {
    [CAMPO_DATA]: { type: 'condition', id: `rapido-${CAMPO_DATA}`, field: CAMPO_DATA, op: 'between', value: f.inicio, to: f.fim },
  }
  if (chaves.length) {
    const nomes = new Map(todas.filter((r) => r.motoristaId).map((r) => [r.motoristaId, r.motorista]))
    quick[CAMPO_MOTORISTA] = {
      type: 'condition', id: `rapido-${CAMPO_MOTORISTA}`, field: CAMPO_MOTORISTA, op: 'in',
      values: chaves.map((k) => ({ value: k, label: motorista?.nome ?? nomes.get(k) ?? k })),
    }
  }
  return { rota: 'geral', filtros: { ...emptyFilters(), quick } }
}

/** A Geral não tem condição para o status do card (CP pendente, a receber…): abre no período, com o aviso. */
export const comNota = (l: ListaAlvo | null): ListaAlvo | null => (l ? { ...l, nota: NOTA_PERIODO } : null)

/** Id do card de cada KPI (os de lista mantêm os ids do drill-down antigo). */
export const ID_KPI: Record<KpiId, string> = { faturamento: 'faturamento', servicos: 'servicos', ticket: 'ticket', aReceber: 'a-receber', cpPendente: 'cp-pendente', recebimento: 'recebimento' }
export const IDS_INDICADOR = ['faturamento', 'servicos', 'ticket', 'recebimento', 'total-produzido', 'meta-realizado'] as const

const graficoDoKpi = (k: Kpi): GraficoDetalhe | undefined => (k.serie.length
  ? { tipo: 'barras', nome: k.rotulo, dinheiro: k.id !== 'servicos' && k.id !== 'cpPendente', dados: k.serie.map((p) => ({ rotulo: p.rotulo, valor: p.valor })) }
  : undefined)

const tabelaDoKpi = (k: Kpi): TabelaDetalhe => {
  const fmt = k.id === 'servicos' || k.id === 'cpPendente' ? int : k.id === 'ticket' ? brl : brlS
  return { colunas: ['Mês', k.rotulo], linhas: k.serie.map((p) => [p.rotulo, fmt(p.valor)]) }
}

/** O que os KPIs executivos acrescentam ao card: valor, gráfico da série, comparativo, top 5 e atalho para a lista. */
export function extrasDoKpi(id: KpiId, ctx: Contexto, kpis: Kpi[]): Extras & { tabela: TabelaDetalhe } {
  const k = kpis.find((x) => x.id === id)
  const base = { tabela: k ? tabelaDoKpi(k) : { colunas: [], linhas: [] }, valor: k?.valor, grafico: k && (id === 'recebimento' && k.anel ? { tipo: 'anel' as const, razao: k.anel.razao, centro: k.valor, recebido: k.anel.recebido, base: k.anel.base } : graficoDoKpi(k)), comparativo: k ? comparativoDe(k.chips) : [] }
  const lista = listaGeral(ctx.f, ctx.todas)
  const listaPeriodo = comNota(listaGeral(ctx.f, ctx.todas, undefined, true))
  switch (id) {
    case 'faturamento': return { ...base, tops: topsClientesMotoristas(ctx.rv, 'dinheiro', 'em R$'), lista }
    case 'ticket': return { ...base, tops: topsClientesMotoristas(ctx.rv, 'ticket', '(ticket médio)'), lista }
    case 'servicos': return { ...base, tops: topsClientesMotoristas(ctx.rv, 'qtd', '(serviços)'), lista }
    case 'aReceber': return { ...base, tops: topsClientesMotoristas(ctx.rv.filter(aReceberLinha), 'dinheiro', 'a receber'), lista: listaPeriodo }
    case 'cpPendente': return { ...base, tops: topsClientesMotoristas(ctx.rv.filter((r) => r.cpPendente), 'qtd', '(CP pendente)'), lista: listaPeriodo }
    case 'recebimento': return {
      tabela: { colunas: ['Item', 'Valor'], linhas: k?.anel ? [['Recebido', k.anel.recebido], ['Faturamento', k.anel.base], ['Percentual', k.valor]] : [] },
      valor: k?.valor, grafico: base.grafico, comparativo: [], tops: topsClientesMotoristas(ctx.rv.filter(aReceberLinha), 'dinheiro', 'a receber'), lista: listaPeriodo,
    }
  }
}

export type Indicador = Extras & { tabela: TabelaDetalhe }

/** Card dos indicadores que não são lista de registros (ids de `IDS_INDICADOR`); null para outro id. */
export function indicadorDoId(id: string, ctx: Contexto, dados: Dados): (Indicador & { titulo: string; descricao: string }) | null {
  if (!(IDS_INDICADOR as readonly string[]).includes(id)) return null
  const resumo = calcularResumo(ctx, dados)
  if ((['faturamento', 'servicos', 'ticket', 'recebimento'] as const).includes(id as 'faturamento')) {
    const k = resumo.kpis.find((x) => ID_KPI[x.id] === id)
    if (!k) return null
    return { titulo: k.rotulo, descricao: DESCRICAO[id] ?? '', ...extrasDoKpi(k.id, ctx, resumo.kpis) }
  }
  const lista = listaGeral(ctx.f, ctx.todas)
  const tops = topsClientesMotoristas(ctx.rv, 'dinheiro', 'em R$')
  if (id === 'total-produzido') {
    const tp = resumo.totalProduzido
    const anos = tp.anos.map(String)
    return {
      titulo: 'Total produzido', descricao: 'Faturamento mensal do período nos três últimos anos.', valor: tp.valor, comparativo: comparativoDe(tp.chips), tops, lista,
      grafico: { tipo: 'anos', anos, dados: tp.pontos.map((p) => Object.fromEntries([['rotulo', p.rotulo], ...anos.map((a, i) => [a, p.valores[i]] as const)])) },
      tabela: { colunas: ['Mês', ...anos], linhas: tp.pontos.map((p) => [p.rotulo, ...p.valores.map((v) => (v == null ? '—' : brl(v)))]) },
    }
  }
  if (id === 'meta-realizado') {
    const mr = resumo.metaRealizado
    return {
      titulo: 'Meta × realizado', descricao: 'Meta e faturamento realizado por mês do período.', valor: mr.valor, comparativo: comparativoDe(mr.chips), tops, lista,
      grafico: mr.linhas.length ? { tipo: 'meta', dados: mr.linhas.map((l) => ({ rotulo: l.rotulo, meta: l.meta, real: l.real, tom: l.tom })) } : undefined,
      tabela: { colunas: ['Mês', 'Meta', 'Realizado', 'Atingimento'], linhas: mr.linhas.map((l) => [l.rotulo, brl(l.meta), brl(l.real), `${dec(l.pct, 1)}%`]) },
    }
  }
  return null
}

const DESCRICAO: Record<string, string> = {
  faturamento: 'Valor produzido pelos serviços do período e dos filtros do dashboard.',
  servicos: 'Quantidade de serviços do período e dos filtros do dashboard.',
  ticket: 'Valor médio por serviço no período.',
  recebimento: 'Parte do faturamento do período que já foi recebida.',
}

/** Chave de motorista do id `motorista:<key>` com o nome do ranking (usada para o atalho da lista). */
export const nomeDoMotorista = (ctx: Contexto, key: string) => (key.startsWith('nome:')
  ? ctx.rv.find((r) => r.motorista && `nome:${normL(r.motorista)}` === key)?.motorista
  : ctx.rv.find((r) => r.motoristaId === key)?.motorista)
