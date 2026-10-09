import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import type { Source } from './data/source'
import { cellKind } from './domain/cells'
import { buildPatch, reduceCell, validateEdit, SAVED_VISIBLE_MS, type CellEvent, type EditValue } from './domain/edit'
import { defaultSort, linkEntities } from './domain/fetch'
import { injectFilters, isEmptyFilter, type Filter, type FilterSet } from './domain/filters'
import { formatDateTime } from './domain/format'
import { columnLabel, parseLayout, rowKey } from './domain/layout'
import type { UrlState } from './domain/urlState'
import { ENTITY, ID_ATTRIBUTE, type AttributeInfo, type AttributeMap, type CellKind, type CellStatus, type Column, type Page, type Sort, type View } from './domain/types'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
export const cellKey = (id: string, attribute: string) => `${id}|${attribute}`
const FORMATTED = '@OData.Community.Display.V1.FormattedValue'

/** Falha de gravação, com o que o aviso precisa dizer (a célula guarda só a mensagem). */
export type SaveFailure = { id: string; serviceName: string; label: string; message: string }
export type GeralOptions = {
  onSaveFail?: (failure: SaveFailure) => void
  /** Estado vindo da URL: aplicado uma única vez, quando as visões chegam (visão inexistente cai na padrão). */
  initial?: UrlState
  /** Chamado quando visão, busca, ordem ou filtros mudam (inclusive o estado inicial já resolvido). */
  onStateChange?: (state: UrlState) => void
}

export type GeralState = {
  views: View[]; viewsError: string | null
  view: View | null
  columns: Column[]
  attributes: AttributeMap | null
  attributesError: string | null
  quickFind: string[]
  rows: Row[]; total: number | null; more: boolean; pagesLoaded: number
  loading: boolean; loadingMore: boolean; pageError: string | null; loadError: string | null
  sort: Sort; query: string; filters: FilterSet
  selected: Set<string>
  cells: Map<string, CellStatus>
}

/** Aplica o valor otimista (cru e anotação formatada) na chave da linha da Web API. */
function optimistic(row: Row, key: string, kind: CellKind, info: AttributeInfo | undefined, value: EditValue, raw: unknown): Row {
  const next: Row = { ...row, [key]: raw }
  const note = (() => {
    if (raw == null) return null
    switch (kind) {
      case 'choice': return info?.options.find((o) => o.value === raw)?.label ?? null
      case 'lookup': return typeof value === 'object' && value ? value.nome : null
      case 'boolean': return raw === true ? 'Sim' : 'Não'
      case 'datetime': return formatDateTime(String(raw))
      default: return null
    }
  })()
  if (note == null) delete next[`${key}${FORMATTED}`]
  else next[`${key}${FORMATTED}`] = note
  return next
}

/** Devolve à linha só a chave (e a anotação formatada) que o usuário editou, como estava antes. */
function restoreKey(row: Row, before: Row, key: string): Row {
  const next: Row = { ...row }
  for (const name of [key, `${key}${FORMATTED}`]) {
    if (name in before) next[name] = before[name]
    else delete next[name]
  }
  return next
}

/** Raiz + tabelas ligadas (`alias.atributo`). Falha na raiz = sem metadata; falha em link é ignorada. */
async function loadAttributes(source: Source, view: View): Promise<{ map: AttributeMap | null; error: string | null }> {
  let root: AttributeMap
  try { root = await source.attributes(ENTITY) } catch (reason) { return { map: null, error: message(reason) } }
  const map: AttributeMap = new Map(root)
  const links = await Promise.all(linkEntities(view.fetchxml).map(async (link) => {
    try { return { alias: link.alias, attributes: await source.attributes(link.name) } } catch { return null }
  }))
  for (const link of links) {
    if (!link) continue
    for (const [name, info] of link.attributes) map.set(`${link.alias}.${name}`, info)
  }
  return { map, error: null }
}

