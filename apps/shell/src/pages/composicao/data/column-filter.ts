import { todaySaoPaulo, type FilterCondition, type FilterField, type FilterKind, type FilterOption } from '@betinhos/ui'
import type { ViewFilter } from './views'

/**
 * Ponte entre o filtro da coluna do Design System (uma condição por coluna, §10.9.2) e os filtros da view da tela
 * (`ViewFilter`, que vira FetchXML). Condições que o DS expressa e a view não (não é nenhum de, entre, atalhos de data)
 * viram mais de um `ViewFilter` na mesma coluna, combinados com E.
 */

// Customer/Owner ficam de fora: a busca de opções (filter-options) só entende Lookup e opções de Picklist/State/Status.
const SELECTION = ['Lookup', 'Picklist', 'State', 'Status']
const NUMERIC = ['Money', 'Decimal', 'Double', 'Integer', 'BigInt']
const TEXT = ['String', 'Memo']

/** Tipos que o filtro da coluna sabe gravar como FetchXML; nos outros (Customer, Owner, Uniqueidentifier…) o menu não oferece filtro. */
export const isFilterable = (type: string) => [...SELECTION, ...NUMERIC, ...TEXT, 'DateTime', 'Boolean'].includes(type)

export function filterKind(type: string): FilterKind {
  if (SELECTION.includes(type)) return 'lookup'
  if (NUMERIC.includes(type)) return 'number'
  if (type === 'DateTime') return 'date'
  if (type === 'Boolean') return 'bool'
  return 'text'
}

export const toFilterField = (id: string, label: string, type: string): FilterField =>
  ({ key: id, label, kind: filterKind(type), money: type === 'Money' })

const pad = (value: number) => String(value).padStart(2, '0')
const day = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parse = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d) }
const shift = (value: string, days: number) => { const date = parse(value); date.setDate(date.getDate() + days); return day(date) }

/** Atalhos de data com a mesma regra do filtro do DS (semana de domingo a sábado), fixados em dias: a view salva guarda as datas, não o atalho. */
function presetRange(op: string, today: string): [string, string] | undefined {
  const sunday = shift(today, -parse(today).getDay())
  const first = `${today.slice(0, 7)}-01`
  const lastOfMonth = day(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0))
  const previousFirst = `${shift(first, -1).slice(0, 7)}-01`
  switch (op) {
    case 'today': return [today, today]
    case 'tomorrow': return [shift(today, 1), shift(today, 1)]
    case 'yesterday': return [shift(today, -1), shift(today, -1)]
    case 'this-week': return [sunday, shift(sunday, 6)]
    case 'next-7': return [today, shift(today, 7)]
    case 'last-7': return [shift(today, -7), today]
    case 'this-month': return [first, lastOfMonth]
    case 'last-month': return [previousFirst, shift(first, -1)]
    default: return undefined
  }
}

const TEXT_OPS: Record<string, ViewFilter['operator']> = { contains: 'like', 'not-contains': 'not-like', eq: 'eq', ne: 'ne', begins: 'begins-with', ends: 'ends-with' }

