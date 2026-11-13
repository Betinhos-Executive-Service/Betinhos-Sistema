import {
  conditionProblem, emptyFilters, EXTRA_COLUMN_PREFIX, isExtraColumn, storedFilters,
  type ColumnCatalog, type ColumnCatalogType, type FilterCondition, type FilterField, type FilterGroup, type FilterKind, type FilterOption,
  type TableFilters, type ViewColumnDef, type ViewColumnState, type ViewConfig, type ViewSort as TableSort,
} from '@betinhos/ui'
import { moneyFields } from './compositions'
import { isDay, shiftDay } from './date-ranges'
import { isDatePreset, NUMERIC_TYPES, type CatalogField, type ViewColumn, type ViewDefinition, type ViewFilter, type ViewFilterGroup } from './views'

/**
 * Tradução entre a definição de view da Composição (`ViewDefinition`, que vira FetchXML e layoutXml) e o estado da `ViewBar`
 * do Design System (`ViewConfig` + `TableFilters`). A definição continua sendo a fonte: o que o DS não expressa fica
 * "só leitura" (`LockedFilters`) e volta intacto para a definição.
 */

const FIXED_LABELS: Record<string, string> = { client: 'Cliente', route: 'Trajeto', date: 'Data' }

/** Rótulo das colunas da visão padrão que não são fixas do código enquanto a metadata não chega (o nome lógico não aparece para o usuário). */
export const PROVISIONAL_LABELS: Record<string, string> = { new_status: 'Status' }
const TEXT_OPS: Partial<Record<ViewFilter['operator'], FilterCondition['op']>> = { like: 'contains', 'not-like': 'not-contains', eq: 'eq', ne: 'ne', 'begins-with': 'begins', 'ends-with': 'ends' }

/** Tipo do Dataverse → tipo do filtro do DS; `null` quando o DS não filtra o campo (Uniqueidentifier, Customer…). */
export function filterKindOf(type: string): FilterKind | null {
  if (type === 'String' || type === 'Memo') return 'text'
  if (NUMERIC_TYPES.has(type)) return 'number'
  if (type === 'DateTime') return 'date'
  if (type === 'Picklist' || type === 'State' || type === 'Status') return 'choice'
  if (type === 'Lookup') return 'lookup'
  if (type === 'Boolean') return 'bool'
  return null
}

// ---------- Colunas ----------

const enc = encodeURIComponent
/** Relação N:1 do campo no painel de colunas: tabela + lookup de origem (dois lookups para a mesma tabela não se misturam). */
const relationOf = (field: CatalogField) => `${field.table}@${field.relationships?.[0]?.to ?? ''}`

/** Chave `x:` do DS para coluna fora das definições: a mesma que o painel monta a partir do `ColumnCatalog`. */
export function extraColumnKey(id: string, catalog: Map<string, CatalogField>) {
  const field = catalog.get(id)
  return EXTRA_COLUMN_PREFIX + (field?.path.length ? `${enc(relationOf(field))}/${enc(id)}` : enc(id))
}
/** Chave do DS → id da coluna na definição. */
export const columnIdOf = (key: string) => isExtraColumn(key) ? decodeURIComponent(key.slice(EXTRA_COLUMN_PREFIX.length).split('/').pop() ?? '') : key

export function columnLabel(id: string, catalog: Map<string, CatalogField>) {
  const field = catalog.get(id)
  const label = FIXED_LABELS[id] ?? field?.label ?? PROVISIONAL_LABELS[id] ?? moneyFields.find((item) => item.key === id)?.label ?? id
  return field?.path.length && !FIXED_LABELS[id] ? `${field.tableLabel ?? field.table} › ${label}` : label
}

/** Colunas declaradas ao DS: as da visão salva (a primeira é o título), depois as padrão que faltarem (ficam ocultas). */
export function columnDefsOf(baseline: ViewColumn[], defaults: ViewColumn[], catalog: Map<string, CatalogField>): ViewColumnDef[] {
  const ids = [...new Set([...baseline.map((column) => column.id), ...defaults.map((column) => column.id)])]
  return ids.map((id) => ({ key: id, label: columnLabel(id, catalog) }))
}

