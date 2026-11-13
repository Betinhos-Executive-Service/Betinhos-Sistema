import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readFilters, type ColumnCatalog, type FilterField, type FilterOption, type LookupSearch, type TableDensity, type TableViewEntry, type TableViewState, type ViewColumnDef, type ViewConfig } from '@betinhos/ui'
import { moneyFields } from './data/compositions'
import { resolveFilterOption, searchFilterOptions } from './data/filter-options'
import {
  columnCatalogOf, columnDefsOf, columnIdOf, columnsFromConfig, configOf, extraColumnKey, filterFieldsOf, filterKindOf, fromTableFilters, lockedCount, sortFromConfig, toTableFilters,
  type FilterLabel, type LockedFilters,
} from './data/table-view'
import { allViewFilters, defaultViewDefinition, type CatalogField, type SavedView, type ViewDefinition } from './data/views'

type Kind = SavedView['kind']

/** O que a página entrega para virar o estado de visão da `ViewBar` do Design System (§10.9.1). */
type Options = {
  catalog: CatalogField[]
  /** Metadata pronta (no modo local, sempre): antes disso colunas e filtros não mudam. */
  ready: boolean
  mock: boolean
  views: SavedView[]
  active: SavedView | null
  definition: ViewDefinition
  viewError: string | null
  /** Comando, edição ou carga em andamento: a visão não muda (o seletor antigo ficava desabilitado). */
  locked: boolean
  onChange: (definition: ViewDefinition) => void
  selectView: (id: string) => void
  saveView: (name: string, kind: Kind, overwrite: boolean, definition: ViewDefinition) => Promise<void>
  deleteView: () => Promise<void>
  publishView: () => Promise<void>
  reloadViews: () => Promise<void>
  onError: (message: string) => void
}

export type ComposicaoViewState = {
  state: TableViewState
  columnDefs: ViewColumnDef[]
  catalog: ColumnCatalog
  filterFields: FilterField[]
  search: LookupSearch
  /** Filtros da definição sem equivalente no DS: ficam na consulta e aparecem só para leitura. */
  lockedFilters: LockedFilters
  clearLockedFilters: () => void
  /** Nome de um valor de lookup ou escolha (GUID → nome), quando já lido. */
  valueLabel: FilterLabel
}

const DENSITY_KEY = 'betinhos.densidade.composicao'
const DEFAULT_NAME = 'Todas as composições'
const DEFAULT_DEFINITION = defaultViewDefinition(moneyFields.map((field) => field.key))
/** O que decide "Alterada": a mesma comparação do antigo gerenciador de views. */
const comparable = (definition: ViewDefinition) => JSON.stringify({
  columns: definition.columns,
  filters: definition.filters,
  sort: definition.sort,
  filterGroups: definition.filterGroups?.length ? definition.filterGroups : undefined,
  groupOperator: definition.filterGroups?.length ? definition.groupOperator : undefined,
})
const labelKey = (id: string, value: string) => `${id}|${value}`

/**
 * Adapta as views da Composição (userquery/savedquery + `new_configuracaovisualizacaocomposicao`) ao contrato
 * `TableViewState` do `@betinhos/ui`, sem trocar onde elas ficam: `ViewDefinition` continua sendo a fonte do FetchXML e do
 * layoutXml. Pessoais aparecem em "Minhas"; públicas, em "Públicas"; "Todas as composições" é a padrão.
 */
