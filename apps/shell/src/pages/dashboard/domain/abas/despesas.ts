import { topByShare } from '../analises'
import type { Opcao } from '../base'
import { brl, brlS, int, normL } from '../format'
import { fmtDia, mesRotulo, parseDia, type Periodo } from '../periodo'
import type { CategoriaDespesa, Despesa, FormaPagamento, PontoSerie, Tom } from '../types'

/** Filtros próprios da aba (ids de categoria/forma, rótulo da empresa) + o filtro global de motorista (`motoristaKey`). */
export type FiltrosDespesa = { categorias: string[]; formas: string[]; empresas: string[]; motoristas?: string[] }

/** `EXPENSE_FOOD_CATEGORIES` do legado: categoria normalizada igual a um destes. */
const CATEGORIAS_ALIMENTACAO: ReadonlySet<string> = new Set(['alimentacao', 'almoco', 'cafe', 'jantar', 'lanche'])
const AGUARDANDO_PAGAMENTO = 100000001
const ANEXO_COMPLETO = 100000002
const HOSPEDAGEM_ALVO = 150
const HOSPEDAGEM_TETO = 200
const SEM_MOTORISTA = 'Sem motorista'

const soma = (rows: Despesa[]) => rows.reduce((s, d) => s + d.valor, 0)
const ehAlimentacao = (d: Despesa) => CATEGORIAS_ALIMENTACAO.has(normL(d.categoria))
const ehHospedagem = (d: Despesa) => normL(d.categoria).includes('hosped')
/** `noReceipt` do `buildExpenseRows`: status do anexo diferente de Completo e nenhum anexo. */
const semComprovante = (d: Despesa) => d.statusAnexo !== ANEXO_COMPLETO && d.anexos === 0
/** `expenseId` do legado. */
const idNorm = (v: string) => v.replace(/[{}]/g, '').toLowerCase()
const chaveMotorista = (d: Despesa) => d.motoristaId || `nome:${normL(d.motorista)}`

/** `getPreviousExpensePeriod`: janela imediatamente anterior com o mesmo número de dias; null sem período válido. */
export function periodoAnteriorDespesa(inicio: string, fim: string): Periodo | null {
  if (!inicio || !fim || fim < inicio) return null
  const s = parseDia(inicio)
  const e = parseDia(fim)
  const dias = Math.round((Date.UTC(e.y, e.m, e.d) - Date.UTC(s.y, s.m, s.d)) / 86_400_000) + 1
  return { inicio: fmtDia(s.y, s.m, s.d - dias), fim: fmtDia(s.y, s.m, s.d - 1) }
}

/** `expenseMatchesFilters` sem a parte de data (motorista global, empresa, categoria, forma). */
function passaFiltros(d: Despesa, f: FiltrosDespesa) {
  // Valor do filtro: id (sem chaves, minúsculo) ou "nome:<normL>" quando o motorista não tem id (mesma chave das reservas).
  const motoristas = (f.motoristas ?? []).map((v) => (v.startsWith('nome:') ? normL(v) : idNorm(v)))
  if (motoristas.length && !motoristas.includes(chaveMotorista(d)) && !motoristas.includes(`nome:${normL(d.motorista)}`)) return false
  if (f.empresas.length && !f.empresas.includes(d.empresa)) return false
  if (f.categorias.length && !f.categorias.includes(d.categoriaId)) return false
  if (f.formas.length && !f.formas.includes(d.formaId)) return false
  return true
}

/** Parte de data do `expenseMatchesFilters`: com período ativo, sem data fica fora; limites inclusivos. */
function noPeriodo(d: Despesa, p: Periodo) {
  if ((p.inicio || p.fim) && !d.dia) return false
  if (p.inicio && d.dia < p.inicio) return false
  if (p.fim && d.dia > p.fim) return false
  return true
}

export const filtrarDespesas = (despesas: Despesa[], periodo: Periodo, f: FiltrosDespesa) =>
  despesas.filter((d) => passaFiltros(d, f) && noPeriodo(d, periodo))

