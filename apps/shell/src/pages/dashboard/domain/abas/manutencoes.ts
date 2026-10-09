import { topByShare } from '../analises'
import { agrupar, soma } from '../base'
import { anteriorDe, comparar, type ChipAnterior } from '../comparar'
import { META_MANUTENCAO } from '../metas'
import { brlS, int, normL } from '../format'
import type { Contexto } from '../kpis'
import { DIA_MS, entre, mesRotulo, mostrarLM, periodoAnoAnterior, periodoMesAnterior, type Periodo } from '../periodo'
import type { Dados, Manutencao } from '../types'

export type CategoriaManutencao =
  | 'Preventiva programada' | 'Corretiva não crítica' | 'Corretiva crítica' | 'Conservação' | 'Avaria' | 'Preventiva por condição'
/** Ordem dos cards do legado; "Preventiva por condição" é calculada pelo legado sem card e entra no fim. */
export const CATEGORIAS_MANUTENCAO: readonly CategoriaManutencao[] = [
  'Preventiva programada', 'Corretiva não crítica', 'Corretiva crítica', 'Conservação', 'Avaria', 'Preventiva por condição',
]

/**
 * `maintenanceCategory` do legado (L10516), regras na mesma ordem sobre o rótulo do tipo de reparo. Divergência consciente
 * (spec §6): "nao crit" é testado antes de "crit", porque o legado classificava "Corretiva não crítica" como crítica.
 */
export function categoriaManutencao(tipo: string): CategoriaManutencao {
  const k = normL(tipo)
  if (k.includes('avaria') || k.includes('sinistro') || k.includes('colis')) return 'Avaria'
  if (k.includes('nao crit')) return 'Corretiva não crítica'
  if (k.includes('crit') || k.includes('pane') || k.includes('emerg')) return 'Corretiva crítica'
  if (k.includes('conserv') || k.includes('confort') || k.includes('imagem') || k.includes('limpeza') || k.includes('funilar')) return 'Conservação'
  if (k.includes('condic') || k.includes('pneu') || k.includes('eletric') || k.includes('ar condicionado')) return 'Preventiva por condição'
  if (k.includes('prevent') || k.includes('revis') || k.includes('oleo')) return 'Preventiva programada'
  return 'Corretiva não crítica'
}

/** Status reais de `cr40f_manutencoes.cr40f_status` que contam como em andamento (metadata DEV; spec §6). */
const STATUS_EM_ANDAMENTO: ReadonlySet<string> = new Set(['solicitado', 'aprovado', 'programado'])
/**
 * Manutenção em andamento. Divergência consciente (spec §6): o legado só olhava "andamento", "aberto" e "pend", que nenhum status real
 * contém (Solicitado, Aprovado, Programado, Realizado, Cancelado, Reprovado), e o card ficava sempre em 0. Agora Solicitado, Aprovado e
 * Programado contam (rótulo comparado sem acento e sem caixa); as palavras antigas continuam valendo.
 */
export function manutencaoEmAndamento(statusLabel: string) {
  const k = normL(statusLabel).trim()
  return STATUS_EM_ANDAMENTO.has(k) || k.includes('andamento') || k.includes('aberto') || k.includes('pend')
}