/** O `source` é fixado na primeira renderização: quem chama pode recriá-lo a cada render sem reiniciar a tela. */
export function useGeral(initialSource: Source, options: GeralOptions = {}) {
  const [source] = useState(initialSource)
  const [views, setViews] = useState<View[]>([])
  const [viewsError, setViewsError] = useState<string | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [attributes, setAttributes] = useState<AttributeMap | null>(null)
  const [attributesError, setAttributesError] = useState<string | null>(null)
  const [quickFind, setQuickFind] = useState<string[]>([])
  const [rows, setRowsState] = useState<Row[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [more, setMore] = useState(false)
  const [pagesLoaded, setPagesLoaded] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sort, setSortState] = useState<Sort>(null)
  const [query, setQueryState] = useState('')
  const [filters, setFilters] = useState<FilterSet>({})
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [cells, setCells] = useState<Map<string, CellStatus>>(() => new Map())
  const hasFilters = useMemo(() => Object.values(filters).some((f) => !isEmptyFilter(f)), [filters])
  /** Com filtros e a metadata ainda a caminho a consulta espera: pedir antes devolveria a lista sem filtrar. */
  const filtersPending = view != null && hasFilters && attributes == null && attributesError == null
  /** FetchXML da visão com os filtros por coluna; sem metadata (ou sem filtros) é o da própria visão. */
  const effectiveFetch = useMemo(() => {
    if (!view) return null
    if (!attributes || !hasFilters) return view.fetchxml
    try { return injectFilters(view.fetchxml, filters, attributes) } catch { return view.fetchxml }
  }, [view, attributes, filters, hasFilters])
  const defaultOrder = useMemo<Sort>(() => { try { return view ? defaultSort(view.fetchxml) : null } catch { return null } }, [view])

  // Espelhos síncronos: callbacks (save, carga de páginas) leem o valor corrente, não o do último render.
  const rowsRef = useRef<Row[]>([])
  /** Cookie da última página recebida (`null` antes da primeira ou quando o servidor não devolve). */
  const cookieRef = useRef<string | null>(null)
  const pagesRef = useRef(0)
  const moreRef = useRef(false)
  const loadingRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const loadErrorRef = useRef<string | null>(null)
  /** Visão, ordem e busca correntes: `loadMore` e `reload` pedem sempre com o contexto do último render. */
  const context = useRef({ fetchxml: null as string | null, sort: null as Sort, query: '', quickFind: [] as string[] })
  context.current = { fetchxml: filtersPending ? null : effectiveFetch, sort, query, quickFind }
  // Um fim de "salvo" por célula: gravar de novo na mesma célula cancela o anterior.
  const settleTimers = useRef(new Map<string, number>())
  /** Cada primeira página ou releitura invalida as respostas que ainda estão a caminho. */
  const pageToken = useRef(0)
  const onSaveFail = useRef(options.onSaveFail)
  onSaveFail.current = options.onSaveFail
  const onStateChange = useRef(options.onStateChange)
  onStateChange.current = options.onStateChange
  /** O estado inicial da URL vale só para a primeira carga das visões. */
  const initialRef = useRef(options.initial)

  const setRows = useCallback((update: (list: Row[]) => Row[]) => {
    rowsRef.current = update(rowsRef.current)
    setRowsState(rowsRef.current)
  }, [])
  const setLoadingFlag = useCallback((value: boolean) => { loadingRef.current = value; setLoading(value) }, [])
  const setLoadingMoreFlag = useCallback((value: boolean) => { loadingMoreRef.current = value; setLoadingMore(value) }, [])
  const setLoadErrorValue = useCallback((value: string | null) => { loadErrorRef.current = value; setLoadError(value) }, [])
  const setMoreValue = useCallback((value: boolean) => { moreRef.current = value; setMore(value) }, [])

  useEffect(() => {
    const pending = settleTimers.current
    return () => { pending.forEach((t) => window.clearTimeout(t)); pending.clear() }
  }, [])

  const enterView = useCallback((next: View) => {
    setView(next)
    setColumns(parseLayout(next.layoutxml))
    // Sem ordenação própria, a consulta mantém todos os `<order>` da visão (inclusive os secundários).
    setSortState(null)
    setCells(new Map())
    setAttributes(null)
    setAttributesError(null)
  }, [])

  // Efeito 1: visões e localização rápida em paralelo; a localização rápida nunca bloqueia a tela.
  useEffect(() => {
    let alive = true
    void Promise.all([source.views(), source.quickFind().catch(() => [] as string[])]).then(
      ([list, fields]) => {
        if (!alive) return
        setViews(list)
        setQuickFind(fields)
        setViewsError(null)
        const initial = initialRef.current
        initialRef.current = undefined
        const first = (initial?.view ? list.find((v) => v.id === initial.view) : undefined) ?? list.find((v) => v.padrao) ?? list[0]
        if (first) {
          enterView(first)
          if (initial) {
            if (initial.q) setQueryState(initial.q)
            if (initial.sort) setSortState(initial.sort)
            if (initial.filters) setFilters(initial.filters)
          }
        } else setLoadingFlag(false)
      },
      (reason) => { if (alive) { setViewsError(message(reason)); setLoadingFlag(false) } },
    )
    return () => { alive = false }
  }, [source, enterView, setLoadingFlag])

  // Efeito 2: metadata da raiz e das tabelas ligadas da visão ativa.
  useEffect(() => {
    if (!view) return
    let alive = true
    void loadAttributes(source, view).then(({ map, error }) => {
      if (!alive) return
      setAttributes(map)
      setAttributesError(error)
    })
    return () => { alive = false }
  }, [source, view])

  /** Total da visão: o da própria resposta quando vem; senão pergunta à contagem, sem travar a lista. */
  const resolveTotal = useCallback((result: Page, token: number) => {
    if (result.total != null && result.total >= 0) { setTotal(result.total); return }
    const { fetchxml, query: text, quickFind: fields } = context.current
    if (!fetchxml) return
    void source.count({ fetchxml, query: text, quickFind: fields }).then(
      (count) => { if (token === pageToken.current && count != null) setTotal(count) },
      () => { /* sem contagem: o rodapé mostra só o que já carregou */ },
    )
  }, [source])

  // Efeito 3: primeira página. Trocar visão, ordem ou busca recomeça do zero; o token descarta respostas antigas.
  useEffect(() => {
    if (!view || !effectiveFetch) return
    const token = ++pageToken.current
    rowsRef.current = []
    setRowsState([])
    cookieRef.current = null
    pagesRef.current = 0
    setPagesLoaded(0)
    setSelected(new Set())
    setTotal(null)
    setMoreValue(false)
    setLoadErrorValue(null)
    setLoadingMoreFlag(false)
    setPageError(null)
    setLoadingFlag(true)
    if (filtersPending) return
    source.page({ fetchxml: effectiveFetch, page: 1, cookie: null, sort, query, quickFind }).then(
      (result) => {
        if (token !== pageToken.current) return
        rowsRef.current = result.rows
        setRowsState(result.rows)
        cookieRef.current = result.cookie
        pagesRef.current = 1
        setPagesLoaded(1)
        setMoreValue(result.more)
        resolveTotal(result, token)
        setLoadingFlag(false)
      },
      (reason) => {
        if (token !== pageToken.current) return
        setPageError(message(reason))
        setLoadingFlag(false)
      },
    )
  }, [source, view, effectiveFetch, filtersPending, sort, query, quickFind, resolveTotal, setLoadingFlag, setLoadingMoreFlag, setLoadErrorValue, setMoreValue])

  /** Pede a próxima página e acrescenta só as linhas que ainda não estão na lista. */
  const loadMore = useCallback(() => {
    const { fetchxml, sort: order, query: text, quickFind: fields } = context.current
    if (!fetchxml || loadingRef.current || loadingMoreRef.current || !moreRef.current || loadErrorRef.current) return
    const token = pageToken.current
    const previous = cookieRef.current
    setLoadingMoreFlag(true)
    source.page({ fetchxml, page: pagesRef.current + 1, cookie: previous, sort: order, query: text, quickFind: fields }).then(
      (result) => {
        if (token !== pageToken.current) return
        setLoadingMoreFlag(false)
        // Mesmo cookie com "há mais": a consulta não andou. Não acrescenta nada para não repetir linhas.
        if (result.more && result.cookie != null && result.cookie === previous) {
          setLoadErrorValue('A consulta não avançou. Tente atualizar.')
          return
        }
        const known = new Set(rowsRef.current.map((r) => String(r[ID_ATTRIBUTE])))
        const fresh = result.rows.filter((r) => !known.has(String(r[ID_ATTRIBUTE])))
        if (fresh.length) setRows((list) => [...list, ...fresh])
        cookieRef.current = result.cookie
        pagesRef.current += 1
        setPagesLoaded(pagesRef.current)
        setMoreValue(result.more)
      },
      (reason) => {
        if (token !== pageToken.current) return
        setLoadingMoreFlag(false)
        setLoadErrorValue(message(reason))
      },
    )
  }, [source, setRows, setLoadingMoreFlag, setLoadErrorValue, setMoreValue])

  const retryLoadMore = useCallback(() => { setLoadErrorValue(null); loadMore() }, [setLoadErrorValue, loadMore])

  /** Relê da página 1 até a última carregada, em sequência (cada página com o cookie da anterior). A lista só troca ao final. */
  const reload = useCallback(() => {
    const { fetchxml, sort: order, query: text, quickFind: fields } = context.current
    if (!fetchxml) return
    const token = ++pageToken.current
    const target = Math.max(1, pagesRef.current)
    setLoadingFlag(true)
    setLoadingMoreFlag(false)
    setLoadErrorValue(null)
    setPageError(null)
    void (async () => {
      try {
        const list: Row[] = []
        const seen = new Set<string>()
        let cookie: string | null = null
        let hasMore = false
        let loaded = 0
        let first: Page | null = null
        for (let n = 1; n <= target; n += 1) {
          const result: Page = await source.page({ fetchxml, page: n, cookie, sort: order, query: text, quickFind: fields })
          if (token !== pageToken.current) return
          first ??= result
          for (const row of result.rows) {
            const id = String(row[ID_ATTRIBUTE])
            if (!seen.has(id)) { seen.add(id); list.push(row) }
          }
          cookie = result.cookie
          hasMore = result.more
          loaded = n
          if (!result.more) break
        }
        rowsRef.current = list
        setRowsState(list)
        cookieRef.current = cookie
        pagesRef.current = loaded
        setPagesLoaded(loaded)
        setMoreValue(hasMore)
        setSelected((s) => (s.size === 0 ? s : new Set([...s].filter((id) => seen.has(id)))))
        if (first) resolveTotal(first, token)
        setLoadingFlag(false)
      } catch (reason) {
        if (token !== pageToken.current) return
        setPageError(message(reason))
        setLoadingFlag(false)
      }
    })()
  }, [source, resolveTotal, setLoadingFlag, setLoadingMoreFlag, setLoadErrorValue, setMoreValue])

  const selectView = useCallback((id: string) => {
    const next = views.find((v) => v.id === id)
    if (!next) return
    enterView(next)
    // Filtros são da visão: trocar de visão recomeça sem eles, como a ordenação.
    setFilters((current) => (Object.keys(current).length ? {} : current))
  }, [views, enterView])

  const setSort = useCallback((next: Sort) => setSortState(next), [])
  const setQuery = useCallback((next: string) => setQueryState(next), [])
  /** `null` (ou um filtro sem o valor que a operação exige) remove o filtro da coluna. */
  const setFilter = useCallback((attribute: string, filter: Filter | null) => setFilters((current) => {
    if (!filter || isEmptyFilter(filter)) {
      if (!(attribute in current)) return current
      const { [attribute]: _removed, ...rest } = current
      return rest
    }
    return { ...current, [attribute]: filter }
  }), [])
  const clearFilters = useCallback(() => setFilters((current) => (Object.keys(current).length ? {} : current)), [])

  // Avisa quem guarda o estado (a URL) sempre que visão, busca, ordem ou filtros mudam. Só depois de existir uma visão.
  const viewId = view?.id
  useEffect(() => {
    if (!viewId) return
    const state: UrlState = { view: viewId }
    if (query) state.q = query
    if (sort) state.sort = sort
    if (hasFilters) state.filters = Object.fromEntries(Object.entries(filters).filter(([, f]) => !isEmptyFilter(f)))
    onStateChange.current?.(state)
  }, [viewId, query, sort, filters, hasFilters])

  const toggle = useCallback((id: string) => setSelected((s) => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  }), [])
  const toggleAll = useCallback(() => setSelected((s) => {
    const ids = rowsRef.current.map((r) => String(r[ID_ATTRIBUTE]))
    return ids.length > 0 && ids.every((id) => s.has(id)) ? new Set() : new Set(ids)
  }), [])
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const setCell = useCallback((key: string, event: CellEvent) => setCells((m) => {
    const next = new Map(m)
    next.set(key, reduceCell(m.get(key) ?? { kind: 'idle' }, event))
    return next
  }), [])
  const resetCell = useCallback((id: string, attribute: string) => setCell(cellKey(id, attribute), { type: 'reset' }), [setCell])

  const scheduleSettle = useCallback((key: string) => {
    window.clearTimeout(settleTimers.current.get(key))
    const timer = window.setTimeout(() => { settleTimers.current.delete(key); setCell(key, { type: 'settle' }) }, SAVED_VISIBLE_MS)
    settleTimers.current.set(key, timer)
  }, [setCell])

  const save = useCallback(async (id: string, column: Column, value: EditValue) => {
    const info = attributes?.get(column.key)
    const kind = cellKind(column, info)
    const key = cellKey(id, column.attribute)
    const label = columnLabel(column, info)
    const serviceName = () => { const name = rowsRef.current.find((r) => String(r[ID_ATTRIBUTE]) === id)?.cr40f_id; return typeof name === 'string' && name ? name : id }
    const fail = (message: string) => {
      setCell(key, { type: 'fail', message })
      onSaveFail.current?.({ id, serviceName: serviceName(), label, message })
      return false
    }
    const invalid = validateEdit(kind, value)
    if (invalid) return fail(invalid)
    let bindError: string | null = null
    const bind = kind === 'lookup' ? await source.lookupBind(column.attribute).catch((e) => { bindError = message(e); return null }) : undefined
    if (kind === 'lookup' && !bind) return fail(bindError ?? 'Relação do campo não encontrada.')
    const action = buildPatch(kind, column.attribute, value, bind ?? undefined)
    if (!action) return fail('Este campo não pode ser editado aqui.')
    const before = rowsRef.current.find((r) => String(r[ID_ATTRIBUTE]) === id)
    if (!before) return false
    const rKey = rowKey(column, info)
    const raw = 'clearLookup' in action ? null : kind === 'lookup' ? (typeof value === 'object' && value ? value.id : null) : action.patch[column.attribute]
    window.clearTimeout(settleTimers.current.get(key))
    settleTimers.current.delete(key)
    setCell(key, { type: 'save' })
    setRows((list) => list.map((r) => (r === before ? optimistic(r, rKey, kind, info, value, raw) : r)))

    // 1) Escrita. Só aqui um erro significa "não gravou": desfaz apenas a chave editada.
    try {
      if ('clearLookup' in action) await source.clearLookup(id, column.attribute)
      else await source.update(id, action.patch)
    } catch (reason) {
      setRows((list) => list.map((r) => (String(r[ID_ATTRIBUTE]) === id ? restoreKey(r, before, rKey) : r)))
      return fail(message(reason))
    }

    // 2) Releitura. Escrita aceita não vira erro por causa dela: mantém o valor otimista.
    const changed: string[] = []
    try {
      // Só colunas com metadata: uma coluna da visão sem atributo conhecido faria o `$select` falhar.
      const known = columns.flatMap((c) => { const meta = attributes?.get(c.key); return meta ? [{ column: c, name: rowKey(c, meta) }] : [] })
      const fresh = await source.reload(id, known.map((k) => k.name))
      setRows((list) => list.map((r) => (String(r[ID_ATTRIBUTE]) === id ? { ...r, ...fresh } : r)))
      // Células que um flow ou plugin mexeu depois da escrita também mostram "salvo".
      for (const { column: other, name } of known) {
        if (!other.alias && other.attribute !== column.attribute && name in fresh && fresh[name] !== before[name]) changed.push(other.attribute)
      }
    } catch { /* o servidor aceitou a escrita: o valor otimista fica até a próxima leitura */ }
    const at = Date.now()
    setCell(key, { type: 'ok', at })
    scheduleSettle(key)
    for (const attribute of changed) {
      const other = cellKey(id, attribute)
      // Uma gravação em andamento na outra célula manda no estado dela.
      setCells((m) => (m.get(other)?.kind === 'saving' ? m : new Map(m).set(other, reduceCell(m.get(other) ?? { kind: 'idle' }, { type: 'ok', at }))))
      scheduleSettle(other)
    }
    return true
  }, [attributes, columns, source, setCell, setRows, scheduleSettle])

  const state: GeralState = { views, viewsError, view, columns, attributes, attributesError, quickFind, rows, total, more, pagesLoaded, loading, loadingMore, pageError, loadError, sort, query, filters, selected, cells }
  /** Há filtros, mas a metadata falhou: a consulta segue sem eles. */
  const filtersIgnored = hasFilters && attributes == null && attributesError != null
  return { ...state, filtersIgnored, defaultOrder, selectView, setSort, setQuery, setFilter, clearFilters, loadMore, retryLoadMore, reload, refresh: reload, toggle, toggleAll, clearSelection, save, resetCell }
}
