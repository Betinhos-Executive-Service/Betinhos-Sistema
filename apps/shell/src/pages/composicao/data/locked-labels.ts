import type { FilterLocked } from '@betinhos/ui'
import { columnLabel, type FilterLabel, type LockedFilters } from './table-view'
import type { CatalogField, ViewFilter, ViewFilterGroup } from './views'

const OPERATORS: Record<string, string> = {
  eq: 'igual a', ne: 'diferente de', in: 'é um de', 'not-in': 'não é nenhum de', between: 'entre', like: 'contém', 'not-like': 'não contém',
  'begins-with': 'começa com', 'not-begins-with': 'não começa com', 'ends-with': 'termina com', 'not-ends-with': 'não termina com',
  gt: 'maior que', ge: 'maior ou igual a', lt: 'menor que', le: 'menor ou igual a', null: 'está vazio', 'not-null': 'está preenchido',
  on: 'em', 'on-or-after': 'a partir de', 'on-or-before': 'até', today: 'hoje', tomorrow: 'amanhã', yesterday: 'ontem', 'this-week': 'esta semana',
  'this-month': 'este mês', 'last-month': 'mês passado', 'next-x-days': 'nos próximos dias', 'last-x-days': 'nos últimos dias',
}
export const operatorLabel = (operator: string) => OPERATORS[operator] ?? operator

/** Motivo do "só leitura" no painel de filtros. */
export const LOCKED_REASON = "Condição da visão que esta tela não sabe editar. Ela continua valendo; para mudar, edite a visão no Dynamics ou use 'Salvar como'."

const sentence = (field: string, operator: string, value: string) => [field, operatorLabel(operator), value].filter(Boolean).join(' ')

/** "Trajeto não começa com GRU": nome de exibição do catálogo e o valor já com nome (lookup/escolha). */
export function describeLockedFilter(filter: ViewFilter, catalog: Map<string, CatalogField>, valueLabel: FilterLabel): string {
  const values = (filter.values?.length ? filter.values : filter.value ? [filter.value] : []).map((value) => valueLabel(filter.id, value))
  return sentence(columnLabel(filter.id, catalog), filter.operator, values.join(filter.operator === 'between' ? ' e ' : ', '))
}

const describeGroup = (group: ViewFilterGroup, describe: (filter: ViewFilter) => string) =>
  `${group.operator === 'or' ? 'uma destas' : 'todas estas'}: ${group.filters.map(describe).join('; ')}`

/**
 * Condições travadas da definição → itens só leitura do painel "Filtros". Ids estáveis: `f:<i>` (condição solta),
 * `g:<i>` (grupo ligado por E) e `o` (os grupos ligados por OU, que só valem juntos).
 */
export function lockedItems(locked: LockedFilters, catalog: Map<string, CatalogField>, valueLabel: FilterLabel): FilterLocked[] {
  const describe = (filter: ViewFilter) => describeLockedFilter(filter, catalog, valueLabel)
  return [
    ...locked.filters.map((filter, index) => ({ id: `f:${index}`, label: describe(filter), reason: LOCKED_REASON })),
    ...locked.groups.map((group, index) => ({ id: `g:${index}`, label: describeGroup(group, describe), reason: LOCKED_REASON })),
    ...(locked.orGroups.length
      ? [{ id: 'o', label: `uma destas: ${locked.orGroups.map((group) => `(${group.filters.map(describe).join(group.operator === 'or' ? ' ou ' : ' e ')})`).join('; ')}`, reason: LOCKED_REASON }]
      : []),
  ]
}

/** Tira um item de `lockedItems` das condições travadas; id desconhecido devolve o mesmo objeto. */
export function withoutLocked(locked: LockedFilters, id: string): LockedFilters {
  const [kind, raw] = id.split(':')
  const index = Number(raw)
  if (kind === 'f') return { ...locked, filters: locked.filters.filter((_, i) => i !== index) }
  if (kind === 'g') return { ...locked, groups: locked.groups.filter((_, i) => i !== index) }
  if (kind === 'o') return { ...locked, orGroups: [] }
  return locked
}

function describeNative(condition: Element, catalog: CatalogField[]) {
  const attribute = condition.getAttribute('attribute') ?? ''
  const field = catalog.find((item) => item.attribute === attribute)
  const value = condition.getAttribute('value') ?? [...condition.querySelectorAll('value')].map((item) => item.textContent ?? '').join(', ')
  return sentence(field?.label ?? attribute, condition.getAttribute('operator') ?? 'condição', value)
}

/**
 * Filtros originais de uma visão nativa que a tela não edita (lidos do FetchXML): valem na consulta e aparecem só para
 * leitura, sem ×. Condição solta num filtro E vira um item; filtro OU ou aninhado vira "uma destas: …"/"todas estas: …".
 */
export function nativeLockedItems(fetchXml: string | null, catalog: CatalogField[]): FilterLocked[] {
  if (!fetchXml) return []
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const entity = document.querySelector('parsererror') ? null : document.querySelector('fetch > entity')
  if (!entity) return []
  const describeFilter = (filter: Element): string =>
    `${filter.getAttribute('type') === 'or' ? 'uma destas' : 'todas estas'}: ${[...filter.children].map((child) => (child.tagName === 'filter' ? `(${describeFilter(child)})` : describeNative(child, catalog))).join('; ')}`
  const labels = [...entity.children].filter((child) => child.tagName === 'filter').flatMap((filter) => (filter.getAttribute('type') === 'or'
    ? [describeFilter(filter)]
    : [...filter.children].map((child) => (child.tagName === 'filter' ? describeFilter(child) : describeNative(child, catalog)))))
  return labels.map((label, index) => ({ id: `n:${index}`, label, reason: LOCKED_REASON, removable: false }))
}