/** `expenseSubsetMetrics` do legado (sem `noReservation`, que não aparece na tela). */
function metricas(rows: Despesa[]) {
  const total = soma(rows)
  return {
    total,
    alimentacao: soma(rows.filter(ehAlimentacao)),
    aguardando: soma(rows.filter((d) => d.statusFinanceiro === AGUARDANDO_PAGAMENTO)),
    ticket: rows.length ? total / rows.length : 0,
    semComprovante: rows.filter(semComprovante).length,
  }
}
type Metricas = ReturnType<typeof metricas>

/** Chip "ANT." do `expenseDeltaMarkup`: s/dado sem período, base zero com anterior 0; subir é desfavorável, variação 0 é favorável (`delta <= 0`). */
export type ChipAnterior =
  | { rotulo: 'ANT.'; tipo: 'sem-dado' }
  | { rotulo: 'ANT.'; tipo: 'base-zero'; anterior: string }
  | { rotulo: 'ANT.'; tipo: 'valor'; anterior: string; variacao: number; favoravel: boolean }

function chipAnterior(atual: number, anterior: number | null, moeda: boolean): ChipAnterior {
  if (anterior == null) return { rotulo: 'ANT.', tipo: 'sem-dado' }
  const rotulo = moeda ? brlS(anterior) : int(anterior)
  if (!anterior) return { rotulo: 'ANT.', tipo: 'base-zero', anterior: rotulo }
  const variacao = ((atual - anterior) / Math.abs(anterior)) * 100
  return { rotulo: 'ANT.', tipo: 'valor', anterior: rotulo, variacao, favoravel: variacao <= 0 }
}

export type FaixaHospedagem = { tom: Tom; texto: string; apoio: string }
/** Faixas da política de hospedagem (alvo R$ 150, teto R$ 200). */
function faixaHospedagem(media: number | null): FaixaHospedagem {
  const apoio = `Alvo ${brl(HOSPEDAGEM_ALVO)} · teto ${brl(HOSPEDAGEM_TETO)}`
  if (media === null) return { tom: 'neutral', texto: 'Sem lançamentos', apoio }
  if (media <= HOSPEDAGEM_ALVO) return { tom: 'ok', texto: 'Dentro da meta', apoio }
  if (media <= HOSPEDAGEM_TETO) return { tom: 'warn', texto: 'Atenção', apoio }
  return { tom: 'danger', texto: 'Fora da política', apoio }
}

export type KpiDespesaId = 'despesa' | 'alimentacao' | 'aguardando' | 'ticket' | 'semComprovante' | 'hospedagem'
/** Como a UI formata o valor, igual ao legado: `brlS` (moeda curta), `brl` (moeda cheia) ou `int` (inteiro pt-BR). */
export type FormatoKpiDespesa = 'brlS' | 'brl' | 'int'
/**
 * `valor` é cru; null = "—" (despesas indisponíveis, ou média de hospedagem sem lançamentos). `chip` é null na média de hospedagem
 * (o legado mostra a faixa no lugar) e com despesas indisponíveis; `faixa` só existe na hospedagem com dados carregados.
 */
export type KpiDespesa = {
  id: KpiDespesaId; rotulo: string; valor: number | null; formato: FormatoKpiDespesa; chip: ChipAnterior | null; serie: PontoSerie[]; faixa?: FaixaHospedagem
}

export type LinhaMes = { mes: string; rotulo: string; lancamentos: number; valor: number; alimentacao: number; aguardando: number; ticket: number; semComprovante: number }
export type LinhaDistribuicao = { rotulo: string; lancamentos: number; pctLancamentos: number; valor: number; participacao: number }
/** `grupos` conta todos os grupos; `linhas` passa pelo `topByShare` (participação por valor) do `renderDistributionTable`. */
export type Distribuicao = { grupos: number; linhas: LinhaDistribuicao[] }
export type LinhaMotorista = {
  key: string; motorista: string; hospedagem: number; hospedagemMedia: number | null
  alimentacao: number; alimentacaoMediaDia: number; total: number; lancamentos: number
}
export type OpcoesDespesa = { categorias: Opcao[]; formas: Opcao[]; empresas: Opcao[] }
export type Despesas = {
  lancamentos: number
  total: number
  kpis: KpiDespesa[]
  porMes: LinhaMes[]
  /** `grafico`: as 8 maiores categorias por valor (barra horizontal do legado), sem `topByShare`. */
  porCategoria: Distribuicao & { grafico: LinhaDistribuicao[] }
  porEmpresa: Distribuicao
  gruposDre: Distribuicao
  porMotorista: LinhaMotorista[]
  opcoes: OpcoesDespesa
}