export function useComposicaoViewState(o: Options): ComposicaoViewState {
  const { catalog, definition, active, onChange, onError, mock, ready } = o
  const byId = useMemo(() => new Map(catalog.map((field) => [field.id, field])), [catalog])
  const baseline = active?.definition ?? DEFAULT_DEFINITION
  const columnDefs = useMemo(() => columnDefsOf(baseline.columns, DEFAULT_DEFINITION.columns, byId), [baseline, byId])
  const defIds = useMemo(() => new Set(columnDefs.map((def) => def.key)), [columnDefs])
  const keyOf = useCallback((id: string) => defIds.has(id) ? id : extraColumnKey(id, byId), [defIds, byId])
  const columnCatalog = useMemo(() => columnCatalogOf(catalog, defIds, 'Composição de Preços'), [catalog, defIds])

  // Rótulos de lookup e opções de escolha lidos do Dataverse (os chips mostram nomes, não GUIDs).
  const [labels, setLabels] = useState<Map<string, string>>(() => new Map())
  const [options, setOptions] = useState<Map<string, FilterOption[]>>(() => new Map())
  const requested = useRef(new Set<string>())
  // Opções vistas na busca do painel: viram rótulo quando entram num filtro, sem renderizar a barra a cada busca.
  const seen = useRef(new Map<string, string>())
  const remember = useCallback((found: { id: string; option: FilterOption }[]) => setLabels((current) => {
    const fresh = found.filter(({ id, option }) => current.get(labelKey(id, option.value)) !== option.label)
    if (!fresh.length) return current
    const next = new Map(current)
    fresh.forEach(({ id, option }) => next.set(labelKey(id, option.value), option.label))
    return next
  }), [])
  const label = useCallback((id: string, value: string) => labels.get(labelKey(id, value)) ?? seen.current.get(labelKey(id, value)) ?? options.get(id)?.find((option) => option.value === value)?.label ?? value, [labels, options])

  // Só os ids das colunas e dos filtros decidem os campos: largura, fixação e ordenação não refazem a lista.
  const columnIds = useMemo(() => definition.columns.map((column) => column.id).join('\n'), [definition])
  const filterIds = useMemo(() => allViewFilters(definition).map((filter) => filter.id).join('\n'), [definition])
  const fields = useMemo(() => filterFieldsOf(catalog, columnIds.split('\n'), filterIds.split('\n'), keyOf, options), [catalog, columnIds, filterIds, keyOf, options])
  const fieldById = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields])
  const fieldFor = useCallback((id: string) => fieldById.get(keyOf(id)), [fieldById, keyOf])
  const tableFilters = useMemo(() => toTableFilters(definition, fieldFor, label), [definition, fieldFor, label])

  useEffect(() => {
    if (mock || !ready) return
    const pending = (key: string) => !requested.current.has(key) && Boolean(requested.current.add(key))
    const choices = [...new Set([...definition.columns.map((column) => column.id), ...allViewFilters(definition).map((filter) => filter.id)])].flatMap((id) => {
      const field = byId.get(id)
      return field && filterKindOf(field.type) === 'choice' && pending(`opcoes:${id}`) ? [field] : []
    })
    if (choices.length) {
      void Promise.all(choices.map((field) => searchFilterOptions(field, '').then((found) => [field.id, found] as const, () => null)))
        .then((loaded) => {
          const found = loaded.filter((item) => item !== null)
          if (found.length) setOptions((current) => new Map([...current, ...found]))
        })
    }
    const lookups = allViewFilters(definition).flatMap((filter) => {
      const field = byId.get(filter.id)
      if (field?.type !== 'Lookup') return []
      return (filter.values?.length ? filter.values : [filter.value]).filter((value) => value && !seen.current.has(labelKey(filter.id, value)) && pending(labelKey(filter.id, value))).map((value) => ({ field, value }))
    })
    if (lookups.length) {
      void Promise.all(lookups.map(({ field, value }) => resolveFilterOption(field, value).then((option) => option ? [{ id: field.id, option }] : [], () => [])))
        .then((found) => remember(found.flat()))
    }
  }, [byId, definition, mock, ready, remember])

  const search = useCallback<LookupSearch>(async (field, text) => {
    const source = byId.get(columnIdOf(field.key))
    if (!source || mock) return []
    const found = await searchFilterOptions(source, text)
    found.forEach((option) => seen.current.set(labelKey(source.id, option.value), option.label))
    return found
  }, [byId, mock])

  const config = useMemo(() => configOf(definition, columnDefs, byId, keyOf, tableFilters.filters), [definition, columnDefs, byId, keyOf, tableFilters])
  const baseConfig = useMemo<ViewConfig>(() => configOf(baseline, columnDefs, byId, keyOf, toTableFilters(baseline, fieldFor, label).filters), [baseline, columnDefs, byId, keyOf, fieldFor, label])

  const views = useMemo<TableViewEntry[]>(() => {
    const entry = (scope: TableViewEntry['scope']) => (view: SavedView): TableViewEntry => ({
      id: view.id, name: view.name, scope, canEdit: view.managed && (!view.nativeOnly || Boolean(view.nativeFiltersEditable)), config: baseConfig,
    })
    return [
      { id: '', name: DEFAULT_NAME, scope: 'padrao', canEdit: false, config: baseConfig },
      ...o.views.filter((view) => view.kind === 'public').map(entry('publica')),
      ...o.views.filter((view) => view.kind === 'personal').map(entry('pessoal')),
    ]
  }, [o.views, baseConfig])
  const activeEntry = views.find((entry) => entry.id === (active?.id ?? '')) ?? views[0]
  const baselineKey = useMemo(() => comparable(baseline), [baseline])
  const dirty = useMemo(() => comparable(definition) !== baselineKey, [definition, baselineKey])

  const setConfig = useCallback((update: (config: ViewConfig) => ViewConfig) => {
    if (o.locked || !ready) { onError(ready ? 'Aguarde o comando em andamento para mudar a visão.' : 'Aguarde o carregamento dos campos para mudar a visão.'); return }
    const next = update(config)
    let result = definition
    if (JSON.stringify(next.columns) !== JSON.stringify(config.columns)) {
      const columns = columnsFromConfig(next, definition.columns)
      if (!columns.length) return
      const removed = new Set(definition.columns.map((column) => column.id).filter((id) => !columns.some((column) => column.id === id)))
      result = { ...result, columns, sort: result.sort.filter((item) => !removed.has(item.id)) }
    }
    if (JSON.stringify(next.sort) !== JSON.stringify(config.sort)) result = { ...result, sort: sortFromConfig(next.sort, result.sort) }
    if (JSON.stringify(next.filters) !== JSON.stringify(config.filters)) {
      const patch = fromTableFilters(readFilters(next.filters, fields), tableFilters, (key) => fieldById.get(key))
      if ('error' in patch) { onError(patch.error); return }
      result = { ...result, ...patch }
    }
    if (result !== definition) onChange(result)
  }, [config, definition, fieldById, fields, o.locked, ready, onChange, onError, tableFilters])

  const [density, setDensityState] = useState<TableDensity>(() => { try { const value = window.localStorage.getItem(DENSITY_KEY); return value === 'default' || value === 'minimal' ? value : 'dense' } catch { return 'dense' } })
  const setDensity = useCallback((next: TableDensity) => {
    setDensityState(next)
    try { window.localStorage.setItem(DENSITY_KEY, next) } catch { /* sem armazenamento: só não lembra */ }
  }, [])

  const { selectView, saveView, deleteView, publishView, reloadViews } = o
  const restore = useCallback(() => {
    if (active) selectView('')
    else onChange(DEFAULT_DEFINITION)
  }, [active, onChange, selectView])
  const clearLockedFilters = useCallback(() => {
    if (!lockedCount(tableFilters.locked)) return
    const patch = fromTableFilters(tableFilters.filters, { ...tableFilters, locked: { filters: [], groups: [], orGroups: [] } }, (key) => fieldById.get(key))
    if (!('error' in patch)) onChange({ ...definition, ...patch })
  }, [definition, fieldById, onChange, tableFilters])

  const save = useCallback(async () => { if (!active) throw new Error('Escolha uma visão salva.'); await saveView(active.name, active.kind, true, definition) }, [active, definition, saveView])
  const saveAs = useCallback((name: string) => saveView(name, 'personal', false, definition), [definition, saveView])
  const rename = useCallback(async (name: string) => {
    if (!active) throw new Error('Escolha uma visão salva.')
    await saveView(name, active.kind, true, active.definition)
    // Renomear não grava nem descarta as mudanças que estão na tela.
    if (dirty) onChange(definition)
  }, [active, definition, dirty, onChange, saveView])
  const status = o.viewError ? 'error' : ready ? 'ready' : 'loading'
  // Objeto estável: a linha de comando só renderiza (e remede) quando a visão muda, não a cada tecla na grade.
  const state = useMemo<TableViewState>(() => ({
    status, error: o.viewError, views, active: activeEntry, config, dirty,
    // Hoje qualquer usuário cria view pública pela tela; o Dataverse recusa quem não tem privilégio (a barra avisa o erro).
    canPublish: true,
    setConfig, density, setDensity, select: selectView, restore, save, saveAs, rename, remove: deleteView, publish: publishView, reload: reloadViews,
  }), [status, o.viewError, views, activeEntry, config, dirty, setConfig, density, setDensity, selectView, restore, save, saveAs, rename, deleteView, publishView, reloadViews])
  return useMemo(() => ({ state, columnDefs, catalog: columnCatalog, filterFields: fields, search, lockedFilters: tableFilters.locked, clearLockedFilters, valueLabel: label }), [state, columnDefs, columnCatalog, fields, search, tableFilters.locked, clearLockedFilters, label])
}
