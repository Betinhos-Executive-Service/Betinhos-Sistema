import { useCallback, useMemo, useState } from 'react'
import {
  emptyFilters, sameConfig, setGroup as withGroup, storedFilters,
  type TableDensity, type TableFilters, type TableViewEntry, type TableViewState, type ViewColumnDef, type ViewConfig, type ViewGroup, type ViewSort,
} from '@betinhos/ui'
import { applyColumnPrefs, type ColumnPrefs, type KV } from './domain/columns'
import { fromConfigKey, toConfigKey } from './domain/extraLinks'
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
  /** Filtros que a própria visão traz (lidos do FetchXML): são a base de "Alterada" e o que "Restaurar" devolve. */
  viewFilters?: TableFilters
  setFilters: (filters: TableFilters) => void
  /** Volta aos filtros da própria visão. */
  resetFilters?: () => void
  /** Agrupamento no servidor: vive na tela (e na URL), não na visão do Dataverse. */
  group: ViewGroup | null
  setGroup: (group: ViewGroup | null) => void
  selectView: (id: string) => void
  reloadViews: (selectId?: string) => Promise<void>
  /** Gravações da visão: lançam erro em falha (a `ViewBar` avisa). */
  createView: (name: string) => Promise<string>
  updateView: () => Promise<void>
  renameView: (name: string) => Promise<void>
  deleteView: () => Promise<void>
  kv: KV
  /** Colunas virtuais que o painel oferece, mas que só aparecem quando o usuário liga (ex.: Portal). */
  hiddenByDefault?: string[]
  /** "Mostrar manutenções" mudado na tela: conta como "Alterada"; "Restaurar" volta ao da visão. */
  manutencoesAlteradas: boolean
  resetManutencoes: () => void
}

const sortKey = (column: { attribute: string; alias: string | null }) => (column.alias ? `${column.alias}.${column.attribute}` : column.attribute)

/** Colunas adicionadas ainda não salvas na visão (`x__…` do FetchXML), pelas chaves guardadas em `prefs.extra`. */
const extraKeysOf = (prefs: ColumnPrefs | null) => new Set((prefs?.extra ?? []).map((e) => fromConfigKey(e.key)))
const configKey = (key: string, extras: Set<string>) => (extras.has(key) ? toConfigKey(key) : key)

function toViewSort(sort: Sort, extras: Set<string>): ViewSort {
  return sort ? { key: configKey(sortKey(sort), extras), dir: sort.descending ? 'desc' : 'asc' } : null
}
function fromViewSort(sort: ViewSort, columns: Column[]): Sort {
  if (!sort) return null
  const column = columns.find((c) => c.key === fromConfigKey(sort.key))
  if (!column) return null
  return { attribute: column.attribute, alias: column.alias, descending: sort.dir === 'desc' }
}

/** Configuração da visão como ela veio do Dataverse: colunas do layout, ordem e filtros da própria visão. */
function baselineOf(columns: Column[], hidden: Set<string>, filters: TableFilters | undefined): ViewConfig {
  return { v: 1, columns: columns.map((c) => ({ key: c.key, visible: !hidden.has(c.key) })), sort: null, filters: filters ? storedFilters(filters) : {} }
}

/**
 * Ordem e visibilidade a partir das preferências locais; largura só quando o usuário mudou. Colunas adicionadas
 * (`x__…`) aparecem com a chave `x:` e o rótulo guardado, para o painel tratá-las como adicionadas (✕ para remover).
 */
function configOf(columns: Column[], prefs: ColumnPrefs | null, sort: Sort, filters: TableFilters, group: ViewGroup | null, hidden: Set<string>): ViewConfig {
  const ordered = prefs ? applyColumnPrefs(columns, { order: prefs.order, hidden: [] }) : columns
  const extras = extraKeysOf(prefs)
  const labels = new Map((prefs?.extra ?? []).map((e) => [e.key, e.label]))
  return withGroup({
    v: 1,
    columns: ordered.map((c) => {
      const width = prefs?.widths?.[c.key]
      const key = configKey(c.key, extras)
      const label = key !== c.key ? labels.get(key) : undefined
      return { key, visible: prefs ? !prefs.hidden.includes(c.key) : !hidden.has(c.key), ...(width ? { width } : {}), ...(label ? { label } : {}) }
    }),
    sort: toViewSort(sort, extras),
    filters: storedFilters(filters),
  }, group)
}

const DENSITY_KEY = 'betinhos.densidade.geral'

/**
 * Adapta a Geral (savedquery/userquery do Dataverse + preferências de coluna no navegador) ao contrato `TableViewState`
 * do `@betinhos/ui`, para usar a `ViewBar` sem trocar o armazenamento das visões. Visões do sistema aparecem como
 * "Públicas" (só leitura; a padrão em "Padrão"); as userqueries, como "Minhas". Publicar não existe aqui.
 */