/** Condição do DS → filtros da view para a coluna `id`. */
export function toViewFilters(id: string, kind: FilterKind, c: FilterCondition, today = todaySaoPaulo()): ViewFilter[] {
  const f = (operator: ViewFilter['operator'], value = ''): ViewFilter => ({ id, operator, value })
  if (c.op === 'empty') return [f('null')]
  if (c.op === 'not-empty') return [f('not-null')]
  const value = c.value === undefined ? '' : String(c.value)
  const to = c.to === undefined ? '' : String(c.to)
  switch (kind) {
    case 'text': return [f(TEXT_OPS[c.op], value)]
    case 'bool': return [f('eq', c.op === 'yes' ? 'true' : 'false')]
    case 'number':
      return c.op === 'between' ? [f('ge', value), f('le', to)] : [f(c.op as ViewFilter['operator'], value)]
    case 'choice': case 'lookup': {
      const values = (c.values ?? []).map((option) => option.value)
      return c.op === 'not-in' ? values.map((item) => f('ne', item)) : [{ id, operator: 'in', value: '', values }]
    }
    case 'date': {
      const range = presetRange(c.op, today)
      if (range) return range[0] === range[1] ? [f('eq', range[0])] : [f('ge', range[0]), f('le', range[1])]
      if (c.op === 'on') return [f('eq', value)]
      if (c.op === 'before') return [f('lt', value)]
      if (c.op === 'after') return [f('ge', shift(value, 1))]
      return [f('ge', value), f('le', to)]
    }
  }
}

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const condition = (id: string, op: FilterCondition['op'], extra: Partial<FilterCondition> = {}): FilterCondition =>
  ({ type: 'condition', id: `rapido-${id}`, field: id, op, ...extra })

/**
 * Filtros da view na coluna → condição do DS, para o painel abrir com o que vale hoje. `undefined` quando a combinação
 * não cabe numa condição só (o painel abre vazio e Aplicar troca o que havia na coluna).
 */
export function toCondition(field: FilterField, filters: ViewFilter[], label: (value: string) => string = (value) => value): FilterCondition | undefined {
  const id = field.key
  const option = (value: string): FilterOption => ({ value, label: label(value) })
  if (filters.length === 2 && (field.kind === 'number' || field.kind === 'date')) {
    const ge = filters.find((item) => item.operator === 'ge')
    const le = filters.find((item) => item.operator === 'le')
    if (!ge || !le) return undefined
    return field.kind === 'number'
      ? condition(id, 'between', { value: Number(ge.value), to: Number(le.value) })
      : isDay(ge.value) && isDay(le.value) ? condition(id, 'between', { value: ge.value, to: le.value }) : undefined
  }
  if (field.kind === 'lookup' && filters.length > 1 && filters.every((item) => item.operator === 'ne')) {
    return condition(id, 'not-in', { values: filters.map((item) => option(item.value)) })
  }
  if (filters.length !== 1) return undefined
  const [filter] = filters
  if (filter.operator === 'null') return field.kind === 'bool' ? undefined : condition(id, 'empty')
  if (filter.operator === 'not-null') return field.kind === 'bool' || field.kind === 'number' ? undefined : condition(id, 'not-empty')
  switch (field.kind) {
    case 'text': {
      const op = Object.entries(TEXT_OPS).find(([, operator]) => operator === filter.operator)?.[0] as FilterCondition['op'] | undefined
      return op ? condition(id, op, { value: filter.value }) : undefined
    }
    case 'bool':
      return filter.operator === 'eq' ? condition(id, ['true', '1'].includes(filter.value) ? 'yes' : 'no') : undefined
    case 'number':
      return ['eq', 'ne', 'gt', 'ge', 'lt', 'le'].includes(filter.operator) && Number.isFinite(Number(filter.value))
        ? condition(id, filter.operator as FilterCondition['op'], { value: Number(filter.value) }) : undefined
    case 'choice': case 'lookup':
      if (filter.operator === 'in') return condition(id, 'in', { values: (filter.values ?? []).map(option) })
      if (filter.operator === 'eq') return condition(id, 'in', { values: [option(filter.value)] })
      if (filter.operator === 'ne') return condition(id, 'not-in', { values: [option(filter.value)] })
      return undefined
    case 'date': {
      const value = filter.value.slice(0, 10)
      if (!isDay(value)) return undefined
      if (filter.operator === 'eq') return condition(id, 'on', { value })
      if (filter.operator === 'lt') return condition(id, 'before', { value })
      if (filter.operator === 'le') return condition(id, 'before', { value: shift(value, 1) })
      if (filter.operator === 'ge') return condition(id, 'after', { value: shift(value, -1) })
      if (filter.operator === 'gt') return condition(id, 'after', { value })
      return undefined
    }
  }
}