export type StatusMeta = 'dentro' | 'fora' | 'sem-meta' | 'sem-dado'
export type LinhaCategoria = {
  categoria: CategoriaManutencao
  qtd: number
  /** Texto da meta (legado L12968); null sem meta. */
  meta: string | null
  status: StatusMeta
  /** Mesmo período do mês anterior; null quando o LM não aparece (filtro fora do mês corrente). 0 vira chip s/dado. */
  lm: number | null
  /** Mesmo período do ano anterior (sempre mostrado). 0 vira chip s/dado. */
  ly: number
}
export type PrazoManutencao = {
  /** Média dos dias inteiros (floor) entre `createdon` e a data da manutenção; null = s/dado. */
  medio: number | null
  /** % dos prazos em até 10 dias; null = s/dado. */
  ate10: number | null
  medidos: number
  /** Prazo médio no LM (null = s/dado ou LM oculto, ver `mostrarLM`) e no LY (null = s/dado). */
  lm: number | null
  ly: number | null
}
export type LinhaTipoReparo = { tipo: string; qtd: number; valor: number; /** % do custo. */ pct: number; /** % dos registros. */ pctQtd: number }
export type Manutencoes = {
  /** null = s/dado (conjunto não carregou). */
  kpis: { total: number; custoTotal: number; emAndamento: number; custoMedio: number; pctReceita: number } | null
  /** Chips "ANT." de Manutenções e Custo total (cair é favorável); null com a tabela fora do ar. */
  ant: { total: ChipAnterior; custoTotal: ChipAnterior } | null
  custoPorMes: { mes: string; rotulo: string; valor: number }[]
  porTipoReparo: LinhaTipoReparo[]
  categorias: LinhaCategoria[]
  prazo: PrazoManutencao | null
  /** `shouldShowLM`: os chips LM só aparecem com o filtro dentro do mês corrente. */
  mostrarLM: boolean
}

const custo = (rows: Manutencao[]) => rows.reduce((t, m) => t + (m.valor || 0), 0)
/** Dias corridos entre dois dias (AAAA-MM-DD); null sem um deles. */
const dias = (de: string, ate: string) => (de && ate ? Math.round((Date.parse(ate) - Date.parse(de)) / DIA_MS) : null)
/** Aprovação → data da manutenção (meta da preventiva programada), em dias de calendário; negativos ficam fora. */
const prazosAprovacao = (rows: Manutencao[]) =>
  rows.map((m) => dias(m.aprovacaoDia, m.dia)).filter((d): d is number => d !== null && d >= 0)
/** `daysBetweenValues` do legado (L10509): `floor` da diferença entre os instantes de `createdon` e da data; negativos e sem data ficam fora. */
const prazosCriacao = (rows: Manutencao[]) =>
  rows.map((m) => Math.floor((m.dataMs - m.criadoMs) / DIA_MS)).filter((d) => Number.isFinite(d) && d >= 0)
const media = (v: number[]) => (v.length ? v.reduce((t, x) => t + x, 0) / v.length : null)
const META_PREVENTIVA_DIAS = META_MANUTENCAO.preventivaDias
const META_NAO_CRITICA_MES = META_MANUTENCAO.naoCriticaPorMes

function metaDe(categoria: CategoriaManutencao, rows: Manutencao[]): Pick<LinhaCategoria, 'meta' | 'status'> {
  switch (categoria) {
    case 'Corretiva crítica':
      return { meta: META_MANUTENCAO.corretivaCritica ? `Até ${META_MANUTENCAO.corretivaCritica}` : 'Zero', status: rows.length <= META_MANUTENCAO.corretivaCritica ? 'dentro' : 'fora' }
    case 'Corretiva não crítica': {
      const porMes = agrupar(rows, (m) => m.dia.slice(0, 7))
      return { meta: `Até ${META_NAO_CRITICA_MES} por mês`, status: [...porMes.values()].every((l) => l.length <= META_NAO_CRITICA_MES) ? 'dentro' : 'fora' }
    }
    case 'Preventiva programada': {
      const medidos = prazosAprovacao(rows)
      const status: StatusMeta = !medidos.length ? 'sem-dado' : medidos.every((d) => d <= META_PREVENTIVA_DIAS) ? 'dentro' : 'fora'
      return { meta: `Aprovação até a data em até ${META_PREVENTIVA_DIAS} dias`, status }
    }
    default:
      return { meta: null, status: 'sem-meta' }
  }
}

