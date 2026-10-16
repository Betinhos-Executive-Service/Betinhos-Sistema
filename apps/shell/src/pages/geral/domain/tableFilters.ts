import { emptyFilters, filtersToFetchXml, readFilters, type FilterCondition, type FilterField, type TableFilters } from '@betinhos/ui'
import { decodeTableFilters as decodeShared } from '../../../app/filtersUrl'
import { parse } from './fetch'
import { decodeFilters, type Filter, type FilterSet } from './filters'
import { filterKindOf } from './filterKind'
import type { AttributeMap } from './types'

export { encodeTableFilters, hasActiveFilters } from '../../../app/filtersUrl'

/**
 * Ponte entre a Geral e os filtros do Design System (§10.9.2): campos filtráveis a partir da metadata, conversão do
 * formato antigo (um filtro por atributo, ainda presente em links já compartilhados) e injeção no FetchXML da visão.
 */

/** Campos filtráveis da raiz, na ordem: colunas da visão primeiro, depois os demais em ordem alfabética. */
export function geralFilterFields(attributes: AttributeMap | null, columnKeys: string[] = []): FilterField[] {
  if (!attributes) return []
  const fields: FilterField[] = []
  for (const [key, info] of attributes) {
    if (key.includes('.')) continue
    const kind = filterKindOf(key, info)
    if (!kind) continue
    const field: FilterField = { key, label: info.label || key, kind }
    if (kind === 'choice' || kind === 'bool') field.options = info.options.map((o) => ({ value: String(o.value), label: o.label }))
    if (kind === 'number' && info.type === 'Money') field.money = true
    fields.push(field)
  }
  const position = (key: string) => {
    const index = columnKeys.indexOf(key)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }
  return fields.sort((a, b) => position(a.key) - position(b.key) || a.label.localeCompare(b.label, 'pt-BR'))
}

const addDays = (day: string, days: number) => {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Um filtro do formato antigo vira condição de filtro rápido; o que não tem equivalente sai. */
function legacyCondition(attribute: string, f: Filter, attributes: AttributeMap | null): FilterCondition | null {
  const base = { type: 'condition' as const, id: `rapido-${attribute}`, field: attribute }
  switch (f.kind) {
    case 'text':
      return f.op === 'empty' || f.op === 'not-empty' ? { ...base, op: f.op } : f.value?.trim() ? { ...base, op: f.op, value: f.value } : null
    case 'choice': {
      if (f.op === 'empty') return { ...base, op: 'empty' }
      const options = attributes?.get(attribute)?.options ?? []
      const values = (f.values ?? []).map((v) => ({ value: String(v), label: options.find((o) => o.value === v)?.label ?? String(v) }))
      return values.length ? { ...base, op: 'in', values } : null
    }
    case 'lookup':
      if (f.op === 'empty') return { ...base, op: 'empty' }
      return f.values?.length ? { ...base, op: 'in', values: f.values.map((v) => ({ value: v.id, label: v.nome })) } : null
    case 'date': {
      const relative: Record<string, FilterCondition['op']> = { today: 'today', tomorrow: 'tomorrow', yesterday: 'yesterday', 'this-week': 'this-week', 'next-7': 'next-7', 'last-7': 'last-7', 'this-month': 'this-month', empty: 'empty' }
      if (f.op !== 'range') return { ...base, op: relative[f.op] }
      if (f.from && f.to) return { ...base, op: 'between', value: f.from.slice(0, 10), to: f.to.slice(0, 10) }
      // Intervalo aberto: "a partir de" = depois do dia anterior; "até" = antes do dia seguinte.
      if (f.from) return { ...base, op: 'after', value: addDays(f.from, -1) }
      if (f.to) return { ...base, op: 'before', value: addDays(f.to, 1) }
      return null
    }
    case 'number':
      if (f.op === 'empty') return { ...base, op: 'empty' }
      if (f.op === 'between') return f.value != null && f.to != null ? { ...base, op: 'between', value: f.value, to: f.to } : null
      return f.value != null ? { ...base, op: f.op, value: f.value } : null
    case 'bool':
      return { ...base, op: f.op }
  }
}

/** `FilterSet` antigo → filtros rápidos do formato novo. */
export function fromLegacy(set: FilterSet, attributes: AttributeMap | null = null): TableFilters {
  const quick: Record<string, FilterCondition> = {}
  for (const [attribute, f] of Object.entries(set)) {
    const condition = legacyCondition(attribute, f, attributes)
    if (condition) quick[attribute] = condition
  }
  return { ...emptyFilters(), quick }
}

/**
 * Lê `f=` nos dois formatos: o novo (comum às listas) e o antigo da Geral (um filtro por atributo), que é convertido.
 * Texto inválido vira "sem filtros".
 */
export function decodeTableFilters(text: string): TableFilters {
  return decodeShared(text) ?? fromLegacy(decodeFilters(text))
}

/** Filtros conferidos contra os campos atuais (campo que sumiu, operador inválido e grupo fundo demais saem). */
export const effectiveFilters = (filters: TableFilters, fields: FilterField[]) => readFilters(filters, fields)

/** FetchXML da visão com os filtros num `<filter>` próprio, último filho da entidade. Sem filtro valendo, volta igual. */
export function injectTableFilters(fetchxml: string, filters: TableFilters, fields: FilterField[]): string {
  const xml = filtersToFetchXml(effectiveFilters(filters, fields), fields)
  if (!xml) return fetchxml
  const { doc, entity } = parse(fetchxml)
  const fragment = new DOMParser().parseFromString(xml, 'text/xml').documentElement
  entity.appendChild(doc.importNode(fragment, true))
  return new XMLSerializer().serializeToString(doc)
}
