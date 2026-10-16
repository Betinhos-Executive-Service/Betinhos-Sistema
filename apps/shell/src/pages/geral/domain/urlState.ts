import type { TableFilters } from '@betinhos/ui'
import { decodeTableFilters, encodeTableFilters, hasActiveFilters } from './tableFilters'
import type { Sort } from './types'

/** Estado da tela que viaja na URL (`#/geral?view=…&q=…&sort=…&f=…`). */
export type UrlState = { view?: string; q?: string; sort?: Sort; filters?: TableFilters }

/** `attr:asc|desc`, com `alias.attr` quando a coluna vem de uma tabela ligada. */
function parseSort(text: string | null): Sort | undefined {
  if (!text) return undefined
  const cut = text.lastIndexOf(':')
  if (cut <= 0) return undefined
  const direction = text.slice(cut + 1)
  if (direction !== 'asc' && direction !== 'desc') return undefined
  const column = text.slice(0, cut)
  const dot = column.indexOf('.')
  const alias = dot < 0 ? null : column.slice(0, dot)
  const attribute = dot < 0 ? column : column.slice(dot + 1)
  if (!attribute || alias === '') return undefined
  return { attribute, alias, descending: direction === 'desc' }
}

const sortText = (sort: NonNullable<Sort>) => `${sort.alias ? `${sort.alias}.` : ''}${sort.attribute}:${sort.descending ? 'desc' : 'asc'}`

/** Lê o estado da query; valores ausentes, vazios ou inválidos ficam de fora (`f` inválido não gera filtros). */
export function readUrlState(params: URLSearchParams): UrlState {
  const state: UrlState = {}
  const view = params.get('view')
  if (view) state.view = view
  const q = params.get('q')
  if (q) state.q = q
  const sort = parseSort(params.get('sort'))
  if (sort) state.sort = sort
  const f = params.get('f')
  if (f) {
    // Lê o formato novo e o antigo (links compartilhados antes dos filtros do Design System).
    const filters = decodeTableFilters(f)
    if (hasActiveFilters(filters)) state.filters = filters
  }
  return state
}

/** Query string (sem `?`) do estado; valores vazios e filtros incompletos não entram. */
export function writeUrlState(state: UrlState): string {
  const params = new URLSearchParams()
  if (state.view) params.set('view', state.view)
  if (state.q) params.set('q', state.q)
  if (state.sort) params.set('sort', sortText(state.sort))
  const f = state.filters ? encodeTableFilters(state.filters) : ''
  if (f) params.set('f', f)
  return params.toString()
}
