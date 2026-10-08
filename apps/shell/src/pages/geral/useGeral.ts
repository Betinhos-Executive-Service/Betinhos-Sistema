import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import type { Source } from './data/source'
import { cellKind } from './domain/cells'
import { buildPatch, reduceCell, validateEdit, SAVED_VISIBLE_MS, type CellEvent, type EditValue } from './domain/edit'
import { defaultSort, linkEntities } from './domain/fetch'
import { formatDateTime } from './domain/format'
import { columnLabel, parseLayout, rowKey } from './domain/layout'
import { ENTITY, ID_ATTRIBUTE, type AttributeInfo, type AttributeMap, type CellKind, type CellStatus, type Column, type Sort, type View } from './domain/types'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
export const cellKey = (id: string, attribute: string) => `${id}|${attribute}`
const FORMATTED = '@OData.Community.Display.V1.FormattedValue'

/** Falha de gravação, com o que o aviso precisa dizer (a célula guarda só a mensagem). */
export type SaveFailure = { id: string; serviceName: string; label: string; message: string }
export type GeralOptions = { onSaveFail?: (failure: SaveFailure) => void }

export type GeralState = {
  views: View[]; viewsError: string | null
  view: View | null
  columns: Column[]
  attributes: AttributeMap | null
  attributesError: string | null
  quickFind: string[]
  rows: Row[]; page: number; total: number | null; more: boolean; cookies: (string | null)[]
  loading: boolean; pageError: string | null
  sort: Sort; query: string
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
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [more, setMore] = useState(false)
  const [cookies, setCookiesState] = useState<(string | null)[]>([null])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [sort, setSortState] = useState<Sort>(null)
  const [query, setQueryState] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [cells, setCells] = useState<Map<string, CellStatus>>(() => new Map())
  const [nonce, setNonce] = useState(0)
  const defaultOrder = useMemo<Sort>(() => { try { return view ? defaultSort(view.fetchxml) : null } catch { return null } }, [view])

  // Espelhos síncronos: callbacks (save, efeito de página) leem o valor corrente, não o do último render.
  const rowsRef = useRef<Row[]>([])
  const cookiesRef = useRef<(string | null)[]>([null])
  // Um fim de "salvo" por célula: gravar de novo na mesma célula cancela o anterior.
  const settleTimers = useRef(new Map<string, number>())
  const pageToken = useRef(0)
  const onSaveFail = useRef(options.onSaveFail)
  onSaveFail.current = options.onSaveFail

  const setRows = useCallback((update: (list: Row[]) => Row[]) => {
    rowsRef.current = update(rowsRef.current)
    setRowsState(rowsRef.current)
  }, [])
  const setCookies = useCallback((next: (string | null)[]) => { cookiesRef.current = next; setCookiesState(next) }, [])

  useEffect(() => {
    const pending = settleTimers.current
    return () => { pending.forEach((t) => window.clearTimeout(t)); pending.clear() }
  }, [])

  const enterView = useCallback((next: View) => {
    setView(next)
    setColumns(parseLayout(next.layoutxml))
    // Sem ordenação própria, a consulta mantém todos os `<order>` da visão (inclusive os secundários).
    setSortState(null)
    setPage(1)
    setCookies([null])
    setSelected(new Set())
    setCells(new Map())
    setAttributes(null)
    setAttributesError(null)
  }, [setCookies])

  // Efeito 1: visões e localização rápida em paralelo; a localização rápida nunca bloqueia a tela.
  useEffect(() => {
    let alive = true
    void Promise.all([source.views(), source.quickFind().catch(() => [] as string[])]).then(
      ([list, fields]) => {
        if (!alive) return
        setViews(list)
        setQuickFind(fields)
        setViewsError(null)
        const first = list.find((v) => v.padrao) ?? list[0]
        if (first) enterView(first)
        else setLoading(false)
      },
      (reason) => { if (alive) { setViewsError(message(reason)); setLoading(false) } },
    )
    return () => { alive = false }
  }, [source, enterView])

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

  // Efeito 3: página; o token descarta respostas fora de ordem.
  useEffect(() => {
    if (!view) return
    const current = ++pageToken.current
    setLoading(true)
    setPageError(null)
    source.page({ fetchxml: view.fetchxml, page, cookie: cookiesRef.current[page - 1] ?? null, sort, query, quickFind }).then(
      (result) => {
        if (current !== pageToken.current) return
        setRows(() => result.rows)
        setTotal(result.total)
        setMore(result.more)
        const next = cookiesRef.current.slice(0, page)
        next[page] = result.cookie
        setCookies(next)
        setLoading(false)
      },
      (reason) => {
        if (current !== pageToken.current) return
        setPageError(message(reason))
        setLoading(false)
      },
    )
  }, [source, view, sort, query, page, nonce, quickFind, setRows, setCookies])

  const selectView = useCallback((id: string) => {
    const next = views.find((v) => v.id === id)
    if (next) enterView(next)
  }, [views, enterView])

  const backToFirst = useCallback(() => { setPage(1); setCookies([null]); setSelected(new Set()) }, [setCookies])
  const setSort = useCallback((next: Sort) => { setSortState(next); backToFirst() }, [backToFirst])
  const setQuery = useCallback((next: string) => { setQueryState(next); backToFirst() }, [backToFirst])
  // A seleção vale para a página visível: trocar de página a limpa.
  const goTo = useCallback((next: number) => { setPage(Math.max(1, Math.floor(next))); setSelected(new Set()) }, [])
  const reload = useCallback(() => { backToFirst(); setNonce((n) => n + 1) }, [backToFirst])
  /** Relê a página atual sem voltar à primeira nem limpar a seleção. */
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

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

  const state: GeralState = { views, viewsError, view, columns, attributes, attributesError, quickFind, rows, page, total, more, cookies, loading, pageError, sort, query, selected, cells }
  return { ...state, defaultOrder, selectView, setSort, setQuery, goTo, reload, refresh, toggle, toggleAll, clearSelection, save, resetCell }
}
