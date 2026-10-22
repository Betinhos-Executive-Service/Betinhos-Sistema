import { useCallback, useMemo } from 'react'
import {
  emptyFilters, sameConfig, storedFilters,
  type TableFilters, type TableViewEntry, type TableViewState, type ViewColumnDef, type ViewConfig, type ViewSort,
} from '@betinhos/ui'
import { applyColumnPrefs, type ColumnPrefs, type KV } from './domain/columns'
import { columnLabel } from './domain/layout'
import type { AttributeMap, Column, Sort, View } from './domain/types'

/** O que a Geral entrega para virar o estado de visão da `ViewBar` do Design System (§10.9.1). */
type Options = {
  views: View[]
  view: View | null
  viewsError: string | null
  /** Todas as colunas do layout da visão (antes das preferências). */
  columns: Column[]
  attributes: AttributeMap | null
  prefs: ColumnPrefs | null
  setPrefs: (prefs: ColumnPrefs | null) => void
  sort: Sort
  setSort: (sort: Sort) => void
  filters: TableFilters
  setFilters: (filters: TableFilters) => void
  selectView: (id: string) => void
  reloadViews: (selectId?: string) => Promise<void>
  /** Gravações da visão: lançam erro em falha (a `ViewBar` avisa). */
  createView: (name: string) => Promise<string>
  updateView: () => Promise<void>
  renameView: (name: string) => Promise<void>
  deleteView: () => Promise<void>
  kv: KV
}

const sortKey = (column: { attribute: string; alias: string | null }) => (column.alias ? `${column.alias}.${column.attribute}` : column.attribute)

function toViewSort(sort: Sort): ViewSort {
  return sort ? { key: sortKey(sort), dir: sort.descending ? 'desc' : 'asc' } : null
}
function fromViewSort(sort: ViewSort, columns: Column[]): Sort {
  if (!sort) return null
  const column = columns.find((c) => c.key === sort.key)
  if (!column) return null
  return { attribute: column.attribute, alias: column.alias, descending: sort.dir === 'desc' }
}

/** Configuração da visão como ela veio do Dataverse: colunas do layout, ordem da própria visão, sem filtros avulsos. */
function baselineOf(columns: Column[]): ViewConfig {
  return { v: 1, columns: columns.map((c) => ({ key: c.key, visible: true })), sort: null, filters: {} }
}

/** Ordem e visibilidade a partir das preferências locais; largura só quando o usuário mudou. */
function configOf(columns: Column[], prefs: ColumnPrefs | null, sort: Sort, filters: TableFilters): ViewConfig {
  const ordered = prefs ? applyColumnPrefs(columns, { order: prefs.order, hidden: [] }) : columns
  return {
    v: 1,
    columns: ordered.map((c) => {
      const width = prefs?.widths?.[c.key]
      return width ? { key: c.key, visible: !prefs?.hidden.includes(c.key), width } : { key: c.key, visible: !prefs?.hidden.includes(c.key) }
    }),
    sort: toViewSort(sort),
    filters: storedFilters(filters),
  }
}

/**
 * Adapta a Geral (savedquery/userquery do Dataverse + preferências de coluna no navegador) ao contrato `TableViewState`
 * do `@betinhos/ui`, para usar a `ViewBar` sem trocar o armazenamento das visões. Visões do sistema aparecem como
 * "Públicas" (só leitura; a padrão em "Padrão"); as userqueries, como "Minhas". Publicar não existe aqui.
 */
export function useGeralViewState(o: Options): { state: TableViewState; columnDefs: ViewColumnDef[] } {
  const baseline = useMemo(() => baselineOf(o.columns), [o.columns])
  const config = useMemo(() => configOf(o.columns, o.prefs, o.sort, o.filters), [o.columns, o.prefs, o.sort, o.filters])
  const columnDefs = useMemo<ViewColumnDef[]>(() => o.columns.map((c) => ({ key: c.key, label: columnLabel(c, o.attributes?.get(c.key)) })), [o.columns, o.attributes])

  // A padrão vem primeiro: a `ViewBar` usa a configuração da primeira entrada como "Restaurar colunas" (aqui, a da visão aberta).
  const views = useMemo<TableViewEntry[]>(() => {
    const entries = o.views.map((v): TableViewEntry => ({
      id: v.id, name: v.nome, scope: v.padrao ? 'padrao' : v.grupo === 'minhas' ? 'pessoal' : 'publica', canEdit: v.grupo === 'minhas', config: baseline,
    }))
    // Enquanto as visões não chegam (ou se falharam), a barra mostra uma entrada provisória: ela sempre lê a primeira.
    if (!entries.length) return [{ id: '', name: o.viewsError ? 'Visões indisponíveis' : 'Carregando visões…', scope: 'padrao', canEdit: false, config: baseline }]
    return [...entries.filter((e) => e.scope === 'padrao'), ...entries.filter((e) => e.scope !== 'padrao')]
  }, [o.views, o.viewsError, baseline])
  const active = views.find((e) => e.id === o.view?.id) ?? views[0]

  const { setPrefs, setSort, setFilters, columns, prefs, sort, filters } = o
  const setConfig = useCallback((update: (c: ViewConfig) => ViewConfig) => {
    const current = configOf(columns, prefs, sort, filters)
    const next = update(current)
    if (JSON.stringify(next.columns) !== JSON.stringify(current.columns)) {
      const untouched = next.columns.every((c, i) => c.key === baseline.columns[i]?.key && c.visible && !c.width)
      if (untouched) setPrefs(null)
      else {
        const widths = Object.fromEntries(next.columns.flatMap((c) => (c.width ? [[c.key, c.width]] : [])))
        setPrefs({ order: next.columns.map((c) => c.key), hidden: next.columns.filter((c) => !c.visible).map((c) => c.key), ...(Object.keys(widths).length ? { widths } : {}) })
      }
    }
    if (JSON.stringify(next.sort) !== JSON.stringify(current.sort)) setSort(fromViewSort(next.sort, columns))
    if (JSON.stringify(next.filters) !== JSON.stringify(current.filters)) {
      const raw = next.filters as Partial<TableFilters>
      setFilters(raw && raw.quick && raw.advanced ? (raw as TableFilters) : emptyFilters())
    }
  }, [columns, prefs, sort, filters, baseline, setPrefs, setSort, setFilters])


  const { selectView, reloadViews, createView, updateView, renameView, deleteView } = o
  const restore = useCallback(() => {
    const padrao = views.find((e) => e.scope === 'padrao') ?? views[0]
    if (!padrao?.id) return
    if (padrao.id !== active.id) { selectView(padrao.id); return }
    // Já na padrão: tira as mudanças da tela (colunas, ordem e filtros).
    setPrefs(null)
    setSort(null)
    setFilters(emptyFilters())
  }, [views, active.id, selectView, setPrefs, setSort, setFilters])

  const state: TableViewState = {
    status: o.viewsError ? 'error' : o.views.length ? 'ready' : 'loading',
    error: o.viewsError,
    views,
    active,
    config,
    dirty: !sameConfig(config, baseline),
    canPublish: false,
    setConfig,
    select: selectView,
    restore,
    save: updateView,
    saveAs: async (name) => { const id = await createView(name); await reloadViews(id) },
    rename: renameView,
    remove: deleteView,
    publish: async () => { throw new Error('As visões da Geral não são publicadas por aqui.') },
    reload: () => reloadViews(),
  }
  return { state, columnDefs }
}

