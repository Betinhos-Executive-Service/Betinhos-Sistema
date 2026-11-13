import type { FilterCondition, FilterField, FilterKind, FilterOption } from '@betinhos/ui'
import { isDay } from './date-ranges'
import { filterKindOf, fromTableCondition, toTableCondition } from './table-view'
import type { ViewFilter } from './views'

/**
 * Filtro do menu da coluna (uma condição por coluna, DS §10.9.2) ↔ filtros da view. Usa os mesmos conversores da
 * `ViewBar` (`table-view.ts`): a condição grava igual venha de onde vier.
 */

/** Tipos que o filtro da coluna sabe gravar como FetchXML; nos outros (Customer, Owner, Uniqueidentifier…) o menu não oferece filtro. */
export const isFilterable = (type: string) => filterKindOf(type) !== null

/** No menu da coluna a escolha vira busca (lookup): as opções são lidas sob demanda. */
export function filterKind(type: string): FilterKind {
  const kind = filterKindOf(type)
  return kind === 'choice' ? 'lookup' : kind ?? 'text'
}

export const toFilterField = (id: string, label: string, type: string): FilterField =>
  ({ key: id, label, kind: filterKind(type), money: type === 'Money' })

/** Condição do DS → filtros da view para a coluna `id`. */
export function toViewFilters(id: string, kind: FilterKind, c: FilterCondition): ViewFilter[] {
  const filter = fromTableCondition(c, { key: id, label: id, kind }, id)
  return filter ? [filter] : []
}

/**
 * Filtros da view na coluna → condição do DS, para o painel abrir com o que vale hoje. Lê também o formato antigo do menu
 * ("entre" como `ge` + `le`, "não é nenhum de" como um `ne` por valor). `undefined` quando a combinação não cabe numa
 * condição só (o painel abre vazio e Aplicar troca o que havia na coluna).
 */
export function toCondition(field: FilterField, filters: ViewFilter[], label: (value: string) => string = (value) => value): FilterCondition | undefined {
  const id = field.key
  const condition = (op: FilterCondition['op'], extra: Partial<FilterCondition>): FilterCondition => ({ type: 'condition', id: `rapido-${id}`, field: id, op, ...extra })
  if (filters.length === 2 && (field.kind === 'number' || field.kind === 'date')) {
    const ge = filters.find((item) => item.operator === 'ge')
    const le = filters.find((item) => item.operator === 'le')
    if (!ge || !le) return undefined
    return field.kind === 'number'
      ? condition('between', { value: Number(ge.value), to: Number(le.value) })
      : isDay(ge.value) && isDay(le.value) ? condition('between', { value: ge.value, to: le.value }) : undefined
  }
  if (field.kind === 'lookup' && filters.length > 1 && filters.every((item) => item.operator === 'ne')) {
    return condition('not-in', { values: filters.map((item): FilterOption => ({ value: item.value, label: label(item.value) })) })
  }
  return filters.length === 1 ? toTableCondition(filters[0], field, `rapido-${id}`, (_id, value) => label(value)) ?? undefined : undefined
}