type KeyOf = (id: string) => string

export function configOf(definition: ViewDefinition, defs: ViewColumnDef[], catalog: Map<string, CatalogField>, keyOf: KeyOf, filters: TableFilters): ViewConfig {
  const shown = new Set(definition.columns.map((column) => column.id))
  const columns: ViewColumnState[] = [
    ...definition.columns.map((column): ViewColumnState => {
      const key = keyOf(column.id)
      return { key, visible: true, width: column.width, ...(key !== column.id ? { label: columnLabel(column.id, catalog) } : {}), ...(column.pinned ? { pinned: true as const } : {}) }
    }),
    ...defs.filter((def) => !shown.has(def.key)).map((def): ViewColumnState => ({ key: def.key, visible: false })),
  ]
  const sort = definition.sort[0]
  const tableSort: TableSort = sort ? { key: shown.has(sort.id) ? keyOf(sort.id) : sort.id, dir: sort.descending ? 'desc' : 'asc' } : null
  return { v: 1, columns, sort: tableSort, filters: storedFilters(filters) }
}

/** Colunas visíveis do DS → colunas da definição; largura que o DS não informa fica a da definição (ou 128). */
export function columnsFromConfig(config: ViewConfig, previous: ViewColumn[]): ViewColumn[] {
  const seen = new Set<string>()
  return config.columns.filter((column) => column.visible).flatMap((column) => {
    const id = columnIdOf(column.key)
    if (!id || seen.has(id)) return []
    seen.add(id)
    return [{ id, width: column.width ?? previous.find((item) => item.id === id)?.width ?? 128, pinned: Boolean(column.pinned) }]
  })
}

/** Ordenação do DS → definição: troca só a primeira chave e preserva as demais. */
export function sortFromConfig(next: TableSort, current: ViewDefinition['sort']): ViewDefinition['sort'] {
  if (!next) return current.slice(1)
  const id = columnIdOf(next.key)
  return [{ id, descending: next.dir === 'desc' }, ...current.slice(1).filter((item) => item.id !== id)]
}

const catalogType = (type: string): ColumnCatalogType | undefined => {
  const kind = filterKindOf(type)
  return kind === 'bool' || kind === null ? undefined : kind
}

/** Campos que o painel "Adicionar coluna" oferece: os mesmos do antigo gerenciador (personalizados e datas de auditoria). */
export function columnCatalogOf(catalog: CatalogField[], exclude: Set<string>, label: string): ColumnCatalog {
  const eligible = catalog.filter((field) => field.available && field.pickerEligible !== false && !exclude.has(field.id))
  const byId = new Map(catalog.filter((field) => !field.path.length).map((field) => [field.attribute, field]))
  const entry = (field: CatalogField) => ({ id: enc(field.id), label: field.label, type: catalogType(field.type) })
  return {
    label,
    maxDepth: 1,
    load: async (path) => {
      if (!path.length) {
        const relations = new Map<string, { id: string; label: string; relation: true; description: string }>()
        for (const field of eligible.filter((item) => item.path.length)) {
          const key = relationOf(field)
          const lookup = byId.get(field.relationships?.[0]?.to ?? '')?.label ?? field.relationships?.[0]?.to ?? field.table
          if (!relations.has(key)) relations.set(key, { id: enc(key), label: lookup, relation: true, description: field.tableLabel ?? field.table })
        }
        return [...eligible.filter((field) => !field.path.length).map(entry), ...[...relations.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))]
      }
      return eligible.filter((field) => field.path.length && enc(relationOf(field)) === path[0]).map(entry)
    },
  }
}

// ---------- Filtros ----------

export type FilterLabel = (id: string, value: string) => string

