import type { FilterLocked } from '@betinhos/ui'
import { columnLabel, type FilterLabel, type LockedFilters } from './table-view'
import type { CatalogField, ViewFilter, ViewFilterGroup } from './views'
import { describeValue, LOCKED_REASON, lockedSentence as sentence } from '../../../app/viewFetchFilters'
import { fetchAliasPaths, fetchLinks, pathSignature } from './fetch-links'

export { LOCKED_REASON, operatorLabel } from '../../../app/viewFetchFilters'

/** "Trajeto não começa com GRU": nome de exibição do catálogo e o valor já com nome (lookup/escolha). */
export function describeLockedFilter(filter: ViewFilter, catalog: Map<string, CatalogField>, valueLabel: FilterLabel): string {
  const values = (filter.values?.length ? filter.values : filter.value ? [filter.value] : []).map((value) => valueLabel(filter.id, value))
  return sentence(columnLabel(filter.id, catalog), filter.operator, values.join(filter.operator === 'between' ? ' e ' : ', '))
}

const describeGroup = (group: ViewFilterGroup, describe: (filter: ViewFilter) => string) =>
  group.filters.length > 1 ? `${group.operator === 'or' ? 'uma destas' : 'todas estas'}: ${group.filters.map(describe).join('; ')}` : group.filters.map(describe).join('')

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

/** Nome de um valor que o FetchXML traz só como código ou GUID (opção da escolha, registro do lookup); `undefined` = ainda sem nome. */
export type NativeValueName = (field: CatalogField, value: string) => string | undefined

/** GUID e código de escolha como o `labelKey` da tela os guarda: minúsculo, sem chaves. */
export const nativeValueKey = (text: string) => text.trim().replace(/^\{|\}$/g, '').toLowerCase()

type NativeCondition = { node: Element; field: CatalogField | undefined; linked: boolean }

/** Campo do catálogo de uma condição do FetchXML: pelo alias (`entityname`) ou pelo vínculo em que ela está; sem nenhum dos dois, é da raiz. */
function nativeCondition(node: Element, linkPath: string, aliasPaths: Map<string, string>, catalog: CatalogField[]): NativeCondition {
  const alias = node.getAttribute('entityname')
  const path = alias ? aliasPaths.get(alias) : linkPath
  const attribute = node.getAttribute('attribute')
  const field = path === undefined ? undefined : catalog.find((item) => item.attribute === attribute && pathSignature(item.path, item.relationships) === path)
  return { node, field, linked: Boolean(alias) || linkPath !== '' }
}

/** Cada `<filter>` do FetchXML da visão com o caminho do vínculo em que está ('' = entidade raiz). */
function nativeFilters(entity: Element) {
  const filtersOf = (parent: Element, linkPath: string) => [...parent.children].filter((child) => child.tagName === 'filter').map((filter) => ({ filter, linkPath }))
  return [...filtersOf(entity, ''), ...fetchLinks(entity).flatMap(({ link, path }) => filtersOf(link, path))]
}

function parseEntity(fetchXml: string | null) {
  if (!fetchXml) return null
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  return document.querySelector('parsererror') ? null : document.querySelector('fetch > entity')
}

/** Campos de escolha e de lookup que as condições nativas citam, com os valores: a tela lê os nomes deles do Dataverse. */
export function nativeValueRefs(fetchXml: string | null, catalog: CatalogField[]): { field: CatalogField; values: string[] }[] {
  const entity = parseEntity(fetchXml)
  if (!entity) return []
  const aliasPaths = fetchAliasPaths(entity)
  const found = new Map<string, { field: CatalogField; values: Set<string> }>()
  for (const { filter, linkPath } of nativeFilters(entity)) {
    for (const node of filter.querySelectorAll('condition')) {
      const { field } = nativeCondition(node, linkPath, aliasPaths, catalog)
      if (!field || !['Picklist', 'State', 'Status', 'Lookup'].includes(field.type)) continue
      const entry = found.get(field.id) ?? { field, values: new Set<string>() }
      const single = node.getAttribute('value')
      const raw = single != null ? [single] : [...node.querySelectorAll('value')].map((item) => item.textContent ?? '')
      raw.map(nativeValueKey).filter(Boolean).forEach((value) => entry.values.add(value))
      found.set(field.id, entry)
    }
  }
  return [...found.values()].map(({ field, values }) => ({ field, values: [...values] }))
}

/**
 * Filtros originais de uma visão nativa que a tela não edita (lidos do FetchXML, da entidade raiz e dos vínculos):
 * valem na consulta e aparecem só para leitura, sem ×. Condição solta num filtro E vira um item; filtro OU ou aninhado
 * vira "uma destas: …"/"todas estas: …" (só com mais de uma condição). Campo e valor saem com nome, nunca com código:
 * o campo vem do catálogo (alias → caminho do vínculo), o valor de `valueName` e do `uiname`.
 */
export function nativeLockedItems(fetchXml: string | null, catalog: CatalogField[], valueName?: NativeValueName): FilterLocked[] {
  const entity = parseEntity(fetchXml)
  if (!entity) return []
  const aliasPaths = fetchAliasPaths(entity)
  const byId = new Map(catalog.map((field) => [field.id, field]))
  const describeNative = (node: Element, linkPath: string) => {
    const { field, linked } = nativeCondition(node, linkPath, aliasPaths, catalog)
    const attribute = node.getAttribute('attribute') ?? ''
    const name = field ? (field.path.length ? columnLabel(field.id, byId) : field.label) : linked ? 'Campo de tabela relacionada' : attribute
    const nameOf = field && valueName ? (text: string) => valueName(field, nativeValueKey(text)) : undefined
    return sentence(name, node.getAttribute('operator') ?? 'condição', describeValue(node, undefined, nameOf))
  }
  const describeFilter = (filter: Element, linkPath: string): string => {
    const parts = [...filter.children].map((child) => (child.tagName === 'filter' ? (child.children.length > 1 ? `(${describeFilter(child, linkPath)})` : describeFilter(child, linkPath)) : describeNative(child, linkPath)))
    return parts.length > 1 ? `${filter.getAttribute('type') === 'or' ? 'uma destas' : 'todas estas'}: ${parts.join('; ')}` : parts.join('')
  }
  const labels = nativeFilters(entity).flatMap(({ filter, linkPath }) => (filter.getAttribute('type') === 'or'
    ? [describeFilter(filter, linkPath)]
    : [...filter.children].map((child) => (child.tagName === 'filter' ? describeFilter(child, linkPath) : describeNative(child, linkPath)))))
  return labels.map((label, index) => ({ id: `n:${index}`, label, reason: LOCKED_REASON, removable: false }))
}