export function useGeralViewState(o: Options): { state: TableViewState; columnDefs: ViewColumnDef[] } {
  // Base da visão sem as colunas adicionadas: é o que "Restaurar colunas" devolve.
  const extraKeys = useMemo(() => extraKeysOf(o.prefs), [o.prefs])
  const hiddenKey = (o.hiddenByDefault ?? []).join(',')
  const hidden = useMemo(() => new Set(hiddenKey ? hiddenKey.split(',') : []), [hiddenKey])
  const baseline = useMemo(() => baselineOf(o.columns.filter((c) => !extraKeys.has(c.key)), hidden, o.viewFilters), [o.columns, extraKeys, hidden, o.viewFilters])
  const config = useMemo(() => configOf(o.columns, o.prefs, o.sort, o.filters, o.group, hidden), [o.columns, o.prefs, o.sort, o.filters, o.group, hidden])
  // Colunas adicionadas ficam fora das definições: o painel usa o rótulo guardado na visão e oferece ✕.
  const columnDefs = useMemo<ViewColumnDef[]>(() => o.columns.filter((c) => !extraKeys.has(c.key)).map((c) => ({ key: c.key, label: columnLabel(c, o.attributes?.get(c.key)) })), [o.columns, o.attributes, extraKeys])

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

  const { setPrefs, setSort, setFilters, setGroup, columns, prefs, sort, filters, group } = o
  const setConfig = useCallback((update: (c: ViewConfig) => ViewConfig) => {
    const current = configOf(columns, prefs, sort, filters, group, hidden)
    const next = update(current)
    if (JSON.stringify(next.columns) !== JSON.stringify(current.columns)) {
      // Colunas `x:` que o layout da visão ainda não tem vão para `extra` (a tela as liga no FetchXML).
      const layout = new Set(baseline.columns.map((c) => c.key))
      const extra = next.columns.filter((c) => c.key.startsWith('x:') && !layout.has(fromConfigKey(c.key))).map((c) => ({ key: c.key, label: c.label ?? c.key }))
      const keys = next.columns.map((c) => ({ ...c, key: fromConfigKey(c.key) }))
      const untouched = !extra.length && keys.length === baseline.columns.length && keys.every((c, i) => c.key === baseline.columns[i]?.key && c.visible === baseline.columns[i]?.visible && !c.width)
      if (untouched) setPrefs(null)
      else {
        const widths = Object.fromEntries(keys.flatMap((c) => (c.width ? [[c.key, c.width]] : [])))
        setPrefs({ order: keys.map((c) => c.key), hidden: keys.filter((c) => !c.visible).map((c) => c.key), ...(Object.keys(widths).length ? { widths } : {}), ...(extra.length ? { extra } : {}) })
      }
    }
    if (JSON.stringify(next.sort) !== JSON.stringify(current.sort)) setSort(fromViewSort(next.sort, columns))
    if (JSON.stringify(next.filters) !== JSON.stringify(current.filters)) {
      const raw = next.filters as Partial<TableFilters>
      setFilters(raw && raw.quick && raw.advanced ? (raw as TableFilters) : emptyFilters())
    }
    if (JSON.stringify(next.group ?? null) !== JSON.stringify(current.group ?? null)) setGroup(next.group ?? null)
  }, [columns, prefs, sort, filters, group, hidden, baseline, setPrefs, setSort, setFilters, setGroup])


  // A Geral nasceu densa (grade editável): Compacta é o padrão; Confortável fica lembrada no navegador.
  const { kv } = o
  const [density, setDensityState] = useState<TableDensity>(() => { try { const v = kv.getItem(DENSITY_KEY); return v === 'default' || v === 'minimal' ? v : 'dense' } catch { return 'dense' } })
  const setDensity = useCallback((next: TableDensity) => {
    setDensityState(next)
    try { kv.setItem(DENSITY_KEY, next) } catch { /* sem armazenamento: só não lembra */ }
  }, [kv])

  const { selectView, reloadViews, createView, updateView, renameView, deleteView, resetFilters, resetManutencoes } = o
  const restore = useCallback(() => {
    const padrao = views.find((e) => e.scope === 'padrao') ?? views[0]
    if (!padrao?.id) return
    if (padrao.id !== active.id) { selectView(padrao.id); return }
    // Já na padrão: tira as mudanças da tela (colunas, ordem, filtros e agrupamento).
    setPrefs(null)
    setSort(null)
    if (resetFilters) resetFilters()
    else setFilters(emptyFilters())
    setGroup(null)
    resetManutencoes()
  }, [views, active.id, selectView, setPrefs, setSort, setFilters, resetFilters, setGroup, resetManutencoes])

  const state: TableViewState = {
    status: o.viewsError ? 'error' : o.views.length ? 'ready' : 'loading',
    error: o.viewsError,
    views,
    active,
    config,
    // O agrupamento é da tela (não é gravado na visão): fica fora de "Alterada", senão Salvar pareceria não ter efeito.
    dirty: !sameConfig(withGroup(config, null), baseline) || o.manutencoesAlteradas,
    canPublish: false,
    setConfig,
    density,
    setDensity,
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