/** Campos filtráveis: os do catálogo que o antigo painel oferecia; fora das colunas da grade, só no filtro avançado. */
export function filterFieldsOf(catalog: CatalogField[], columnIds: string[], filterIds: string[], keyOf: KeyOf, options: Map<string, FilterOption[]>): FilterField[] {
  const columns = new Set(columnIds)
  const used = new Set(filterIds)
  return catalog.flatMap((field): FilterField[] => {
    let kind = filterKindOf(field.type)
    if (!field.available || !kind || !(field.pickerEligible !== false || columns.has(field.id) || used.has(field.id))) return []
    // Opções ainda não lidas: a escolha vira busca (lookup), que lê as opções sob demanda.
    const loaded = options.get(field.id)
    if (kind === 'choice' && !loaded) kind = 'lookup'
    return [{
      key: keyOf(field.id), label: FIXED_LABELS[field.id] ?? field.label, kind,
      ...(field.type === 'Money' ? { money: true } : {}),
      ...(kind === 'choice' ? { options: loaded } : {}),
      ...(field.path.length && !FIXED_LABELS[field.id] ? { relation: field.tableLabel ?? field.table } : {}),
      ...(columns.has(field.id) ? {} : { advancedOnly: true }),
    }]
  })
}

/** Condição da definição → condição do DS; `null` quando o DS não tem equivalente exato (fica só leitura). */
export function toTableCondition(filter: ViewFilter, field: FilterField, id: string, label: FilterLabel): FilterCondition | null {
  const base = { type: 'condition' as const, id, field: field.key }
  const op = filter.operator
  const values = filter.values ?? []
  const option = (value: string): FilterOption => ({ value, label: label(filter.id, value) })
  if (op === 'null') return field.kind === 'bool' ? null : { ...base, op: 'empty' }
  if (op === 'not-null') return field.kind === 'bool' || field.kind === 'number' ? null : { ...base, op: 'not-empty' }
  switch (field.kind) {
    case 'text': {
      const mapped = TEXT_OPS[op]
      return mapped && filter.value.trim() ? { ...base, op: mapped, value: filter.value } : null
    }
    case 'number': {
      if (op === 'between') return values.length === 2 && values.every((value) => value !== '' && Number.isFinite(Number(value))) ? { ...base, op: 'between', value: Number(values[0]), to: Number(values[1]) } : null
      return ['eq', 'ne', 'gt', 'ge', 'lt', 'le'].includes(op) && filter.value !== '' && Number.isFinite(Number(filter.value)) ? { ...base, op: op as FilterCondition['op'], value: Number(filter.value) } : null
    }
    case 'choice': case 'lookup':
      if ((op === 'in' || op === 'not-in') && values.length) return { ...base, op, values: values.map(option) }
      if ((op === 'eq' || op === 'ne') && filter.value) return { ...base, op: op === 'eq' ? 'in' : 'not-in', values: [option(filter.value)] }
      return null
    case 'bool':
      if (op !== 'eq') return null
      return ['true', '1'].includes(filter.value) ? { ...base, op: 'yes' } : ['false', '0'].includes(filter.value) ? { ...base, op: 'no' } : null
    case 'date': {
      if (isDatePreset(op)) return { ...base, op }
      if ((op === 'next-x-days' || op === 'last-x-days') && filter.value === '7') return { ...base, op: op === 'next-x-days' ? 'next-7' : 'last-7' }
      if (op === 'between') return values.length === 2 && values.every(isDay) ? { ...base, op: 'between', value: values[0], to: values[1] } : null
      // Views nativas podem trazer data com hora (`AAAA-MM-DDTHH:mm:ss`): o filtro do DS trabalha com o dia.
      const day = filter.value.slice(0, 10)
      if (!isDay(day)) return null
      if (op === 'eq') return { ...base, op: 'on', value: day }
      if (op === 'lt') return { ...base, op: 'before', value: day }
      if (op === 'gt') return { ...base, op: 'after', value: day }
      // "depois de X" do DS vale a partir do dia seguinte; "até X" é antes do dia seguinte.
      if (op === 'ge') return { ...base, op: 'after', value: shiftDay(day, -1) }
      if (op === 'le') return { ...base, op: 'before', value: shiftDay(day, 1) }
      return null
    }
  }
}

