import { useEffect, useMemo, useRef, useState } from 'react'
import { readFilters, storedFilters, useTableFilters, useTableView, type FilterField, type StoredView, type TableFilters, type TableViewState, type ViewColumnDef, type ViewSort, type ViewStore } from '@betinhos/ui'
import type { Host } from '../host'
import { patchHashQuery, readHashQuery } from '../nav/useHashRoute'
import { decodeTableFilters, encodeTableFilters } from './filtersUrl'
import { viewStoreFor, withBuiltinViews } from './viewStore'

/** Visão salva no navegador pela barra antiga de uma lista, já no formato novo. */
export type LegacyView = { name: string; config: string }

type Options = {
  host: Host
  tela: string
  columns: ViewColumnDef[]
  defaultSort?: ViewSort
  /** Filtros da Visão padrão (ex.: só ativos). */
  defaultFilters?: TableFilters
  /** Nome da visão padrão, que é o título da lista (DS §10.9.1): o nome da tela, nunca "Visão padrão". */
  defaultName?: string
  fields: FilterField[]
  /** Escolhas e opções carregadas: até lá a lista de visões espera e o link não é lido. */
  ready: boolean
  /** Visões prontas do código (públicas e só leitura); lidas quando `ready`. */
  builtins: () => StoredView[]
  /** Parâmetros antigos da tela na URL: convertidos para filtros e retirados do link. */
  legacy?: { keys: readonly string[]; read: (query: URLSearchParams) => TableFilters }
  /** Visões antigas do navegador: vão uma vez para o armazenamento e saem de lá. */
  imports?: { list: () => LegacyView[]; done: () => void; onImported: (count: number) => void }
}

/**
 * Visões, colunas e filtros de uma lista no padrão do Design System (§10.9.1 e §10.9.2), com o que é comum às telas:
 * visões salvas no Dataverse mais as prontas, filtros em `f=` na URL (o link compartilhado abre igual), links antigos
 * convertidos e importação das visões que ficavam no navegador.
 */
export function useListView(o: Options) {
  const latest = useRef(o)
  latest.current = o

  // As prontas dependem das escolhas; a lista espera por elas para o store não mudar (trocar o store recarrega as
  // visões e descartaria o filtro vindo do link).
  const [gate] = useState(() => {
    let open = () => undefined as void
    const ready = new Promise<void>((resolve) => { open = resolve })
    return { ready, open: () => open() }
  })
  useEffect(() => { if (o.ready) gate.open() }, [o.ready, gate])
  const store = useMemo<ViewStore>(() => {
    const base = withBuiltinViews(viewStoreFor(o.host), () => latest.current.builtins())
    return { ...base, list: async (tela) => { await gate.ready; return base.list(tela) } }
  }, [o.host, gate])
  const defaultFilters = useMemo(() => (o.defaultFilters ? storedFilters(o.defaultFilters) : undefined), [JSON.stringify(o.defaultFilters ?? null)]) // eslint-disable-line react-hooks/exhaustive-deps
  const raw = useTableView({ tela: o.tela, columns: o.columns, store, defaultSort: o.defaultSort, defaultFilters, defaultName: o.defaultName })

  // O que o usuário muda (visão, colunas, filtros) encerra o filtro vindo do link; até lá ele vale a cada recarga.
  const touched = useRef(false)
  const view = useMemo<TableViewState>(() => ({
    ...raw,
    setConfig: (update) => { touched.current = true; raw.setConfig(update) },
    select: (id) => { touched.current = true; raw.select(id) },
    restore: () => { touched.current = true; raw.restore() },
  }), [raw])
  const { filters, quickFilters } = useTableFilters(view, o.fields)

  const urlApplied = useRef(false)
  const linked = useRef<TableFilters | null | undefined>(undefined)
  const { status, views, reload } = raw
  const applyConfig = raw.setConfig
  useEffect(() => {
    if (status !== 'ready' || !o.ready) return
    if (linked.current === undefined) {
      const q = readHashQuery()
      const f = q.get('f')
      const legacy = latest.current.legacy
      const old = legacy && legacy.keys.some((k) => q.has(k)) ? legacy.read(q) : null
      linked.current = (f ? decodeTableFilters(f) : null) ?? old
      if (old && legacy) patchHashQuery(Object.fromEntries(legacy.keys.map((k) => [k, null])))
    }
    const next = linked.current
    if (next && !touched.current) applyConfig((c) => ({ ...c, filters: storedFilters(next) }))
    urlApplied.current = true
  }, [status, views, o.ready, applyConfig])

  const valid = useMemo(() => readFilters(filters, o.fields), [filters, o.fields])
  useEffect(() => {
    if (!urlApplied.current) return
    const f = encodeTableFilters(valid)
    if ((readHashQuery().get('f') ?? '') !== f) patchHashQuery({ f: f || null })
  }, [valid])

  const imported = useRef(false)
  useEffect(() => {
    const imports = latest.current.imports
    if (imported.current || status !== 'ready' || !o.ready || !imports) return
    imported.current = true
    const old = imports.list()
    if (!old.length) return
    void (async () => {
      try {
        for (const v of old) await store.create(o.tela, v.name, v.config)
        imports.done()
        await reload()
        imports.onImported(old.length)
      } catch {
        imported.current = false
      }
    })()
  }, [status, o.ready, o.tela, store, reload])

  const clearFilters = () => view.setConfig((c) => ({ ...c, filters: {} }))
  return { view, filters: valid, quickFilters, clearFilters }
}
