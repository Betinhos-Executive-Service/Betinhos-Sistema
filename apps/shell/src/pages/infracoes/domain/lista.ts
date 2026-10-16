import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { COMPETENCIA, GRAVIDADE, RESPONSABILIDADE, label } from './choices'
import { normalize, type Filters } from './filters'
import type { Infracao } from './types'

/**
 * O catálogo de Infrações no padrão das listas do Design System (§10.9.1 e §10.9.2): colunas da visão, campos de
 * filtro, leitura em memória e visões prontas. A Visão padrão mostra só as ativas, como antes.
 */

export const TELA = 'infracoes'
export const INFRACAO_SORT: ViewSort = { key: 'infracao', dir: 'asc' }

/** Colunas na ordem padrão; a primeira (Infração) é fixa. */
export const INFRACAO_COLUMNS: ViewColumnDef[] = [
  { key: 'infracao', label: 'Infração' },
  { key: 'gravidade', label: 'Gravidade' },
  { key: 'pontos', label: 'Pontos' },
  { key: 'valor', label: 'Valor' },
  { key: 'competencia', label: 'Competência' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'multas', label: 'Multas' },
]

const options = (list: { value: number; label: string }[]): FilterOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))
const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

/** Campos filtráveis: os das colunas entram no filtro rápido; os demais só no avançado. */
export const INFRACAO_FIELDS: FilterField[] = [
  { key: 'infracao', label: 'Infração', kind: 'text' },
  { key: 'gravidade', label: 'Gravidade', kind: 'choice', options: options(GRAVIDADE) },
  { key: 'pontos', label: 'Pontos', kind: 'number' },
  { key: 'valor', label: 'Valor', kind: 'number', money: true },
  { key: 'competencia', label: 'Competência', kind: 'choice', options: options(COMPETENCIA) },
  { key: 'responsavel', label: 'Responsável', kind: 'choice', options: options(RESPONSABILIDADE) },
  { key: 'multas', label: 'Multas (12 meses)', kind: 'number' },
  { key: 'ativa', label: 'Ativa', kind: 'bool', options: SIM_NAO, advancedOnly: true },
  { key: 'enquadramento', label: 'Enquadramento', kind: 'text', advancedOnly: true },
]

const asText = (v: number | null) => (v == null ? null : String(v))

/** Valor de cada campo; `multas` = quantas multas usam a infração. */
export function readInfracao(i: Infracao, key: string, multas: (id: string) => number): unknown {
  switch (key) {
    case 'infracao': return [i.codigo, i.descricao, i.enquadramento].filter(Boolean).join(' ')
    case 'gravidade': return asText(i.gravidade)
    case 'pontos': return i.pontos
    case 'valor': return i.valor
    case 'competencia': return i.competencia.map(String)
    case 'responsavel': return asText(i.responsabilidade)
    case 'multas': return multas(i.id)
    case 'ativa': return i.ativo
    case 'enquadramento': return i.enquadramento
    default: return null
  }
}

/** Sem acento, sem caixa e sem pontuação de código ("574-6" acha "5746"). */
const compact = (text: string) => normalize(text).replace(/[\s.\-/]/g, '')

/** Busca por palavra-chave (não fica na visão): código, descrição e artigo. */
export function matchesKeyword(i: Infracao, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = normalize(`${i.codigo} ${i.descricao} ${i.enquadramento}`)
  const code = compact(i.codigo)
  return terms.every((t) => hay.includes(t) || code.includes(compact(t)))
}

export function sortInfracoes(list: Infracao[], sort: ViewSort | null, multas: (id: string) => number) {
  if (!sort) return list
  return sortRows(list, (i) => {
    switch (sort.key) {
      case 'infracao': return Number(i.codigo.replace(/\D/g, '')) || i.codigo || null
      case 'gravidade': return i.gravidade
      case 'pontos': return i.pontos
      case 'valor': return i.valor
      case 'competencia': return i.competencia.map((v) => label(COMPETENCIA, v)).join(', ')
      case 'responsavel': return i.responsabilidade == null ? null : label(RESPONSABILIDADE, i.responsabilidade)
      case 'multas': return multas(i.id)
      default: return null
    }
  }, sort.dir)
}

const quick = (field: string, list: { value: number; label: string }[], values: number[]): FilterCondition =>
  ({ type: 'condition', id: `rapido-${field}`, field, op: 'in', values: values.map((v) => ({ value: String(v), label: label(list, v, String(v)) })) })
const ativa = (yes: boolean): FilterCondition => ({ type: 'condition', id: `ativa-${yes ? 'yes' : 'no'}`, field: 'ativa', op: yes ? 'yes' : 'no' })
const comMultas: FilterCondition = { type: 'condition', id: 'rapido-multas', field: 'multas', op: 'gt', value: 0 }
const advanced = (items: FilterCondition[], quickConds: FilterCondition[] = []): TableFilters =>
  ({ ...emptyFilters(), quick: Object.fromEntries(quickConds.map((c) => [c.field, c])), advanced: { ...emptyFilters().advanced, items } })

/** A Visão padrão: só as ativas. */
export const INFRACAO_DEFAULT_FILTERS = advanced([ativa(true)])

/** Filtros antigos na URL (`gravidade`, `competencia`, `responsabilidade`, `situacao`, `multas`) no formato novo. */
export function fromLegacyFilters(f: Omit<Filters, 'query'>): TableFilters {
  const conds: FilterCondition[] = []
  if (f.gravidade.length) conds.push(quick('gravidade', GRAVIDADE, f.gravidade))
  if (f.competencia != null) conds.push(quick('competencia', COMPETENCIA, [f.competencia]))
  if (f.responsabilidade != null) conds.push(quick('responsavel', RESPONSABILIDADE, [f.responsabilidade]))
  if (f.comMultas) conds.push(comMultas)
  return advanced(f.situacao === 'todas' ? [] : [ativa(f.situacao === 'ativas')], conds)
}

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: INFRACAO_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: INFRACAO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas: o que a barra antiga oferecia por situação e "só com multas". */
export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('todas', 'Ativas e inativas', 1, emptyFilters()),
    view('inativas', 'Inativas', 2, advanced([ativa(false)])),
    view('com-multas', 'Com multas', 3, advanced([ativa(true)], [comMultas])),
  ]
}
