import { useEffect, useMemo, useRef, useState } from 'react'
import { isExtraColumn, readFilters, storedFilters, useTableFilters, useTableView, type ColumnCatalog, type FilterField, type StoredView, type TableFilters, type TableViewState, type ViewColumnDef, type ViewSort, type ViewStore } from '@betinhos/ui'
import type { Host } from '../host'
import { createDataverseExtraSource, createMockExtraSource, extraCatalog, extraFields, resolveExtras, sortByExtra, type ExtraSource, type ExtraValues, type ResolvedExtra } from './extraColumns'
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
  /**
   * Liga "Adicionar coluna" (DS §10.9.1): campos da tabela `entity` (nome lógico) e das relações N:1, até 3 níveis.
   * `ids` são as linhas carregadas; os valores das colunas adicionadas vêm numa consulta à parte.
   */
  extra?: { entity: string; ids: string[] }
}

/** Nome da tabela (plural) para a trilha do catálogo; vem da metadata e fica `undefined` até chegar. */
export function useTableLabel(source: ExtraSource, entity: string | undefined) {
  const [label, setLabel] = useState<string | undefined>(undefined)
  useEffect(() => {
    let live = true
    if (!entity) return
    source.table(entity).then((t) => { if (live) setLabel(t.label) }).catch(() => undefined)
    return () => { live = false }
  }, [source, entity])
  return label
}

const NO_VALUES: ExtraValues = new Map()
const NO_EXTRAS: ResolvedExtra[] = []

/** Colunas `x:` da visão: catálogo, metadata resolvida e valores das linhas carregadas. */
function useExtraColumns(host: Host, extra: Options['extra'], columns: { key: string; label?: string }[]) {
  const entity = extra?.entity
  const source = useMemo(() => (host.mode === 'dataverse' ? createDataverseExtraSource(host) : createMockExtraSource()), [host])
  const tableLabel = useTableLabel(source, entity)
  const catalog = useMemo<ColumnCatalog | undefined>(() => (entity ? extraCatalog(source, entity, tableLabel) : undefined), [source, entity, tableLabel])
  const wanted = JSON.stringify(columns.filter((c) => isExtraColumn(c.key)).map((c) => [c.key, c.label ?? '']))
  const [resolved, setResolved] = useState(NO_EXTRAS)
  useEffect(() => {
    let live = true
    const list = (JSON.parse(wanted) as [string, string][]).map(([key, label]) => ({ key, label }))
    if (!entity || !list.length) { setResolved(NO_EXTRAS); return }
    void resolveExtras(source, entity, list).then((r) => { if (live) setResolved(r) })
    return () => { live = false }
  }, [source, entity, wanted])

  // Ids como texto na dependência: a tela pode montar o array a cada render sem disparar outra consulta.
  const ids = extra?.ids.join(',') ?? ''
  const [values, setValues] = useState(NO_VALUES)
  useEffect(() => {
    let live = true
    if (!entity || !resolved.length || !ids) { setValues(NO_VALUES); return }
    source.values(entity, resolved, ids.split(',')).then((v) => { if (live) setValues(v) }).catch(() => { if (live) setValues(NO_VALUES) })
    return () => { live = false }
  }, [source, entity, resolved, ids])

  return useMemo(() => {
    const get = (id: string, key: string) => values.get(id.toLowerCase())?.[key]
    return {
      catalog,
      fields: extraFields(resolved, values),
      /** Texto da célula de uma coluna `x:` (`Table.extraCell`). */
      cell: (id: string, key: string) => get(id, key)?.text ?? '',
      /** Leitura para os filtros: coluna `x:` aqui, o resto na leitura da tela. */
      read: <T>(base: (row: T, key: string) => unknown, idOf: (row: T) => string) => (row: T, key: string) => (isExtraColumn(key) ? get(idOf(row), key)?.raw ?? null : base(row, key)),
      /** Ordena pela coluna `x:` quando ela é a ordenação da visão; senão devolve a lista como veio. */
      sort: <T>(list: T[], sort: ViewSort | null | undefined, idOf: (row: T) => string) => (sort && isExtraColumn(sort.key) ? sortByExtra(list, sort.key, sort.dir, (row) => get(idOf(row), sort.key)) : list),
    }
  }, [catalog, resolved, values])
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
  const extra = useExtraColumns(o.host, o.extra, raw.config.columns)
  const fields = useMemo(() => (extra.fields.length ? [...o.fields, ...extra.fields] : o.fields), [o.fields, extra.fields])

  // O que o usuário muda (visão, colunas, filtros) encerra o filtro vindo do link; até lá ele vale a cada recarga.
  const touched = useRef(false)
  const view = useMemo<TableViewState>(() => ({
    ...raw,
    setConfig: (update) => { touched.current = true; raw.setConfig(update) },
    select: (id) => { touched.current = true; raw.select(id) },
    restore: () => { touched.current = true; raw.restore() },
  }), [raw])
  const { filters, quickFilters } = useTableFilters(view, fields)

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

  const valid = useMemo(() => readFilters(filters, fields), [filters, fields])
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
  return { view, filters: valid, quickFilters, clearFilters, fields, extra }
}
