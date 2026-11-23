import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { dataCurta, diaSp, exigenciasDe, progressoDe, publicoCelula, validadeDe, type ProgressoConta } from './tabela'
import { ESTADO, PUBLICO, formatDate, isPublicado, type Funcionario, type Treinamento } from './treinamentos'

/** Treinamentos no padrão de listas do DS (§10.9.1/§10.9.2). A Visão padrão mostra rascunhos e publicados. */

export const TELA = 'treinamentos'
export const TREINAMENTO_SORT: ViewSort = { key: 'criado', dir: 'desc' }

export const TREINAMENTO_COLUMNS: ViewColumnDef[] = [
  { key: 'titulo', label: 'Treinamento' },
  { key: 'descricao', label: 'Descrição' },
  { key: 'estado', label: 'Situação' },
  { key: 'progresso', label: 'Conclusão' },
  { key: 'publico', label: 'Público-alvo' },
  { key: 'exigencias', label: 'Exige' },
  { key: 'validade', label: 'Validade' },
  { key: 'publicadoEm', label: 'Publicado em' },
  { key: 'criado', label: 'Criado em', defaultHidden: true },
]

const ESTADO_FILTER: FilterOption[] = [{ value: String(ESTADO.rascunho), label: 'Rascunho' }, { value: String(ESTADO.publicado), label: 'Publicado' }]
const PUBLICO_FILTER: FilterOption[] = [{ value: String(PUBLICO.motoristas), label: 'Todos os motoristas' }, { value: String(PUBLICO.funcao), label: 'Por função' }, { value: String(PUBLICO.selecionados), label: 'Selecionados' }]
const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

export const TREINAMENTO_FIELDS: FilterField[] = [
  { key: 'titulo', label: 'Treinamento', kind: 'text' },
  { key: 'descricao', label: 'Descrição', kind: 'text' },
  { key: 'estado', label: 'Situação', kind: 'choice', options: ESTADO_FILTER },
  { key: 'publico', label: 'Público-alvo', kind: 'choice', options: PUBLICO_FILTER },
  { key: 'validade', label: 'Validade', kind: 'date' },
  { key: 'publicadoEm', label: 'Publicado em', kind: 'date' },
  { key: 'exigeAssinatura', label: 'Exige assinatura', kind: 'bool', options: SIM_NAO, advancedOnly: true },
  { key: 'exigeQuiz', label: 'Exige quiz', kind: 'bool', options: SIM_NAO, advancedOnly: true },
]

/** Linha da lista: o treinamento mais a data de criação (ordenação padrão). */
export type Linha = Treinamento & { criadoEm: string }

/** Dia (AAAA-MM-DD) da publicação no fuso de São Paulo; texto só com a data não tem hora para converter e vale como está. */
const diaPublicacao = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : diaSp(date)
}

export function readTreinamento(t: Linha, key: string): unknown {
  switch (key) {
    case 'titulo': return t.titulo
    case 'descricao': return t.descricao
    case 'estado': return String(t.estado)
    case 'publico': return String(t.publicoTipo)
    case 'validade': return t.validade || null
    case 'publicadoEm': return t.publicadoEm ? diaPublicacao(t.publicadoEm) : null
    case 'exigeAssinatura': return t.exigeAssinatura
    case 'exigeQuiz': return t.exigeQuiz
    default: return null
  }
}

/**
 * Texto da busca por palavras: o que a tabela mostra (título, descrição, situação, conclusão, público, exigências, validade,
 * datas) mais o conteúdo do treinamento, que já vem na carga.
 */
export function treinamentoKeywordText(t: Linha, funcionarios: Funcionario[], progresso: Record<string, ProgressoConta>, hoje: string) {
  const publico = publicoCelula(t, funcionarios)
  const validade = validadeDe(t, hoje)
  return [
    t.titulo, t.descricao, isPublicado(t) ? 'Publicado' : 'Rascunho', progressoDe(progresso[t.id])?.texto, publico.principal, publico.detalhe,
    ...exigenciasDe(t).map((e) => e.label), validade?.texto, validade?.completa,
    t.publicadoEm && dataCurta(t.publicadoEm), t.publicadoEm && formatDate(t.publicadoEm), t.criadoEm && dataCurta(t.criadoEm), t.criadoEm && formatDate(t.criadoEm), t.conteudo,
  ].filter(Boolean).join(' ')
}

export function sortTreinamentos(list: Linha[], sort: ViewSort | null, progresso: Record<string, ProgressoConta> = {}) {
  if (!sort) return list
  return sortRows(list, (t) => {
    switch (sort.key) {
      case 'titulo': return t.titulo || null
      case 'descricao': return t.descricao || null
      case 'estado': return t.estado
      case 'progresso': return progressoDe(progresso[t.id])?.pct ?? null
      case 'publico': return t.publicoTipo
      case 'exigencias': return Number(t.exigeAssinatura) + Number(t.exigeQuiz)
      case 'validade': return t.validade || null
      case 'publicadoEm': return t.publicadoEm
      case 'criado': return t.criadoEm
      default: return null
    }
  }, sort.dir)
}

const quickEstado = (values: number[]): FilterCondition =>
  ({ type: 'condition', id: 'rapido-estado', field: 'estado', op: 'in', values: ESTADO_FILTER.filter((o) => values.includes(Number(o.value))) })
const withQuick = (quick: FilterCondition[]): TableFilters => ({ ...emptyFilters(), quick: Object.fromEntries(quick.map((c) => [c.field, c])) })

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: TREINAMENTO_COLUMNS.map((c) => ({ key: c.key, visible: !c.defaultHidden })),
  sort: TREINAMENTO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('rascunhos', 'Rascunhos', 1, withQuick([quickEstado([ESTADO.rascunho])])),
    view('publicados', 'Publicados', 2, withQuick([quickEstado([ESTADO.publicado])])),
  ]
}