/**
 * Aba Manutenções (`renderManutencoes` + KPIs por categoria do `renderFrota`, L15843–15911). Registros pela data da manutenção no
 * período do filtro (sem segmentos, como `filterByDate`); % da receita sobre o faturamento de `ctx.rv`. Metas: só as do texto do
 * legado (L12968) — corretiva crítica zero, não crítica até 5 no mês e preventiva programada com aprovação até a data em até 10 dias.
 */
export function calcularManutencoes(ctx: Contexto, dados: Dados): Manutencoes {
  const { rv, f, now } = ctx
  const lmVisivel = mostrarLM(f.inicio, f.fim, now)
  if (dados.indisponiveis.includes('manutencoes')) {
    return { kpis: null, ant: null, custoPorMes: [], porTipoReparo: [], categorias: [], prazo: null, mostrarLM: lmVisivel }
  }
  const noPeriodo = (p: Periodo) => dados.manutencoes.filter((m) => entre(m.dia, p.inicio, p.fim))
  const mans = noPeriodo(f)
  const lmRows = lmVisivel ? noPeriodo(periodoMesAnterior(f.inicio, f.fim)) : null
  const lyRows = noPeriodo(periodoAnoAnterior(f.inicio, f.fim))
  const pAnt = anteriorDe(ctx)
  const antRows = pAnt ? noPeriodo(pAnt) : null

  const total = custo(mans)
  const fat = soma(rv)
  const emAndamento = mans.filter((m) => manutencaoEmAndamento(m.statusLabel)).length

  const porMes = agrupar(mans, (m) => m.dia.slice(0, 7))
  const custoPorMes = [...porMes.keys()].filter(Boolean).sort().map((mes) => ({ mes, rotulo: mesRotulo(mes), valor: custo(porMes.get(mes) ?? []) }))

  // `tblManTipo`: chaves por quantidade desc; `renderDistributionTable` com participação por custo corta com `topByShare` sobre o custo.
  const tipos = [...agrupar(mans, (m) => m.tipoReparo || '—')]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([tipo, rows]) => ({ tipo, qtd: rows.length, valor: custo(rows) }))
  const custoTipos = tipos.reduce((t, l) => t + l.valor, 0)
  const porTipoReparo = topByShare(tipos, custoTipos, (l) => l.valor).map((l): LinhaTipoReparo => ({
    ...l, pct: custoTipos ? (l.valor / custoTipos) * 100 : 0, pctQtd: mans.length ? (l.qtd / mans.length) * 100 : 0,
  }))

  const porCategoria = (rows: Manutencao[]) => agrupar(rows, (m) => categoriaManutencao(m.tipoReparo))
  const atual = porCategoria(mans)
  const lmCat = lmRows ? porCategoria(lmRows) : null
  const lyCat = porCategoria(lyRows)
  const categorias = CATEGORIAS_MANUTENCAO.map((categoria): LinhaCategoria => {
    const rows = atual.get(categoria) ?? []
    return { categoria, qtd: rows.length, ...metaDe(categoria, rows), lm: lmCat ? lmCat.get(categoria)?.length ?? 0 : null, ly: lyCat.get(categoria)?.length ?? 0 }
  })

  const medidos = prazosCriacao(mans)
  return {
    ant: {
      total: comparar(mans.length, antRows ? antRows.length : null, int, 'desce'),
      custoTotal: comparar(total, antRows ? custo(antRows) : null, brlS, 'desce'),
    },
    kpis: { total: mans.length, custoTotal: total, emAndamento, custoMedio: mans.length ? total / mans.length : 0, pctReceita: fat > 0 ? (total / fat) * 100 : 0 },
    custoPorMes,
    porTipoReparo,
    categorias,
    prazo: {
      medio: media(medidos),
      ate10: medidos.length ? (medidos.filter((d) => d <= META_PREVENTIVA_DIAS).length / medidos.length) * 100 : null,
      medidos: medidos.length,
      lm: lmRows ? media(prazosCriacao(lmRows)) : null,
      ly: media(prazosCriacao(lyRows)),
    },
    mostrarLM: lmVisivel,
  }
}