type Grupo = { rotulo: string; qtd: number; valor: number }
/** `aggregateExpenses`: soma por chave; valor desc, quantidade desc, rótulo. */
function agregar(rows: Despesa[], chave: (d: Despesa) => string): Grupo[] {
  const map = new Map<string, Grupo>()
  for (const d of rows) {
    const k = chave(d) || 'Não informado'
    const g = map.get(k) ?? { rotulo: k, qtd: 0, valor: 0 }
    g.qtd += 1
    g.valor += d.valor
    map.set(k, g)
  }
  return [...map.values()].sort((a, b) => b.valor - a.valor || b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}

function linhaDistribuicao(g: Grupo, lancamentos: number, total: number): LinhaDistribuicao {
  return {
    rotulo: g.rotulo, lancamentos: g.qtd, pctLancamentos: lancamentos ? (g.qtd / lancamentos) * 100 : 0,
    valor: g.valor, participacao: total ? (g.valor / total) * 100 : 0,
  }
}

/** `renderDistributionTable` com `participationByValue`: base = soma dos grupos; `limit` 10 (8 em categorias). */
function distribuicao(grupos: Grupo[], lancamentos: number, limite = 10): Distribuicao {
  const total = grupos.reduce((s, g) => s + g.valor, 0)
  return { grupos: grupos.length, linhas: topByShare(grupos, total, (g) => g.valor, limite).map((g) => linhaDistribuicao(g, lancamentos, total)) }
}

/** Une `aggregateFoodExpensesByDriver`, a média mensal por motorista e a hospedagem numa linha por motorista. */
function porMotorista(rows: Despesa[]): LinhaMotorista[] {
  type Acc = { key: string; motorista: string; total: number; lancamentos: number; hosp: number; hospQtd: number; alim: number; diasAlim: Set<string> }
  const map = new Map<string, Acc>()
  for (const d of rows) {
    if (!d.motorista || d.motorista === SEM_MOTORISTA || !d.dia) continue
    const key = chaveMotorista(d)
    const a = map.get(key) ?? { key, motorista: d.motorista, total: 0, lancamentos: 0, hosp: 0, hospQtd: 0, alim: 0, diasAlim: new Set<string>() }
    a.total += d.valor
    a.lancamentos += 1
    if (ehHospedagem(d)) { a.hosp += d.valor; a.hospQtd += 1 }
    if (ehAlimentacao(d)) { a.alim += d.valor; a.diasAlim.add(d.dia) }
    map.set(key, a)
  }
  return [...map.values()]
    .map((a) => ({
      key: a.key, motorista: a.motorista, hospedagem: a.hosp, hospedagemMedia: a.hospQtd ? a.hosp / a.hospQtd : null,
      alimentacao: a.alim, alimentacaoMediaDia: a.diasAlim.size ? a.alim / a.diasAlim.size : 0, total: a.total, lancamentos: a.lancamentos,
    }))
    .sort((a, b) => b.total - a.total || b.lancamentos - a.lancamentos || a.motorista.localeCompare(b.motorista, 'pt-BR'))
}

/** `setExpenseMultiselect`: valor não vazio, primeiro rótulo vale, ordem alfabética pt-BR. */
function opcoes(pares: { value: string; label: string }[]): Opcao[] {
  const map = new Map<string, string>()
  for (const { value, label } of pares) if (value && !map.has(value)) map.set(value, label || value)
  return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/**
 * `renderDespesas` do legado. `periodoAnterior` é a janela do chip "ANT." (use `periodoAnteriorDespesa`); null = s/dado.
 * As opções dos filtros vêm de todas as despesas carregadas e dos cadastros, como no `populateExpenseFilters`.
 * Período pelo dia salvo (texto bruto, `dateKey`); séries mensais pelo mês em Brasília (`d.mes`, o `mK` do legado).
 * `indisponivel`: as despesas falharam (`dvDisabled` do legado) e os KPIs ficam null, sem chip, série nem faixa.
 */
export function calcularDespesas(
  despesas: Despesa[], categorias: CategoriaDespesa[], formas: FormaPagamento[], periodo: Periodo, f: FiltrosDespesa, periodoAnterior: Periodo | null,
  indisponivel: boolean,
): Despesas {
  const base = (indisponivel ? [] : despesas).filter((d) => passaFiltros(d, f))
  const rows = base.filter((d) => noPeriodo(d, periodo))
  const atual = metricas(rows)
  const anterior: Metricas | null = periodoAnterior ? metricas(base.filter((d) => noPeriodo(d, periodoAnterior))) : null

  const porMes: LinhaMes[] = agregar(rows, (d) => d.mes)
    .map((g) => {
      const m = metricas(rows.filter((d) => d.mes === g.rotulo))
      return { mes: g.rotulo, rotulo: mesRotulo(g.rotulo), lancamentos: g.qtd, valor: g.valor, alimentacao: m.alimentacao, aguardando: m.aguardando, ticket: m.ticket, semComprovante: m.semComprovante }
    })
    .sort((a, b) => a.mes.localeCompare(b.mes))
  const serie = (fn: (l: LinhaMes) => number): PontoSerie[] => porMes.map((l) => ({ mes: l.mes, rotulo: l.rotulo, valor: fn(l) }))

  const hospedagem = rows.filter(ehHospedagem)
  const mediaHosp = hospedagem.length ? soma(hospedagem) / hospedagem.length : null
  const serieHosp: PontoSerie[] = agregar(hospedagem, (d) => d.mes)
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo))
    .map((g) => ({ mes: g.rotulo, rotulo: mesRotulo(g.rotulo), valor: g.valor / g.qtd }))

  const chip = (k: keyof Metricas, moeda: boolean) => chipAnterior(atual[k], anterior ? anterior[k] : null, moeda)
  const kpis: KpiDespesa[] = [
    { id: 'despesa', rotulo: 'Despesa realizada', valor: atual.total, formato: 'brlS', chip: chip('total', true), serie: serie((l) => l.valor) },
    { id: 'alimentacao', rotulo: 'Alimentação', valor: atual.alimentacao, formato: 'brlS', chip: chip('alimentacao', true), serie: serie((l) => l.alimentacao) },
    { id: 'aguardando', rotulo: 'Aguardando pagamento', valor: atual.aguardando, formato: 'brlS', chip: chip('aguardando', true), serie: serie((l) => l.aguardando) },
    { id: 'ticket', rotulo: 'Ticket médio', valor: atual.ticket, formato: 'brl', chip: chip('ticket', true), serie: serie((l) => l.ticket) },
    { id: 'semComprovante', rotulo: 'Sem comprovante', valor: atual.semComprovante, formato: 'int', chip: chip('semComprovante', false), serie: serie((l) => l.semComprovante) },
    { id: 'hospedagem', rotulo: 'Média hospedagem', valor: mediaHosp, formato: 'brl', chip: null, serie: serieHosp, faixa: faixaHospedagem(mediaHosp) },
  ]
  const kpisFinais = indisponivel
    ? kpis.map((k): KpiDespesa => ({ id: k.id, rotulo: k.rotulo, formato: k.formato, valor: null, chip: null, serie: [] }))
    : kpis

  const dre = new Map(categorias.map((c) => [c.id, c.grupoDre]))
  const categoriasAgr = agregar(rows, (d) => d.categoria)
  const totalCategorias = categoriasAgr.reduce((s, g) => s + g.valor, 0)

  return {
    lancamentos: rows.length,
    total: atual.total,
    kpis: kpisFinais,
    porMes,
    porCategoria: {
      ...distribuicao(categoriasAgr, rows.length, 8),
      grafico: categoriasAgr.slice(0, 8).map((g) => linhaDistribuicao(g, rows.length, totalCategorias)),
    },
    porEmpresa: distribuicao(agregar(rows, (d) => d.empresa), rows.length),
    gruposDre: distribuicao(agregar(rows, (d) => dre.get(d.categoriaId) || 'Sem grupo DRE'), rows.length),
    porMotorista: porMotorista(rows),
    opcoes: {
      categorias: opcoes(categorias.map((c) => ({ value: c.id, label: c.nome }))),
      formas: opcoes(formas.map((fp) => ({ value: fp.id, label: fp.nome }))),
      empresas: opcoes(despesas.map((d) => ({ value: d.empresa, label: d.empresa }))),
    },
  }
}