/** Condição do DS → condição da definição; `null` quando incompleta (o DS também a ignora). */
export function fromTableCondition(c: FilterCondition, field: FilterField, id: string): ViewFilter | null {
  if (conditionProblem(c, field)) return null
  const f = (operator: ViewFilter['operator'], value = '', values?: string[]): ViewFilter => ({ id, operator, value, ...(values ? { values } : {}) })
  if (c.op === 'empty') return f('null')
  if (c.op === 'not-empty') return f('not-null')
  const value = c.value === undefined ? '' : String(c.value)
  switch (field.kind) {
    case 'text': {
      const operator = (Object.entries(TEXT_OPS) as [ViewFilter['operator'], FilterCondition['op']][]).find(([, op]) => op === c.op)?.[0]
      return operator ? f(operator, value) : null
    }
    case 'number': return c.op === 'between' ? f('between', '', [value, String(c.to)]) : f(c.op as ViewFilter['operator'], value)
    case 'choice': case 'lookup': return f(c.op === 'not-in' ? 'not-in' : 'in', '', (c.values ?? []).map((option) => option.value))
    case 'bool': return f('eq', c.op === 'yes' ? 'true' : 'false')
    case 'date':
      if (isDatePreset(c.op)) return f(c.op)
      if (c.op === 'next-7') return f('next-x-days', '7')
      if (c.op === 'last-7') return f('last-x-days', '7')
      if (c.op === 'on') return f('eq', value)
      if (c.op === 'before') return f('lt', value)
      if (c.op === 'after') return f('ge', shiftDay(value, 1))
      if (c.op === 'between') return f('between', '', [value, String(c.to)])
      return null
  }
}

/**
 * Filtros sem equivalente no DS. São todos fatores E da definição: `filters` (condições soltas), `groups` (grupos ligados
 * por E) e `orGroups` (todos os grupos, quando ligados por OU e não cabem nos dois níveis do DS).
 */
export type LockedFilters = { filters: ViewFilter[]; groups: ViewFilterGroup[]; orGroups: ViewFilterGroup[] }
type Origin = { condition: FilterCondition; filter: ViewFilter; order: number }
export type TableFilterState = { filters: TableFilters; locked: LockedFilters; origins: Map<string, Origin>; lockedAt: Map<ViewFilter, number> }

export const lockedCount = (locked: LockedFilters) => locked.filters.length + [...locked.groups, ...locked.orGroups].reduce((total, group) => total + group.filters.length, 0)

/** JSON com chaves em ordem, para saber se a condição voltou igual do painel. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/**
 * Definição → filtros do DS. Condições soltas (E) de campos que são colunas da grade viram filtro por coluna (uma por coluna);
 * o resto vai para o avançado: grupos ligados por E viram subgrupos da raiz E; grupos ligados por OU viram a raiz OU.
 */
export function toTableFilters(definition: ViewDefinition, fieldFor: (id: string) => FilterField | undefined, label: FilterLabel): TableFilterState {
  const origins = new Map<string, Origin>()
  const locked: LockedFilters = { filters: [], groups: [], orGroups: [] }
  const lockedAt = new Map<ViewFilter, number>()
  let seq = 0
  const convert = (filter: ViewFilter, order: number) => {
    const field = fieldFor(filter.id)
    const condition = field ? toTableCondition(filter, field, `vf${seq++}`, label) : null
    if (!condition || !field) return null
    origins.set(condition.id, { condition, filter, order })
    return { condition, field }
  }
  const group = (id: string, logic: 'and' | 'or', filters: ViewFilter[]): FilterGroup | null => {
    const items = filters.map((filter) => convert(filter, -1)?.condition)
    return items.every(Boolean) ? { type: 'group', id: `vg:${id}`, logic, items: items as FilterCondition[] } : null
  }
  const filters = emptyFilters()
  const items: Array<FilterCondition | FilterGroup> = []
  definition.filters.forEach((filter, index) => {
    const converted = convert(filter, index)
    if (!converted) { locked.filters.push(filter); lockedAt.set(filter, index); return }
    const { condition, field } = converted
    if (!field.advancedOnly && !filters.quick[field.key]) filters.quick[field.key] = condition
    else items.push(condition)
  })
  const groups = (definition.filterGroups ?? []).filter((item) => item.filters.length)
  let logic: 'and' | 'or' = 'and'
  if (definition.groupOperator !== 'or') {
    for (const source of groups) {
      const converted = group(source.id, source.operator, source.filters)
      if (converted) items.push(converted)
      else locked.groups.push(source)
    }
  } else if (groups.length && !definition.filters.length) {
    const converted = groups.map((source) => group(source.id, source.operator, source.filters))
    if (converted.every(Boolean)) { logic = 'or'; items.push(...converted as FilterGroup[]) }
    else locked.orGroups = groups
  } else if (groups.length) {
    // E entre as condições soltas e (G1 OU G2): só cabe nos dois níveis quando cada grupo é uma condição ou um OU.
    const flat = groups.every((source) => source.operator === 'or' || source.filters.length === 1)
    const converted = flat ? group('or', 'or', groups.flatMap((source) => source.filters)) : null
    if (converted) items.push(converted)
    else locked.orGroups = groups
  }
  filters.advanced = { type: 'group', id: 'raiz', logic, items }
  return { filters, locked, origins, lockedAt }
}

