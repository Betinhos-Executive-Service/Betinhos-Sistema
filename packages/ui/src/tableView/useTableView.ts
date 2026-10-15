import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultConfig, sameConfig, serializeConfig, type ViewColumnDef, type ViewConfig, type ViewFilters, type ViewSort } from './config'
import { buildEntries, DEFAULT_VIEW_ID, pickInitial, type TableViewEntry, type ViewStore } from './store'

type KV = Pick<Storage, 'getItem' | 'setItem'>

export type UseTableViewOptions = {
  /** Id estável da lista (`pessoas`, `frota.veiculos`…): separa visões e a última usada. */
  tela: string
  columns: ViewColumnDef[]
  store: ViewStore
  defaultSort?: ViewSort
  defaultFilters?: ViewFilters
  /** Onde lembrar a última visão; padrão `localStorage` (falha silenciosa). */
  storage?: KV | null
}

export type TableViewState = {
  status: 'loading' | 'ready' | 'error'
  error: unknown
  views: TableViewEntry[]
  active: TableViewEntry
  /** O que está na tela: parte da visão ativa e muda com colunas, ordenação e filtros. */
  config: ViewConfig
  /** A tela difere da visão ativa (rótulo "Alterada"). */
  dirty: boolean
  canPublish: boolean
  setConfig: (update: (config: ViewConfig) => ViewConfig) => void
  select: (id: string) => void
  /** Volta à visão padrão, descartando o que estiver na tela. */
  restore: () => void
  /** Ações que gravam: rejeitam com o erro do store; quem chama avisa o usuário. */
  save: () => Promise<void>
  saveAs: (name: string) => Promise<void>
  rename: (name: string) => Promise<void>
  remove: () => Promise<void>
  publish: () => Promise<void>
  reload: () => Promise<void>
}

const storageKey = (tela: string) => `betinhos.visao.${tela}`

function defaultStorage(): KV | null {
  try { return window.localStorage } catch { return null }
}
function readLast(kv: KV | null, tela: string) {
  try { return kv?.getItem(storageKey(tela)) ?? null } catch { return null }
}
function writeLast(kv: KV | null, tela: string, id: string) {
  try { kv?.setItem(storageKey(tela), id) } catch { /* sem armazenamento: só não lembra */ }
}

/** Visões salvas e estado das colunas de uma lista (Design System §10.9.1). */
export function useTableView({ tela, columns, store, defaultSort = null, defaultFilters, storage }: UseTableViewOptions): TableViewState {
  const kv = storage === undefined ? defaultStorage() : storage
  // A tela declara as colunas a cada render; a identidade estável vem das chaves.
  const signature = columns.map((c) => `${c.key}:${c.defaultHidden ? 0 : 1}`).join('|')
  const defs = useMemo(() => columns, [signature])
  const filtersKey = JSON.stringify(defaultFilters ?? {})
  const fallback = useMemo(() => defaultConfig(defs, defaultSort, defaultFilters ?? {}), [defs, defaultSort?.key, defaultSort?.dir, filtersKey])

  const [status, setStatus] = useState<TableViewState['status']>('loading')
  const [error, setError] = useState<unknown>(null)
  const [canPublish, setCanPublish] = useState(false)
  const [views, setViews] = useState<TableViewEntry[]>(() => buildEntries([], defs, fallback, false))
  const [activeId, setActiveId] = useState(DEFAULT_VIEW_ID)
  const [config, setConfigState] = useState<ViewConfig>(fallback)
  const live = useRef(true)
  // Volta a `true` na remontagem do StrictMode; só a desmontagem real deixa `false`.
  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])

  const active = views.find((v) => v.id === activeId) ?? views[0]

  const load = useCallback(async (selectId?: string) => {
    try {
      const [stored, publisher] = await Promise.all([store.list(tela), store.canPublish().catch(() => false)])
      if (!live.current) return
      const entries = buildEntries(stored, defs, fallback, publisher)
      const chosen = selectId ? entries.find((e) => e.id === selectId) ?? entries[0] : pickInitial(entries, readLast(kv, tela))
      setViews(entries)
      setCanPublish(publisher)
      setActiveId(chosen.id)
      setConfigState(chosen.config)
      setStatus('ready')
      setError(null)
    } catch (err) {
      if (!live.current) return
      // Sem visões salvas a tela continua na padrão; o erro fica exposto para o aviso.
      setStatus('error')
      setError(err)
    }
  }, [store, tela, defs, fallback, kv])

  useEffect(() => { void load() }, [load])

  const select = useCallback((id: string) => {
    const entry = views.find((v) => v.id === id)
    if (!entry) return
    setActiveId(entry.id)
    setConfigState(entry.config)
    writeLast(kv, tela, entry.id)
  }, [views, kv, tela])

  const setConfig = useCallback((update: (c: ViewConfig) => ViewConfig) => setConfigState((c) => update(c)), [])
  const restore = useCallback(() => select(DEFAULT_VIEW_ID), [select])

  const requireEditable = () => {
    if (!active.canEdit) throw new Error('Esta visão não pode ser alterada.')
  }
  const save = useCallback(async () => {
    requireEditable()
    await store.update(active.id, { config: serializeConfig(config) })
    await load(active.id)
  }, [active, config, store, load])
  const saveAs = useCallback(async (name: string) => {
    const created = await store.create(tela, name.trim(), serializeConfig(config))
    writeLast(kv, tela, created.id)
    await load(created.id)
  }, [store, tela, config, kv, load])
  const rename = useCallback(async (name: string) => {
    requireEditable()
    await store.update(active.id, { name: name.trim() })
    await load(active.id)
  }, [active, store, load])
  const remove = useCallback(async () => {
    requireEditable()
    await store.remove(active.id)
    writeLast(kv, tela, DEFAULT_VIEW_ID)
    await load(DEFAULT_VIEW_ID)
  }, [active, store, kv, tela, load])
  const publish = useCallback(async () => {
    if (!canPublish || active.scope !== 'pessoal') throw new Error('Só gestores publicam visões pessoais.')
    await store.publish(active.id)
    await load(active.id)
  }, [active, canPublish, store, load])
  const reload = useCallback(() => load(activeId), [load, activeId])

  return {
    status, error, views, active, config, dirty: !sameConfig(config, active.config), canPublish,
    setConfig, select, restore, save, saveAs, rename, remove, publish, reload,
  }
}
