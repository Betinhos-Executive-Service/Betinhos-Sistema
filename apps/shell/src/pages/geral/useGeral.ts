import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import type { Source } from './data/source'
import { cellKind } from './domain/cells'
import { buildPatch, reduceCell, validateEdit, SAVED_VISIBLE_MS, type CellEvent, type EditValue } from './domain/edit'
import type { ResolvedLinkColumn } from '../../app/extraColumns'
import { addExtraLinks, extraColumn } from './domain/extraLinks'
import { defaultSort, linkEntities } from './domain/fetch'
import { emptyFilters, type FilterCondition, type FilterField, type TableFilters } from '@betinhos/ui'
import { geralFilterFields, hasActiveFilters, injectTableFilters } from './domain/tableFilters'
import { formatDateTime } from './domain/format'
import { columnLabel, parseLayout, rowKey } from './domain/layout'
import type { UrlState } from './domain/urlState'
import { ENTITY, ID_ATTRIBUTE, type AttributeInfo, type AttributeMap, type CellKind, type CellStatus, type Column, type Page, type Sort, type View } from './domain/types'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
export const cellKey = (id: string, attribute: string) => `${id}|${attribute}`
const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
/** Com busca, a contagem espera esta pausa: quem ainda refina o termo troca a consulta antes e a contagem nem sai. */
export const COUNT_DELAY_MS = 1000

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
  sort: Sort; query: string
  /** Filtros como estão (vindos da URL ou da tela); valem os que casam com `filterFields`. */
  filters: TableFilters
  /** Campos filtráveis da raiz, a partir da metadata (vazio enquanto ela não chega). */
  filterFields: FilterField[]
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
  const [baseView, setView] = useState<View | null>(null)
  const [layoutColumns, setColumns] = useState<Column[]>([])
  /** Colunas adicionadas pelo painel: viram `link-entity` no FetchXML e colunas no fim do layout. */
  const [extras, setExtras] = useState<ResolvedLinkColumn[]>([])
  const view = useMemo(() => {
    if (!baseView || !extras.length) return baseView
    try { return { ...baseView, fetchxml: addExtraLinks(baseView.fetchxml, extras) } } catch { return baseView }
  }, [baseView, extras])
  const columns = useMemo(() => {
    if (!extras.length) return layoutColumns
    const known = new Set(layoutColumns.map((c) => c.key))
    return [...layoutColumns, ...extras.map(extraColumn).filter((c) => !known.has(c.key))]
  }, [layoutColumns, extras])
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
  const [filters, setFiltersState] = useState<TableFilters>(emptyFilters)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [cells, setCells] = useState<Map<string, CellStatus>>(() => new Map())
  // A visão como veio do Dataverse (sem as colunas adicionadas): base para comparar ao reler as visões.
  const viewRef = useRef<View | null>(null)
  viewRef.current = baseView
  const hasFilters = useMemo(() => hasActiveFilters(filters), [filters])
  const filterFields = useMemo(() => geralFilterFields(attributes, columns.map((c) => c.key)), [attributes, columns])
  /** Com filtros e a metadata ainda a caminho a consulta espera: pedir antes devolveria a lista sem filtrar. */
  const filtersPending = view != null && hasFilters && attributes == null && attributesError == null
  /** FetchXML da visão com os filtros por coluna; sem metadata (ou sem filtros) é o da própria visão. */
  const effectiveFetch = useMemo(() => {
    if (!view) return null
    if (!attributes || !hasFilters) return view.fetchxml
    try { return injectTableFilters(view.fetchxml, filters, filterFields) } catch { return view.fetchxml }
  }, [view, attributes, filters, hasFilters, filterFields])
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
  /** Requisições do contexto atual (páginas e contagem): trocar de contexto cancela as antigas no navegador. O token continua decidindo o que vale. */
  const requests = useRef<AbortController | null>(null)
  const countTimer = useRef(0)
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

  /** Novo contexto de consulta: cancela páginas e contagem do anterior e devolve o sinal do novo. */
  const renewRequests = useCallback(() => {
    requests.current?.abort()
    window.clearTimeout(countTimer.current)
    requests.current = typeof AbortController === 'undefined' ? null : new AbortController()
    return requests.current?.signal
  }, [])
  useEffect(() => () => { requests.current?.abort(); window.clearTimeout(countTimer.current) }, [])

  const enterView = useCallback((next: View) => {
    setView(next)
    setColumns(parseLayout(next.layoutxml))
    setExtras([])
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
            if (initial.filters) setFiltersState(initial.filters)
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

  /**
   * Total da visão sem travar a lista: o da própria resposta quando vem; sem mais páginas, o rodapé usa as linhas
   * carregadas; senão uma contagem agregada à parte (segunda consulta), que sai depois da lista e é cancelada se o
   * contexto mudar. Com busca ela ainda espera `COUNT_DELAY_MS`, para não contar termos que o usuário está refinando.
   */
  const resolveTotal = useCallback((result: Page, token: number) => {
    window.clearTimeout(countTimer.current)
    if (result.total != null && result.total >= 0) { setTotal(result.total); return }
    if (!result.more) { setTotal(null); return }
    const { fetchxml, query: text, quickFind: fields } = context.current
    if (!fetchxml) return
    const signal = requests.current?.signal
    const run = () => {
      if (token !== pageToken.current) return
      void source.count({ fetchxml, query: text, quickFind: fields, signal }).then(
        (count) => { if (token === pageToken.current && count != null) setTotal(count) },
        () => { /* sem contagem: o rodapé mostra só o que já carregou */ },
      )
    }
    if (text.trim()) countTimer.current = window.setTimeout(run, COUNT_DELAY_MS)
    else run()
  }, [source])

  // Efeito 3: primeira página. Trocar visão, ordem ou busca recomeça do zero; o token descarta respostas antigas.
  useEffect(() => {
    if (!view || !effectiveFetch) return
    const token = ++pageToken.current
    const signal = renewRequests()
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
    source.page({ fetchxml: effectiveFetch, page: 1, cookie: null, sort, query, quickFind, signal }).then(
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
  }, [source, view, effectiveFetch, filtersPending, sort, query, quickFind, resolveTotal, renewRequests, setLoadingFlag, setLoadingMoreFlag, setLoadErrorValue, setMoreValue])

  /** Pede a próxima página (rolagem infinita: o sentinela no fim da lista chama) e acrescenta só as linhas que ainda não estão na lista. */
  const loadMore = useCallback(() => {
    const { fetchxml, sort: order, query: text, quickFind: fields } = context.current
    if (!fetchxml || loadingRef.current || loadingMoreRef.current || !moreRef.current || loadErrorRef.current) return
    const token = pageToken.current
    const previous = cookieRef.current
    setLoadingMoreFlag(true)
    source.page({ fetchxml, page: pagesRef.current + 1, cookie: previous, sort: order, query: text, quickFind: fields, signal: requests.current?.signal }).then(
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
    const signal = renewRequests()
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
          const result: Page = await source.page({ fetchxml, page: n, cookie, sort: order, query: text, quickFind: fields, signal })
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
  }, [source, resolveTotal, renewRequests, setLoadingFlag, setLoadingMoreFlag, setLoadErrorValue, setMoreValue])

  const selectView = useCallback((id: string) => {
    const next = views.find((v) => v.id === id)
    if (!next) return
    enterView(next)
    // Filtros são da visão: trocar de visão recomeça sem eles, como a ordenação.
    setFiltersState((current) => (hasActiveFilters(current) ? emptyFilters() : current))
  }, [views, enterView])

  /**
   * Relê a lista de visões. Com `selectId` abre essa visão; sem ele mantém a atual (renomeada, regravada ou, se sumiu, a padrão).
   * Visão que mudou de conteúdo recomeça sem os filtros avulsos: eles já estão dentro dela. Erros sobem para quem chamou.
   */
  const reloadViews = useCallback(async (selectId?: string) => {
    const list = await source.views()
    setViews(list)
    const current = viewRef.current
    const open = (next: View) => { enterView(next); setFiltersState((f) => (hasActiveFilters(f) ? emptyFilters() : f)) }
    const target = selectId ? list.find((v) => v.id === selectId) : undefined
    if (target) { open(target); return }
    const same = current ? list.find((v) => v.id === current.id) : undefined
    if (!same) {
      const first = list.find((v) => v.padrao) ?? list[0]
      if (first) open(first)
      return
    }
    if (current && (same.fetchxml !== current.fetchxml || same.layoutxml !== current.layoutxml)) open(same)
    else if (current && same.nome !== current.nome) setView({ ...current, nome: same.nome })
  }, [source, enterView])

  const setSort = useCallback((next: Sort) => setSortState(next), [])
  const setQuery = useCallback((next: string) => setQueryState(next), [])
  const setFilters = useCallback((next: TableFilters) => setFiltersState(next), [])
  /** Filtro rápido de uma coluna; `null` remove. */
  const setQuickFilter = useCallback((attribute: string, condition: FilterCondition | null) => setFiltersState((current) => {
    if (!condition) {
      if (!(attribute in current.quick)) return current
      const { [attribute]: _removed, ...quick } = current.quick
      return { ...current, quick }
    }
    return { ...current, quick: { ...current.quick, [attribute]: condition } }
  }), [])
  const clearFilters = useCallback(() => setFiltersState((current) => (hasActiveFilters(current) ? emptyFilters() : current)), [])

  // Avisa quem guarda o estado (a URL) sempre que visão, busca, ordem ou filtros mudam. Só depois de existir uma visão.
  const viewId = view?.id
  useEffect(() => {
    if (!viewId) return
    const state: UrlState = { view: viewId }
    if (query) state.q = query
    if (sort) state.sort = sort
    if (hasFilters) state.filters = filters
    onStateChange.current?.(state)
  }, [viewId, query, sort, filters, hasFilters])

  // Última linha clicada: ponto de partida da seleção por intervalo (Shift+clique).
  const anchor = useRef<string | null>(null)
  const toggle = useCallback((id: string) => {
    anchor.current = id
    setSelected((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])
  /** Só esta linha fica selecionada; com `keep` e a linha já marcada, a seleção atual é mantida. */
  const selectOnly = useCallback((id: string, keep = false) => {
    anchor.current = id
    setSelected((s) => (keep && s.has(id) ? s : new Set([id])))
  }, [])
  /** Seleciona do último clique até `toId`, na ordem das linhas carregadas (sem âncora, só `toId`). */
  const selectRange = useCallback((toId: string) => {
    const ids = rowsRef.current.map((r) => String(r[ID_ATTRIBUTE]))
    const from = anchor.current == null ? -1 : ids.indexOf(anchor.current)
    const to = ids.indexOf(toId)
    if (to < 0) return
    if (from < 0) { anchor.current = toId; setSelected(new Set([toId])); return }
    setSelected(new Set(ids.slice(Math.min(from, to), Math.max(from, to) + 1)))
  }, [])
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
    // O feedback "salvo" fica só na célula editada: a linha recebe os valores novos (flows/plugins) sem marcar outras células.
    try {
      // Só colunas com metadata: uma coluna da visão sem atributo conhecido faria o `$select` falhar.
      const known = columns.flatMap((c) => { const meta = attributes?.get(c.key); return meta ? [{ column: c, name: rowKey(c, meta) }] : [] })
      const fresh = await source.reload(id, known.map((k) => k.name))
      setRows((list) => list.map((r) => (String(r[ID_ATTRIBUTE]) === id ? { ...r, ...fresh } : r)))
    } catch { /* o servidor aceitou a escrita: o valor otimista fica até a próxima leitura */ }
    const at = Date.now()
    setCell(key, { type: 'ok', at })
    scheduleSettle(key)
    return true
  }, [attributes, columns, source, setCell, setRows, scheduleSettle])

  const state: GeralState = { views, viewsError, view, columns, attributes, attributesError, quickFind, rows, total, more, pagesLoaded, loading, loadingMore, pageError, loadError, sort, query, filters, filterFields, selected, cells }
  /** Há filtros, mas a metadata falhou: a consulta segue sem eles. */
  const filtersIgnored = hasFilters && attributes == null && attributesError != null
  return { ...state, filtersIgnored, defaultOrder, setExtras, selectView, reloadViews, setSort, setQuery, setFilters, setQuickFilter, clearFilters, loadMore, retryLoadMore, reload, refresh: reload, toggle, selectOnly, selectRange, toggleAll, clearSelection, save, resetCell }
}