type FiltersPatch = Pick<ViewDefinition, 'filters' | 'filterGroups' | 'groupOperator'>

/**
 * Filtros do DS → definição, com os filtros só leitura no lugar. Condição que voltou igual do painel reaproveita o filtro
 * original (o FetchXML não muda à toa). Erro quando a combinação nova não cabe junto com os filtros só leitura.
 */
export function fromTableFilters(next: TableFilters, state: TableFilterState, fieldByKey: (key: string) => FilterField | undefined): FiltersPatch | { error: string } {
  let created = 0
  const write = (c: FilterCondition): { filter: ViewFilter; order: number } | null => {
    const origin = state.origins.get(c.id)
    if (origin && stable(origin.condition) === stable(c)) return { filter: origin.filter, order: origin.order }
    const field = fieldByKey(c.field)
    const filter = field ? fromTableCondition(c, field, columnIdOf(field.key)) : null
    return filter ? { filter, order: 1e9 + created++ } : null
  }
  const written = (list: FilterCondition[]) => list.map(write).filter((item): item is { filter: ViewFilter; order: number } => item !== null)
  const toGroup = (group: FilterGroup): ViewFilterGroup | null => {
    const filters = written(group.items.filter((item): item is FilterCondition => item.type === 'condition')).map((item) => item.filter)
    return filters.length ? { id: group.id.startsWith('vg:') && group.id !== 'vg:or' ? group.id.slice(3) : crypto.randomUUID(), operator: group.logic, filters } : null
  }
  const ordered = (list: { filter: ViewFilter; order: number }[]) => [...list].sort((a, b) => a.order - b.order).map((item) => item.filter)
  const root = next.advanced
  const conditions = root.items.filter((item): item is FilterCondition => item.type === 'condition')
  const groups = root.items.filter((item): item is FilterGroup => item.type === 'group').map(toGroup).filter((item): item is ViewFilterGroup => item !== null)
  const quick = written(Object.values(next.quick))
  // Filtros só leitura soltos guardam a posição original na lista.
  const locked = state.locked.filters.map((filter) => ({ filter, order: state.lockedAt.get(filter) ?? 0 }))
  if (root.logic === 'and') {
    const filters = ordered([...locked, ...quick, ...written(conditions)])
    if (state.locked.orGroups.length) {
      if (groups.length) return { error: 'Estes grupos não podem ser combinados com os grupos OU só leitura desta visão. Remova os filtros só leitura antes.' }
      return { filters, filterGroups: state.locked.orGroups, groupOperator: 'or' }
    }
    const filterGroups = [...state.locked.groups, ...groups]
    return { filters, filterGroups, groupOperator: filterGroups.length ? 'and' : undefined }
  }
  if (state.locked.groups.length || state.locked.orGroups.length) return { error: 'O filtro avançado com OU não pode ser combinado com os grupos só leitura desta visão. Remova os filtros só leitura antes.' }
  const loose = written(conditions).map((item) => item.filter)
  const filterGroups = [...(loose.length ? [{ id: crypto.randomUUID(), operator: 'or' as const, filters: loose }] : []), ...groups]
  return { filters: ordered([...locked, ...quick]), filterGroups, groupOperator: filterGroups.length ? 'or' : undefined }
}
