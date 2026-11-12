import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Check, ClipboardList, Download, FilePlus2, LoaderCircle, RefreshCw, Search, SearchX, Trash2, X } from 'lucide-react'
import { ContextMenu, ToastProvider, useToast, type MenuAction } from '@betinhos/ui'
import { logAppError } from '@betinhos/ui/error-logger'
import { PageLayout } from '../../app/PageLayout'
import type { Host } from '../../host'
import { DataTable } from './components/DataTable'
import { ViewManager } from './components/ViewManager'
import { ColumnHeader, type ActiveColumnFilter } from './components/ColumnHeader'
import { AuditOverlay } from './components/AuditOverlay'
import { CellHoverPreview } from './components/CellHoverPreview'
import { CommandConfirmDialog } from './components/CommandConfirmDialog'
import { confirmDialogContent, useCompositionCommands, type CommandNotice, type CommandPhase, type RefreshOptions } from './components/useCompositionCommands'
import { useTotalCount } from './components/useTotalCount'
import type { DataTableFeatures } from './components/features'
import { EditableViewFieldCell } from './components/ViewFieldCell'
import { adjacentGridCell } from './components/grid-cell-focus'
import { isWritableMoneyField, moneyFields, type CellInput, type Composition, type MoneyField } from './data/compositions'
import { applyCompositionCellInput, getDataverseEnvironmentLabel, getDataverseUrl, loadCompositionById, loadCompositions, type FormulaMap } from './data/dataverse'
import { buildNativeCompositionQuery, resolveCompositionQuery, type ResolvedCompositionQuery } from './data/composition-query'
import { collectCompositionPages, compositionWorkbook, freshPageRecords } from './data/composition-export'
import { createColumnFilterLabels } from './data/column-filter-values'
import { nextEditableCell } from './data/grid-navigation'
import { CompositionSaveQueue } from './data/composition-save-queue'
import { matchesCompositionFilters, sumSelectedCompositions } from './data/composition-totals'
import { applyMockView, deleteMockView, loadMockViews, mockColumnCatalog, saveMockView } from './data/mock-views'
import { withCalculatedTotals } from './data/composition-calculated'
import { analyzeFormula, decimal, decimalString, evaluateFormulaSet, FormulaError, formulaErrorMessage, formulaExpressionFromInput, friendlyExpression, insertReferenceInFormula } from './formula'
import { buildViews, COMPOSITION_TABLE, defaultViewDefinition, deleteView, fetchViewRows, loadColumnCatalog, loadViews, saveView, viewValueKey, type CatalogField, type SavedView, type ViewDefinition, type ViewFilter, type ViewQuery, type ViewRows } from './data/views'
import { catalogCacheKey, readCachedCatalog, sameCatalog, writeCachedCatalog } from './data/catalog-cache'
import { LAST_VIEW_KEY, openQueryFromViewRow, pickOpenView } from './data/open-query'
import { readViewField } from './data/view-field-read'
import { openGridRecord } from './data/record-navigation'
import { getXrmHost } from './data/xrm'
import { relatedRecordId, type SavedFieldValue } from './data/related-field-edit'
import { gridNumberInput } from './data/grid-field-value'
import './composicao.css'

const column = createColumnHelper<DataTableFeatures, Composition>()
const SAVE_FEEDBACK_DURATION = 1600
const SAVE_FEEDBACK_FADE_DURATION = 140
const REPEATED_PAGE_MESSAGE = 'O Dataverse repetiu uma página. Carregamento interrompido para evitar registros duplicados.'
// Releitura automática para quem está com a tela aberta ver o que outras pessoas gravaram.
const AUTO_REFRESH_INTERVAL = 30_000
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
/** Formatação Intl é cara por célula; os valores se repetem muito entre renderizações, então o resultado fica em cache. */
function cachedFormatter(format: (value: string) => string, limit = 4000) {
  const cache = new Map<string, string>()
  return (value: string) => {
    let formatted = cache.get(value)
    if (formatted === undefined) {
      formatted = format(value)
      if (cache.size >= limit) cache.clear()
      cache.set(value, formatted)
    }
    return formatted
  }
}
const moneyFormat = cachedFormatter((value) => moneyFormatter.format(Number(value)))
const formatDepartureDate = cachedFormatter((value) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)} 00:00`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date)
})
let rowsVersionCounter = 0
const SKELETON_COLUMNS = moneyFields.length + 4
const SKELETON_ROWS = 12

function PriceGridSkeleton() {
  return (
    <div className="price-grid-skeleton" role="status" aria-label="Carregando composições">
      <table className="price-grid price-grid--skeleton" aria-hidden="true">
        <thead><tr>{Array.from({ length: SKELETON_COLUMNS }, (_, index) => <th key={index}><span className="skeleton-bar skeleton-bar--header" /></th>)}</tr></thead>
        <tbody>{Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <tr key={row}>{Array.from({ length: SKELETON_COLUMNS }, (_, cell) => <td key={cell}><span className="skeleton-bar" /></td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

type EditingCell = { rowId: string; field: MoneyField; value: string }
type OptimisticInput = { rowId: string; field: MoneyField; input: CellInput; requestId: number }
type SaveFeedback = { rowId: string; field: MoneyField; status: 'saving' | 'saved' | 'saved-leaving' | 'error'; message?: string; draft?: string }
type ContextCell = { x: number; y: number; rowId: string; field: MoneyField }

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message
  if (typeof error === 'string') return error
  return fallback
}

function parseMoney(value: string) {
  const normalized = gridNumberInput(value)
  if (normalized === null) return null
  try { return decimalString(decimal(normalized)) } catch { return null }
}

function moneyDraft(value: string) { return value.replace('.', ',') }

/** Copia texto; dentro do iframe do Dataverse a Clipboard API costuma ser bloqueada, então cai no execCommand. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch { /* tenta o método legado abaixo */ }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  if (!copied) throw new Error('Área de transferência indisponível.')
}

function referenceQuery(value: string, cursor: number) {
  if (!value.trimStart().startsWith('=')) return null
  const beforeCursor = value.slice(0, cursor)
  const bracketStart = beforeCursor.lastIndexOf('[')
  if (bracketStart > beforeCursor.lastIndexOf(']')) {
    const query = beforeCursor.slice(bracketStart + 1)
    if (/[\[\]=+*/%()\-]/u.test(query)) return null
    return { start: bracketStart, query }
  }
  const bareField = beforeCursor.match(/(?:^|[=+\-*/(])\s*([\p{L}][\p{L}\p{M}\s]*)$/u)
  return bareField ? { start: beforeCursor.length - bareField[1].length, query: bareField[1] } : null
}

function searchLabel(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
}

function projectPendingInputs(rows: Composition[], pending: Record<string, OptimisticInput>) {
  const byRow = new Map<string, OptimisticInput[]>()
  Object.values(pending).forEach((entry) => byRow.set(entry.rowId, [...(byRow.get(entry.rowId) ?? []), entry]))
  if (!byRow.size) return rows
  return rows.map((row) => {
    const entries = byRow.get(row.id)
    if (!entries) return row
    const values = { ...row.values }
    const formulas = { ...row.formulas }
    entries.forEach(({ field, input }) => {
      if (input.kind === 'literal') {
        values[field] = input.value
        delete formulas[field]
      } else formulas[field] = { expression: input.expression, engineVersion: 1 }
    })
    const expressions = Object.fromEntries(Object.entries(formulas).map(([field, formula]) => [field, formula?.expression])) as Partial<Record<MoneyField, string>>
    return { ...row, values: withCalculatedTotals(evaluateFormulaSet(expressions, values).values), formulas }
  })
}

export function ComposicaoPage({ host }: { host: Host }) {
  return <ToastProvider><ComposicaoContent host={host} /></ToastProvider>
}

/** `keys`: id resolvido da coluna → nome da célula no resultado da consulta da abertura (alias da própria view, ex. `a_67d5.campo`). */
type OpenQuery = { view: { fetchXml: string } | undefined; viewId: string | null; shape: string; keys: ReadonlyMap<string, string> }

/** Casa, coluna a coluna, o layout da abertura com a view interpretada; null quando não casam (a abertura é então refeita). */
function openColumnKeys(open: ViewDefinition, interpreted: ViewDefinition, catalog: CatalogField[]): Map<string, string> | null {
  if (open.columns.length !== interpreted.columns.length) return null
  const keys = new Map<string, string>()
  for (const [index, column] of open.columns.entries()) {
    const resolved = interpreted.columns[index].id
    if (resolved === column.id) continue
    const field = catalog.find((item) => item.id === resolved)
    // Posição igual não basta: o atributo tem de ser o mesmo, senão o valor iria para a coluna errada (relê).
    if (!field || (column.id !== field.attribute && !column.id.endsWith(`.${field.attribute}`))) return null
    keys.set(resolved, column.id)
  }
  return keys
}

/** Parte da definição que muda a consulta (ids, filtros e ordenação); larguras e fixação não entram. */
function queryShapeKey(definition: ViewDefinition) {
  return JSON.stringify([definition.columns.map(({ id }) => id), definition.filters, definition.filterGroups, definition.groupOperator, definition.sort])
}

/** Rótulo provisório de coluna ligada enquanto a metadata não chega: só o trecho depois do último ponto. */
function provisionalField(id: string): CatalogField {
  const name = id.slice(id.lastIndexOf('.') + 1)
  return { id, label: name, table: COMPOSITION_TABLE, attribute: name, path: [], type: 'String', available: true } as CatalogField
}

function ComposicaoContent({ host }: { host: Host }) {
  const toast = useToast()
  const hostRef = useRef(host)
  hostRef.current = host
  const [rows, setRows] = useState<Composition[]>([])
  const [optimisticInputs, setOptimisticInputs] = useState<Record<string, OptimisticInput>>({})
  const [catalog, setCatalog] = useState<CatalogField[]>([])
  const [catalogReady, setCatalogReady] = useState(false)
  const [views, setViews] = useState<SavedView[]>([])
  const [activeView, setActiveView] = useState<SavedView | null>(null)
  const [viewDefinition, setViewDefinition] = useState<ViewDefinition>(() => defaultViewDefinition(moneyFields.map((field) => field.key)))
  const [viewError, setViewError] = useState<string | null>(null)
  const [statusColors, setStatusColors] = useState<Record<string, string>>({})
  const [dataSource, setDataSource] = useState<'dataverse' | 'mock' | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [nextLink, setNextLink] = useState<string | null>(null)
  const [countTick, setCountTick] = useState(0)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [serverSearch, setServerSearch] = useState('')
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [editorTarget, setEditorTarget] = useState<'cell' | 'bar'>('cell')
  const [editorCaret, setEditorCaret] = useState(0)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const [barSuggestionLeft, setBarSuggestionLeft] = useState(162)
  const [saveFeedback, setSaveFeedback] = useState<Record<string, SaveFeedback>>({})
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; field: MoneyField } | null>(null)
  const [contextCell, setContextCell] = useState<ContextCell | null>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])
  const [auditIds, setAuditIds] = useState<string[] | null>(null)
  const [commandPhase, setCommandPhase] = useState<CommandPhase>(null)
  const [commandProgress, setCommandProgress] = useState('')
  const [notice, setNotice] = useState<CommandNotice | null>(null)
  const [relatedRefreshPending, setRelatedRefreshPending] = useState(false)
  const [relatedFieldBusy, setRelatedFieldBusy] = useState(false)
  const [filterDrawerHost, setFilterDrawerHost] = useState<HTMLDivElement | null>(null)
  const [openQuery, setOpenQuery] = useState<OpenQuery | null>(null)
  const [formulasError, setFormulasError] = useState<string | null>(null)
  const [tableScroller, setTableScroller] = useState<HTMLDivElement | null>(null)
  const skipLoadRef = useRef(false)
  const formulasPendingRef = useRef(new Map<string, Promise<void>>())
  const formulasErrorRef = useRef<string | null>(null)
  formulasErrorRef.current = formulasError
  const loadedPagesRef = useRef(1)
  const loadedIdsRef = useRef(new Set<string>())
  const viewRequestRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const refreshingRef = useRef(false)
  const backgroundRefreshingRef = useRef(false)
  const backgroundFailedRef = useRef(false)
  const localWritesRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const formulaBarRef = useRef<HTMLInputElement>(null)
  const formulaBarContainerRef = useRef<HTMLDivElement>(null)
  const editorTargetRef = useRef<'cell' | 'bar'>('cell')
  const tableRegionRef = useRef<HTMLDivElement | null>(null)
  const setTableRegion = useCallback((node: HTMLDivElement | null) => { tableRegionRef.current = node; setTableScroller(node) }, [])
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const editingRef = useRef<EditingCell | null>(editing)
  const selectedCellRef = useRef(selectedCell)
  const saveFeedbackRef = useRef(saveFeedback)
  const saveFeedbackTimersRef = useRef(new Map<string, number>())
  const inFlightSavesRef = useRef(new Map<string, { value: string; requestId: number; promise: Promise<void> }>())
  const fieldEditsRef = useRef(new Set<string>())
  const fieldSavesRef = useRef(new Set<string>())
  const hasPendingEdits = useCallback(() => Boolean(editingRef.current || inFlightSavesRef.current.size || fieldEditsRef.current.size || fieldSavesRef.current.size), [])
  const saveQueueRef = useRef<CompositionSaveQueue | null>(null)
  saveQueueRef.current ??= new CompositionSaveQueue(applyCompositionCellInput)
  const clipboardRef = useRef<string | null>(null)
  editingRef.current = editing
  selectedCellRef.current = selectedCell
  saveFeedbackRef.current = saveFeedback
  const blurTimerRef = useRef<number | null>(null)
  const saveRequestIdsRef = useRef(new Map<string, number>())
  const keepEditorDuringMenuRef = useRef(false)
  const searchTerm = search.trim().toLocaleLowerCase('pt-BR')
  useEffect(() => { const timer = window.setTimeout(() => setServerSearch(search.trim()), 250); return () => window.clearTimeout(timer) }, [search])
  const projectedRows = useMemo(() => projectPendingInputs(rows, optimisticInputs), [rows, optimisticInputs])
  const visibleRows = useMemo(() => dataSource === 'mock' ? applyMockView(projectedRows, viewDefinition).filter((row) => matchesCompositionFilters(row, searchTerm, columnFilters)) : projectedRows, [columnFilters, dataSource, projectedRows, searchTerm, viewDefinition])
  const rowsRef = useRef(rows)
  const commandLockedRef = useRef(false)
  const visibleRowsRef = useRef(visibleRows)
  const viewColumnsRef = useRef(viewDefinition.columns)
  const viewDefinitionRef = useRef(viewDefinition)
  viewDefinitionRef.current = viewDefinition
  // A largura não entra nos valores nem na montagem das colunas; fora do memo, redimensionar não recria todas as linhas.
  const viewShapeKey = JSON.stringify({ ...viewDefinition, columns: viewDefinition.columns.map(({ width: _width, ...column }) => column) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const viewShape = useMemo(() => viewDefinition, [viewShapeKey])
  rowsRef.current = rows
  visibleRowsRef.current = visibleRows
  viewColumnsRef.current = viewDefinition.columns
  const selectedVisibleRows = useMemo(() => {
    const selectedIds = new Set(selectedRowIds)
    return visibleRows.filter((row) => selectedIds.has(row.id))
  }, [selectedRowIds, visibleRows])
  const selectedCount = selectedVisibleRows.length
  const selectedIds = selectedVisibleRows.map((row) => row.id)
  const queryColumnIds = JSON.stringify(viewDefinition.columns.map(({ id }) => id))
  const commandLocked = commandPhase !== null || loading || loadingMore || exporting || Boolean(editing) || relatedFieldBusy || Object.values(saveFeedback).some((feedback) => feedback.status === 'saving')
  commandLockedRef.current = commandLocked
  const usingMockData = dataSource === 'mock'
  // A consulta da abertura (FetchXML da view, sem metadata) vale enquanto nada mudar a forma da consulta; assim a chegada
  // da metadata não refaz a primeira página nem a contagem.
  const openActive = openQuery !== null && serverSearch === '' && openQuery.shape === queryShapeKey(viewDefinition) && (!catalogReady || openQuery.viewId === (activeView?.id ?? null))
  const { view: queryView, error: queryError } = useMemo<ResolvedCompositionQuery>(
    () => usingMockData ? { view: undefined, error: null } : openActive ? { view: openQuery!.view, error: null } : resolveCompositionQuery(activeView, viewDefinitionRef.current, catalog, serverSearch),
    // Larguras e fixação de colunas não mudam a consulta; só ids, filtros e ordenação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeView, catalog, openActive, openQuery?.view, usingMockData, queryColumnIds, serverSearch, viewDefinition.filters, viewDefinition.filterGroups, viewDefinition.groupOperator, viewDefinition.sort])
  const totalCount = useTotalCount(queryView, dataSource === 'dataverse' && !queryError, countTick)
  const applyViewDefinition = useCallback((definition: ViewDefinition) => setViewDefinition({ ...definition, columns: [...definition.columns.filter((item) => item.pinned), ...definition.columns.filter((item) => !item.pinned)] }), [])
  const trackFormulas = useCallback((records: Composition[], formulas: Promise<FormulaMap>, request: number) => {
    const ids = records.map((record) => record.id)
    // As fórmulas chegam depois da página: mescla por id sem sobrescrever as de uma edição já concluída.
    const settled: Promise<void> = formulas.then((map) => {
      if (request !== viewRequestRef.current) return
      const merge = (current: Composition[]) => current.map((row) => {
        const found = map.get(row.id)
        return found ? { ...row, formulas: { ...found, ...row.formulas } } : row
      })
      rowsRef.current = merge(rowsRef.current)
      setRows(merge)
    }, (error: unknown) => {
      if (request !== viewRequestRef.current) return
      void logAppError(error, { action: 'carregar-formulas', phase: 'load', component: 'ComposicaoPage' })
      const message = errorMessage(error, 'Não foi possível carregar as fórmulas.')
      formulasErrorRef.current = message
      setFormulasError(message)
    }).finally(() => { ids.forEach((id) => { if (formulasPendingRef.current.get(id) === settled) formulasPendingRef.current.delete(id) }) })
    ids.forEach((id) => formulasPendingRef.current.set(id, settled))
  }, [])
  useEffect(() => {
    if (!usingMockData) return
    setCatalog(mockColumnCatalog())
    try { setViews(loadMockViews()); setViewError(null) }
    catch (error) { setViewError(errorMessage(error, 'Não foi possível carregar as views locais.')) }
  }, [usingMockData])
  // Abertura: views (3 leituras) -> primeira página com o FetchXML da view -> metadata em segundo plano. A grade aparece sem
  // esperar nenhuma metadata; a metadata só completa os campos (rótulos, edição, filtros) quando chega.
  useEffect(() => {
    let alive = true
    const request = ++viewRequestRef.current
    const current = () => alive && request === viewRequestRef.current
    const currentHost = hostRef.current
    if (currentHost.mode === 'dataverse') {
      void currentHost.metadata.choices('cr40f_composicaodeprecos', 'new_status').then((options) => {
        if (alive) setStatusColors(Object.fromEntries(options.filter((option) => option.color).map((option) => [String(option.value), option.color as string])))
      }).catch(() => undefined)
    }
    let cacheKey: string | null = null
    try { cacheKey = catalogCacheKey(currentHost.mode === 'dataverse' ? currentHost.clientUrl : getDataverseUrl()) } catch { cacheKey = null }
    let cached: CatalogField[] | null = null
    try { cached = cacheKey ? readCachedCatalog(cacheKey) : null } catch { cached = null }
    if (cached) setCatalog(cached)
    void (async () => {
      let viewRows: ViewRows | null = null
      let viewsFailure: string | null = null
      try { viewRows = await fetchViewRows() } catch (error) { viewsFailure = errorMessage(error, 'Não foi possível carregar as views.') }
      if (!current()) return
      let lastId: string | null = null
      try { lastId = window.localStorage.getItem(LAST_VIEW_KEY) } catch { lastId = null }
      const picked = viewRows ? pickOpenView(viewRows, lastId) : null
      const openView = picked ? openQueryFromViewRow(picked.row) : null
      // Visão sem colunas no layout não dá o que mostrar: abre pela consulta e colunas padrão.
      const useOpen = openView !== null && openView.columns.length > 0
      const openDefinition: ViewDefinition = useOpen
        ? { ...defaultViewDefinition([]), columns: openView.columns.map(({ id, width }) => ({ id, width, pinned: false })) }
        : viewDefinitionRef.current
      if (useOpen) { viewDefinitionRef.current = openDefinition; setViewDefinition(openDefinition) }
      setOpenQuery({ view: useOpen ? { fetchXml: openView.fetchXml } : undefined, viewId: useOpen ? picked!.id : null, shape: queryShapeKey(openDefinition), keys: new Map() })
      const pagePromise = loadCompositions(undefined, useOpen ? { fetchXml: openView.fetchXml } : undefined)
      // A metadata parte depois que a primeira página foi pedida: ela não disputa a fila com os dados.
      const catalogPromise = loadColumnCatalog().then((fields) => ({ fields }), (error: unknown) => ({ error }))
      let firstPage: Awaited<typeof pagePromise> | null = null
      try { firstPage = await pagePromise } catch (error) {
        if (!current()) return
        void logAppError(error, { action: 'carregar-composicoes', phase: 'load', component: 'ComposicaoPage' })
        setRows([])
        setConnectionError(errorMessage(error, 'Falha ao carregar dados do Dataverse.'))
      }
      if (!current()) return
      if (firstPage) {
        saveQueueRef.current?.reset()
        loadedIdsRef.current = new Set(firstPage.records.map((record) => record.id))
        loadedPagesRef.current = 1
        setRows(firstPage.records)
        setDataSource(firstPage.source)
        setNextLink(firstPage.nextLink)
        setConnectionError(null)
        trackFormulas(firstPage.records, firstPage.formulas, request)
      }
      setLoading(false)
      if (firstPage?.source === 'mock') {
        skipLoadRef.current = true
        setOpenQuery(null)
        setCatalogReady(true)
        return
      }
      const settled = cached ? { fields: cached } : await catalogPromise
      if (!current()) return
      const fields = 'fields' in settled ? settled.fields : []
      try {
        const interpreted = viewRows ? buildViews(viewRows, fields) : []
        setViews(interpreted)
        const interpretedActive = picked ? interpreted.find((view) => view.id === picked.id) ?? null : null
        let invalidate = false
        if (useOpen && interpretedActive) {
          const keys = openColumnKeys(openDefinition, interpretedActive.definition, fields)
          if (keys) {
            const shape = queryShapeKey(interpretedActive.definition)
            viewDefinitionRef.current = interpretedActive.definition
            setViewDefinition(interpretedActive.definition)
            setOpenQuery((previous) => previous && { ...previous, shape, keys })
          } else invalidate = true
          setActiveView(interpretedActive)
          if (invalidate) { setViewDefinition(interpretedActive.definition); setOpenQuery(null) }
        } else if (useOpen) {
          setOpenQuery((previous) => previous && { ...previous, viewId: null })
        } else if (interpretedActive) {
          setActiveView(interpretedActive)
          setViewDefinition(interpretedActive.definition)
        }
        // A consulta da abertura vale (inclusive após falha: quem tenta de novo é o Atualizar); só a visão a reinterpretar relê.
        skipLoadRef.current = !invalidate && (useOpen || picked === null)
        if (viewsFailure) setViewError(viewsFailure)
        else setViewError('error' in settled ? `Campos indisponíveis: ${errorMessage(settled.error, 'Falha na metadata.')} As views nativas continuam disponíveis.` : null)
      } catch (error) {
        skipLoadRef.current = false
        setViewError(errorMessage(error, 'Não foi possível carregar as views.'))
      }
      setCatalog(fields)
      if (!cached && 'fields' in settled && cacheKey) writeCachedCatalog(cacheKey, settled.fields)
      setCatalogReady(true)
      if (cached) {
        // Com catálogo em cache a tela já abriu; a metadata é revalidada e só muda a tela se o schema mudou.
        const network = await catalogPromise
        if (!current() || !('fields' in network) || sameCatalog(cached, network.fields)) return
        if (cacheKey) writeCachedCatalog(cacheKey, network.fields)
        setCatalog(network.fields)
        if (viewRows) { try { setViews(buildViews(viewRows, network.fields)) } catch { /* mantém as views atuais */ } }
      }
    })()
    return () => { alive = false }
  }, [trackFormulas])
  const rememberView = (id: string | null) => {
    try { if (id) window.localStorage.setItem(LAST_VIEW_KEY, id); else window.localStorage.removeItem(LAST_VIEW_KEY) } catch { /* sem armazenamento local: abre pela view padrão */ }
  }
  const selectView = useCallback((id: string) => {
    if (commandLocked) return
    const selected = views.find((view) => view.id === id) ?? null
    setActiveView(selected)
    setOpenQuery(null)
    rememberView(selected?.id ?? null)
    if (selected?.nativeOnly) setViewDefinition(selected.definition)
    else applyViewDefinition(selected?.definition ?? defaultViewDefinition(moneyFields.map((field) => field.key)))
    setSelectedRowIds([])
    setSelectedCell(null)
    setContextCell(null)
    setColumnFilters({})
    setSearch('')
    if (dataSource === 'mock') return
    setRows([])
    setNextLink(null)
    setLoading(true)
    loadedPagesRef.current = 1
  }, [applyViewDefinition, commandLocked, dataSource, views])
  const saveCurrentView = useCallback(async (name: string, kind: 'personal' | 'public', overwrite: boolean, definition: ViewDefinition) => {
    if (!catalog.length || !definition.columns.length) throw new Error('Escolha ao menos uma coluna disponível.')
    const saved = dataSource === 'mock'
      ? saveMockView(name, kind, definition, overwrite ? activeView ?? undefined : undefined)
      : await saveView(name, kind, definition, catalog, overwrite ? activeView ?? undefined : undefined, activeView?.nativeOnly && activeView.nativeFiltersEditable && activeView.sourceFetchXml ? buildNativeCompositionQuery(activeView.sourceFetchXml, definition, catalog, '', true) : undefined)
    const all = dataSource === 'mock' ? loadMockViews() : await loadViews(catalog)
    setViews(all)
    const selected = all.find((view) => view.id === saved.id) ?? saved
    setActiveView(selected)
    setOpenQuery(null)
    rememberView(selected.id)
    setViewDefinition(selected.definition)
    setSelectedRowIds([])
    setSelectedCell(null)
    if (dataSource === 'mock') return
    setRows([])
    setNextLink(null)
    setLoading(true)
    loadedPagesRef.current = 1
  }, [activeView, catalog, dataSource])
  const deleteCurrentView = useCallback(async () => {
    if (!activeView) return
    if (dataSource === 'mock') deleteMockView(activeView)
    else await deleteView(activeView)
    setViews(dataSource === 'mock' ? loadMockViews() : await loadViews(catalog))
    setActiveView(null)
    setOpenQuery(null)
    rememberView(null)
    setViewDefinition(defaultViewDefinition(moneyFields.map((field) => field.key)))
    setSelectedRowIds([])
    setSelectedCell(null)
    if (dataSource === 'mock') return
    setRows([])
    setNextLink(null)
    setLoading(true)
    loadedPagesRef.current = 1
  }, [activeView, catalog, dataSource])
  const footerLabel = selectedCount === 1 ? 'Total de 1 linha selecionada' : `Total de ${selectedCount} linhas selecionadas`
  const selectedTotals = useMemo(() => sumSelectedCompositions(selectedVisibleRows), [selectedVisibleRows])
  const footerCells = selectedCount ? [
    null, null, null, null,
    ...moneyFields.map(({ key }) => moneyFormat(selectedTotals[key])),
  ] : undefined
  const handleSelectionChange = useCallback((ids: string[]) => setSelectedRowIds(ids), [])
  const refreshData = useCallback(async ({ background = false, showNotice = !background, preserveFieldDrafts = background }: RefreshOptions = {}) => {
    // A releitura automática tem trava própria: `refreshingRef` bloqueia edição e "carregar mais", e ela não pode travar a tela.
    const busyRef = background ? backgroundRefreshingRef : refreshingRef
    if (queryError || refreshingRef.current || busyRef.current || hasPendingEdits()) return false
    busyRef.current = true
    if (!background) {
      setCommandPhase('refresh')
      setCommandProgress('Buscando alterações nos dados…')
      setNotice(null)
    }
    const region = tableRegionRef.current
    const left = region?.scrollLeft ?? 0
    const top = region?.scrollTop ?? 0
    const request = viewRequestRef.current
    const rowsAtStart = rowsRef.current
    const writesAtStart = localWritesRef.current
    // Na releitura automática, gravação, comando, "carregar mais" ou atualização manual iniciados durante a busca a encerram; tenta no próximo ciclo.
    // `localWritesRef` cobre a gravação que termina antes de a grade renderizar de novo (quando `rowsRef` ainda não mudou).
    const stale = () => request !== viewRequestRef.current || (background && (rowsRef.current !== rowsAtStart || localWritesRef.current !== writesAtStart || commandLockedRef.current || refreshingRef.current || loadingMoreRef.current))
    try {
      let page = await loadCompositions(undefined, queryView)
      if (stale()) return false
      const loadedPages = [page]
      const records = [...page.records]
      const loadedIds = new Set(records.map((record) => record.id))
      let pagesLoaded = 1
      let repeated = false
      for (let index = 1; index < loadedPagesRef.current && page.nextLink; index++) {
        page = await loadCompositions(page.nextLink, queryView)
        if (stale()) return false
        const fresh = freshPageRecords(loadedIds, page)
        if (!fresh) { repeated = true; break }
        loadedPages.push(page)
        records.push(...fresh)
        pagesLoaded++
      }
      if (preserveFieldDrafts && hasPendingEdits()) return false
      loadedPagesRef.current = pagesLoaded
      loadedIdsRef.current = loadedIds
      saveQueueRef.current?.reset()
      setRows(records)
      setDataSource(page.source)
      setNextLink(repeated ? null : page.nextLink)
      setCountTick((tick) => tick + 1)
      setConnectionError(repeated ? REPEATED_PAGE_MESSAGE : null)
      backgroundFailedRef.current = false
      setFormulasError(null)
      loadedPages.forEach((loaded) => trackFormulas(loaded.records, loaded.formulas, request))
      // Na releitura automática a pessoa pode ter rolado durante a busca; voltar à posição antiga daria um salto.
      if (!background) requestAnimationFrame(() => { if (region) { region.scrollLeft = left; region.scrollTop = top } })
      if (showNotice && !repeated) setNotice({ tone: 'success', title: 'Dados atualizados', detail: `${records.length} ${records.length === 1 ? 'composição carregada' : 'composições carregadas'}. Busca, seleção e posição mantidas.` })
      return true
    } catch (error) {
      // Sem rede, a releitura automática falharia a cada 30 s; registra só a primeira falha de cada sequência.
      if (!background || !backgroundFailedRef.current) void logAppError(error, { action: background ? 'atualizar-composicoes-automatico' : 'atualizar-composicoes', phase: 'load', component: 'ComposicaoPage' })
      if (background) backgroundFailedRef.current = true
      if (request === viewRequestRef.current && showNotice) setNotice({ tone: 'error', title: 'Não foi possível atualizar', detail: errorMessage(error, 'Os dados atuais foram mantidos.'), retryRefresh: true })
      return false
    }
    finally {
      busyRef.current = false
      if (!background) { setCommandPhase(null); setCommandProgress('') }
    }
  }, [hasPendingEdits, queryError, queryView, trackFormulas])

  useEffect(() => {
    if (dataSource !== 'dataverse') return
    const timer = window.setInterval(() => {
      if (document.hidden || commandLockedRef.current) return
      void refreshData({ background: true })
    }, AUTO_REFRESH_INTERVAL)
    return () => window.clearInterval(timer)
  }, [dataSource, refreshData])

  useEffect(() => {
    if (!relatedRefreshPending) return
    let busy = false
    let current = true
    const timer = window.setInterval(() => {
      if (busy || refreshingRef.current || hasPendingEdits()) return
      busy = true
      void refreshData({ showNotice: false, preserveFieldDrafts: true }).then((updated) => {
        if (!current) return
        if (!updated && hasPendingEdits()) { busy = false; return }
        setRelatedRefreshPending(false)
        if (!updated) setNotice({ tone: 'warning', title: 'Campo salvo', detail: 'Não foi possível atualizar os campos relacionados. Atualize a grade para conferir os dados.', retryRefresh: true })
      })
    }, 250)
    return () => { current = false; window.clearInterval(timer) }
  }, [hasPendingEdits, relatedRefreshPending, refreshData])

  // Aviso com ação (Tentar novamente) fica na própria tela; os simples vão para o toast do shell.
  useEffect(() => {
    if (!notice || notice.retryRefresh) return
    toast({ tone: notice.tone === 'error' ? 'danger' : notice.tone, message: notice.detail ? `${notice.title}. ${notice.detail}` : notice.title, duration: notice.tone === 'success' ? 5000 : 0 })
  }, [notice, toast])
  useEffect(() => {
    if (formulasError) toast({ tone: 'warning', message: `Fórmulas indisponíveis: ${formulasError} A edição fica bloqueada até a próxima atualização.`, duration: 0 })
  }, [formulasError, toast])

  const closeAudit = useCallback(() => setAuditIds(null), [])
  const { pendingConfirm, generateOp, excludeSelected, confirmPending, closeConfirm } = useCompositionCommands({
    dataSource, selectedIds, selectedVisibleRows, commandLocked, refreshData,
    setCommandPhase, setCommandProgress, setNotice, setRows, setSelectedRowIds, setSelectedCell,
  })

  useEffect(() => {
    if (!catalogReady) return
    // A primeira página da abertura já veio com a consulta que vale: a metadata chegando não a refaz.
    if (skipLoadRef.current) { skipLoadRef.current = false; return }
    let active = true
    const request = ++viewRequestRef.current
    setFormulasError(null)
    setLoading(true)
    loadingMoreRef.current = false
    setLoadingMore(false)
    setConnectionError(null)
    setSelectedRowIds([])
    setSelectedCell(null)
    setRows([])
    setNextLink(null)
    loadedPagesRef.current = 1
    if (queryError) {
      setConnectionError(queryError)
      setLoading(false)
      return
    }
    loadCompositions(undefined, queryView).then(({ records, source, nextLink: nextPage, formulas }) => {
      if (!active) return
      saveQueueRef.current?.reset()
      loadedIdsRef.current = new Set(records.map((record) => record.id))
      setRows(records)
      setDataSource(source)
      setNextLink(nextPage)
      loadedPagesRef.current = 1
      setConnectionError(null)
      trackFormulas(records, formulas, request)
    }).catch((error: unknown) => {
      if (!active) return
      void logAppError(error, { action: 'carregar-composicoes', phase: 'load', component: 'ComposicaoPage' })
      setRows([])
      setConnectionError(errorMessage(error, 'Falha ao carregar dados do Dataverse.'))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [catalogReady, queryError, queryView, trackFormulas])

  const loadMore = useCallback(async () => {
    if (!nextLink || loadingMoreRef.current || refreshingRef.current) return
    const request = viewRequestRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const { records, nextLink: nextPage, formulas } = await loadCompositions(nextLink, queryView)
      if (request !== viewRequestRef.current) return
      const fresh = freshPageRecords(loadedIdsRef.current, { records, nextLink: nextPage })
      setNextLink(fresh ? nextPage : null)
      setConnectionError(fresh ? null : REPEATED_PAGE_MESSAGE)
      if (!fresh) return
      setRows((current) => [...current, ...fresh])
      loadedPagesRef.current += 1
      trackFormulas(fresh, formulas, request)
    } catch (error: unknown) {
      void logAppError(error, { action: 'carregar-mais-composicoes', phase: 'load', component: 'ComposicaoPage' })
      if (request === viewRequestRef.current) setConnectionError(errorMessage(error, 'Falha ao carregar mais dados do Dataverse.'))
    } finally {
      if (request === viewRequestRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [nextLink, queryView, trackFormulas])

  useEffect(() => {
    const target = loadMoreRef.current
    // A sentinela só existe depois que o skeleton sai; por isso o efeito também depende de loading.
    const root = tableRegionRef.current
    if (!target || !root || !nextLink || connectionError) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { root, rootMargin: '200% 0px' })
    observer.observe(target)
    // Prevê o scroll: quanto mais rápido o usuário rola, mais cedo a próxima página é pedida.
    let lastTop = root.scrollTop
    let lastTime = performance.now()
    let speed = 0
    const onScroll = () => {
      const now = performance.now()
      const elapsed = Math.max(now - lastTime, 1)
      const delta = root.scrollTop - lastTop
      speed = delta > 0 ? Math.max(delta / elapsed, speed * 0.6) : 0
      lastTop = root.scrollTop
      lastTime = now
      const remaining = root.scrollHeight - root.scrollTop - root.clientHeight
      if (remaining < Math.max(root.clientHeight * 2, speed * 2500)) void loadMore()
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => { observer.disconnect(); root.removeEventListener('scroll', onScroll) }
  }, [connectionError, loading, loadMore, nextLink])

  // O IntersectionObserver só avisa em transições: se a sentinela continuar visível após uma página
  // (ou após um Atualizar que bloqueou a carga), encadeia a próxima sem exigir novo scroll.
  useEffect(() => {
    const root = tableRegionRef.current
    if (!root || loading || loadingMore || !nextLink || connectionError || commandPhase) return
    const remaining = root.scrollHeight - root.scrollTop - root.clientHeight
    if (remaining < root.clientHeight * 2) void loadMore()
  }, [commandPhase, connectionError, loading, loadMore, loadingMore, nextLink, rows.length])

  useEffect(() => {
    if (!editing) return
    const target = editorTargetRef.current === 'bar' ? formulaBarRef.current : inputRef.current
    if (!target || document.activeElement === target) return
    target.focus()
    target.setSelectionRange(target.value.length, target.value.length)
  }, [editing?.rowId, editing?.field])

  const positionBarSuggestions = useCallback((cursor: number) => {
    const input = formulaBarRef.current
    const bar = formulaBarContainerRef.current
    if (!input || !bar) return
    const style = window.getComputedStyle(input)
    const measure = document.createElement('span')
    measure.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none'
    measure.style.fontFamily = style.fontFamily
    measure.style.fontSize = style.fontSize
    measure.style.fontWeight = style.fontWeight
    measure.style.letterSpacing = style.letterSpacing
    measure.textContent = input.value.slice(0, cursor)
    document.body.appendChild(measure)
    const textWidth = measure.getBoundingClientRect().width || measure.textContent.length * (Number.parseFloat(style.fontSize) || 11) * 0.6
    measure.remove()
    const inputLeft = input.getBoundingClientRect().left - bar.getBoundingClientRect().left
    const caretLeft = inputLeft + (Number.parseFloat(style.paddingLeft) || 0) + textWidth - input.scrollLeft
    const popupWidth = Math.min(280, Math.max(0, bar.clientWidth - inputLeft - 12))
    setBarSuggestionLeft(Math.round(Math.max(inputLeft, Math.min(caretLeft, bar.clientWidth - popupWidth - 8))))
  }, [])

  useLayoutEffect(() => {
    if (editorTarget !== 'bar') return
    positionBarSuggestions(editorCaret)
  }, [editing?.value, editorCaret, editorTarget, positionBarSuggestions])

  useEffect(() => {
    const onResize = () => { if (editorTarget === 'bar') positionBarSuggestions(editorCaret) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [editorCaret, editorTarget, positionBarSuggestions])

  useEffect(() => () => {
    saveFeedbackTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current)
  }, [])

  const setCellFeedback = useCallback((feedbackKey: string, feedback: SaveFeedback, requestId: number, duration?: number) => {
    if (requestId !== saveRequestIdsRef.current.get(feedbackKey)) return
    const previousTimer = saveFeedbackTimersRef.current.get(feedbackKey)
    if (previousTimer !== undefined) window.clearTimeout(previousTimer)
    setSaveFeedback((current) => ({ ...current, [feedbackKey]: feedback }))
    if (!duration) { saveFeedbackTimersRef.current.delete(feedbackKey); return }
    const timer = window.setTimeout(() => {
      if (requestId !== saveRequestIdsRef.current.get(feedbackKey)) return
      setSaveFeedback((current) => current[feedbackKey]?.status === 'saved' ? {
        ...current,
        [feedbackKey]: { ...current[feedbackKey], status: 'saved-leaving' },
      } : current)
      const exitTimer = window.setTimeout(() => {
        if (requestId === saveRequestIdsRef.current.get(feedbackKey)) {
          setSaveFeedback((current) => {
            const next = { ...current }
            delete next[feedbackKey]
            return next
          })
        }
        saveFeedbackTimersRef.current.delete(feedbackKey)
      }, SAVE_FEEDBACK_FADE_DURATION)
      saveFeedbackTimersRef.current.set(feedbackKey, exitTimer)
    }, duration)
    saveFeedbackTimersRef.current.set(feedbackKey, timer)
  }, [])

  const clearCellError = useCallback((rowId: string, field: MoneyField) => {
    const feedbackKey = `${rowId}:${field}`
    if (saveFeedbackRef.current[feedbackKey]?.status !== 'error') return
    setSaveFeedback((current) => {
      if (current[feedbackKey]?.status !== 'error') return current
      const next = { ...current }
      delete next[feedbackKey]
      return next
    })
  }, [])

  const prepareInput = useCallback((row: Composition, field: MoneyField, draft: string): CellInput => {
    const formulaExpression = formulaExpressionFromInput(draft)
    if (formulaExpression) {
      const analysis = analyzeFormula(formulaExpression)
      const formulas = Object.fromEntries(Object.entries(row.formulas).map(([key, formula]) => [key, formula?.expression])) as Partial<Record<MoneyField, string>>
      formulas[field] = analysis.expression
      evaluateFormulaSet(formulas, row.values)
      return { kind: 'formula', expression: analysis.expression }
    }
    const value = parseMoney(draft)
    if (value === null) throw new Error('Informe um valor ou comece a fórmula com =, como =100+50.')
    return { kind: 'literal', value }
  }, [])

  const persistCellInput = useCallback((row: Composition, field: MoneyField, draft: string, input: CellInput) => {
    const feedbackKey = `${row.id}:${field}`
    const fingerprint = JSON.stringify(input)
    const previousSave = inFlightSavesRef.current.get(feedbackKey)
    if (previousSave?.value === fingerprint) return previousSave.promise
    const requestId = (saveRequestIdsRef.current.get(feedbackKey) ?? 0) + 1
    saveRequestIdsRef.current.set(feedbackKey, requestId)
    localWritesRef.current++
    setOptimisticInputs((current) => ({ ...current, [feedbackKey]: { rowId: row.id, field, input, requestId } }))
    setCellFeedback(feedbackKey, { rowId: row.id, field, status: 'saving' }, requestId)
    const savePromise = (async () => {
      try {
        const updated = await saveQueueRef.current!.enqueue(row, field, input, dataSource ?? 'dataverse')
        setRows((current) => current.map((item) => {
          if (item.id !== row.id) return item
          return { ...item, values: withCalculatedTotals({ ...item.values, ...updated.values }), formulas: updated.formulas, rowVersion: updated.rowVersion }
        }))
        setOptimisticInputs((current) => {
          if (current[feedbackKey]?.requestId !== requestId) return current
          const next = { ...current }
          delete next[feedbackKey]
          return next
        })
        if (requestId !== saveRequestIdsRef.current.get(feedbackKey)) return
        setConnectionError(null)
        setCellFeedback(feedbackKey, { rowId: row.id, field, status: 'saved' }, requestId, SAVE_FEEDBACK_DURATION)
      } catch (error) {
        if (requestId !== saveRequestIdsRef.current.get(feedbackKey)) return
        setOptimisticInputs((current) => {
          if (current[feedbackKey]?.requestId !== requestId) return current
          const next = { ...current }
          delete next[feedbackKey]
          return next
        })
        const message = formulaErrorMessage(error) || errorMessage(error, 'Não foi possível salvar no Dataverse.')
        // Erro de fórmula é validação do usuário; só falha de gravação vai para o log.
        if (!(error instanceof FormulaError)) void logAppError(error, { action: 'salvar-celula', phase: 'submit', component: 'ComposicaoPage', detailId: row.id, detailType: 'cr40f_composicaodeprecos' })
        if (dataSource === 'dataverse' && message.includes('CONCURRENCY_CONFLICT')) {
          try {
            const refreshedRow = await loadCompositionById(row.id)
            if (refreshedRow) {
              const latestRow = { ...refreshedRow, viewFields: { ...row.viewFields, ...refreshedRow.viewFields } }
              saveQueueRef.current?.sync(latestRow)
              setRows((current) => current.map((item) => item.id === row.id ? latestRow : item))
            }
          } catch { /* Mantém o rascunho e a linha atual se a releitura também falhar. */ }
        }
        setCellFeedback(feedbackKey, { rowId: row.id, field, status: 'error', message, draft }, requestId)
        setNotice({ tone: 'error', title: 'Valor não salvo', detail: message })
      } finally {
        if (inFlightSavesRef.current.get(feedbackKey)?.requestId === requestId) inFlightSavesRef.current.delete(feedbackKey)
      }
    })()
    inFlightSavesRef.current.set(feedbackKey, { value: fingerprint, requestId, promise: savePromise })
    return savePromise
  }, [dataSource, setCellFeedback])

  const commitEdit = useCallback((cancel = false, leaveOnError = false) => {
    const editingCell = editingRef.current
    if (!editingCell) return true
    const finishEditingCell = () => {
      if (editingRef.current?.rowId === editingCell.rowId && editingRef.current.field === editingCell.field) {
        editingRef.current = null
        setEditing(null)
      }
    }
    if (cancel) { finishEditingCell(); return true }
    if (leaveOnError && (editingCell.value.trim() === '' || editingCell.value.trim() === '=')) { finishEditingCell(); return true }
    const row = rowsRef.current.find((current) => current.id === editingCell.rowId)
    if (!row) { finishEditingCell(); return true }
    try {
      const input = prepareInput(row, editingCell.field, editingCell.value)
      const existingFormula = row.formulas[editingCell.field]?.expression
      const unchanged = input.kind === 'formula'
        ? existingFormula === input.expression
        : !existingFormula && row.values[editingCell.field] === input.value
      if (!unchanged || inFlightSavesRef.current.has(`${row.id}:${editingCell.field}`)) void persistCellInput(row, editingCell.field, editingCell.value, input)
      finishEditingCell()
      return true
    } catch (error) {
      const feedbackKey = `${editingCell.rowId}:${editingCell.field}`
      const requestId = (saveRequestIdsRef.current.get(feedbackKey) ?? 0) + 1
      saveRequestIdsRef.current.set(feedbackKey, requestId)
      setCellFeedback(feedbackKey, { rowId: editingCell.rowId, field: editingCell.field, status: 'error', message: formulaErrorMessage(error), draft: editingCell.value }, requestId)
      if (leaveOnError) { finishEditingCell(); return true }
      requestAnimationFrame(() => (editorTargetRef.current === 'bar' ? formulaBarRef.current : inputRef.current)?.focus())
      return false
    }
  }, [persistCellInput, prepareInput, setCellFeedback])

  const focusCellAfterCommit = useCallback((rowId: string, field: MoneyField) => {
    requestAnimationFrame(() => {
      if (editingRef.current) return
      document.querySelector<HTMLElement>(`[data-grid-cell="${rowId}:${field}"]`)?.focus()
    })
  }, [])

  const focusVerticalCell = useCallback((rowId: string, field: MoneyField, direction: 1 | -1) => {
    const records = visibleRowsRef.current
    const index = records.findIndex((row) => row.id === rowId)
    const target = records[index + direction]
    if (target) {
      setSelectedCell({ rowId: target.id, field })
      focusCellAfterCommit(target.id, field)
    } else focusCellAfterCommit(rowId, field)
  }, [focusCellAfterCommit])

  const focusNextEditableCell = useCallback((rowId: string, field: MoneyField, reverse = false) => {
    const origin = document.querySelector<HTMLElement>(`[data-grid-cell="${rowId}:${field}"]`)
    const adjacent = adjacentGridCell(origin, 'Tab', reverse)
    if (adjacent) { requestAnimationFrame(() => adjacent.focus()); return true }
    const next = nextEditableCell(visibleRowsRef.current, viewColumnsRef.current, rowId, field, reverse)
    if (!next) return false
    setSelectedCell({ rowId: next.row.id, field: next.field })
    focusCellAfterCommit(next.row.id, next.field)
    return true
  }, [focusCellAfterCommit])

  const beginEdit = useCallback((row: Composition, field: MoneyField, target: 'cell' | 'bar' = 'cell', initialValue?: string) => {
    setSelectedCell({ rowId: row.id, field })
    if (!isWritableMoneyField(field)) return
    const blocked = () => toast({ tone: 'warning', message: `Fórmulas indisponíveis: ${formulasErrorRef.current} A edição fica bloqueada até a próxima atualização.`, duration: 0 })
    if (formulasErrorRef.current) { blocked(); return }
    const start = (source: Composition) => {
      editorTargetRef.current = target
      setEditorTarget(target)
      const previousFeedback = saveFeedbackRef.current[`${source.id}:${field}`]
      const persistedValue = source.formulas[field] ? friendlyExpression(source.formulas[field]!.expression) : moneyDraft(source.values[field])
      const nextEditing = { rowId: source.id, field, value: initialValue ?? (previousFeedback?.status === 'error' && previousFeedback.draft !== undefined ? previousFeedback.draft : persistedValue) }
      editingRef.current = nextEditing
      setEditing(nextEditing)
      setEditorCaret(nextEditing.value.length)
      setSuggestionIndex(0)
      setSuggestionsDismissed(false)
    }
    // Editar antes de as fórmulas da página chegarem gravaria o valor por cima de uma fórmula: espera as fórmulas desta linha.
    const pending = formulasPendingRef.current.get(row.id)
    if (!pending) { start(row); return }
    void pending.then(() => {
      if (formulasErrorRef.current) { blocked(); return }
      const latest = rowsRef.current.find((candidate) => candidate.id === row.id)
      if (latest) start(latest)
    })
  }, [toast])

  const insertFormulaReference = useCallback((rowId: string, field: MoneyField) => {
    const active = editingRef.current
    if (!active || active.rowId !== rowId || active.field === field || !active.value.trimStart().startsWith('=')) return false
    const label = moneyFields.find(({ key }) => key === field)?.label ?? field
    const input = editorTargetRef.current === 'bar' ? formulaBarRef.current : inputRef.current
    const start = input?.selectionStart ?? active.value.length
    const end = input?.selectionEnd ?? start
    const query = referenceQuery(active.value, start)
    const insertion = insertReferenceInFormula(active.value, label, query?.start ?? start, query && active.value[end] === ']' ? end + 1 : end)
    const next = { ...active, value: insertion.value }
    clearCellError(active.rowId, active.field)
    editingRef.current = next
    setEditing(next)
    requestAnimationFrame(() => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current)
        blurTimerRef.current = null
      }
      const activeInput = editorTargetRef.current === 'bar' ? formulaBarRef.current : inputRef.current
      activeInput?.focus()
      activeInput?.setSelectionRange(insertion.cursor, insertion.cursor)
    })
    return true
  }, [clearCellError])

  const pendingReference = editing && !suggestionsDismissed ? referenceQuery(editing.value, editorCaret) : null
  const referenceSuggestions = pendingReference
    ? moneyFields
      .filter(({ key, label }) => key !== editing?.field && searchLabel(label).includes(searchLabel(pendingReference.query.trim())))
      .sort((left, right) => Number(searchLabel(right.label).startsWith(searchLabel(pendingReference.query.trim()))) - Number(searchLabel(left.label).startsWith(searchLabel(pendingReference.query.trim()))))
      .slice(0, 8)
    : []

  const chooseReferenceSuggestion = (field: MoneyField) => {
    const active = editingRef.current
    const query = active && referenceQuery(active.value, editorCaret)
    if (!active || !query) return
    const label = moneyFields.find(({ key }) => key === field)?.label ?? field
    const end = active.value[editorCaret] === ']' ? editorCaret + 1 : editorCaret
    const insertion = insertReferenceInFormula(active.value, label, query.start, end)
    const next = { ...active, value: insertion.value }
    clearCellError(active.rowId, active.field)
    editingRef.current = next
    setEditing(next)
    setEditorCaret(insertion.cursor)
    setSuggestionsDismissed(true)
    requestAnimationFrame(() => {
      const input = editorTargetRef.current === 'bar' ? formulaBarRef.current : inputRef.current
      input?.focus()
      input?.setSelectionRange(insertion.cursor, insertion.cursor)
    })
  }

  const handleSuggestionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!referenceSuggestions.length) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      setSuggestionIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + referenceSuggestions.length) % referenceSuggestions.length)
      return true
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      chooseReferenceSuggestion(referenceSuggestions[Math.min(suggestionIndex, referenceSuggestions.length - 1)].key)
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setSuggestionsDismissed(true)
      return true
    }
    return false
  }

  const suggestionList = (target: 'cell' | 'bar') => editorTarget === target && referenceSuggestions.length > 0 ? (
    <div id={`formula-suggestions-${target}`} className="formula-suggestions" role="listbox" aria-label="Campos para fórmula" style={target === 'bar' ? { left: barSuggestionLeft } : undefined}>
      {referenceSuggestions.map(({ key, label }, index) => (
        <button id={`formula-suggestion-${target}-${key}`} key={key} type="button" role="option" aria-selected={index === suggestionIndex} onPointerDown={(event) => {
          event.preventDefault()
          chooseReferenceSuggestion(key)
        }}>{label}</button>
      ))}
    </div>
  ) : null
  const suggestionListRef = useRef(suggestionList)
  const suggestionKeyDownRef = useRef(handleSuggestionKeyDown)
  suggestionListRef.current = suggestionList
  suggestionKeyDownRef.current = handleSuggestionKeyDown

  const activeFormulaRowId = editing?.rowId ?? selectedCell?.rowId
  const activeFormulaReferences = useMemo(() => {
    const selectedRow = selectedCell ? projectedRows.find((row) => row.id === selectedCell.rowId) : undefined
    const source = editing
      ? formulaExpressionFromInput(editing.value)
      : selectedCell && selectedRow?.formulas[selectedCell.field]?.expression
    if (!source) return [] as MoneyField[]
    try { return [...analyzeFormula(source).dependencies] } catch { return [] as MoneyField[] }
  }, [editing?.value, rows, selectedCell])
  const activeFormulaRowIdRef = useRef(activeFormulaRowId)
  const activeFormulaReferencesRef = useRef(activeFormulaReferences)
  activeFormulaRowIdRef.current = activeFormulaRowId
  activeFormulaReferencesRef.current = activeFormulaReferences

  // Only rows whose external editing/selection state changed need new cell renders.
  const rowRenderKeys = useMemo(() => {
    const states = new Map<string, unknown[]>()
    const add = (rowId: string, state: unknown) => {
      const values = states.get(rowId) ?? []
      values.push(state)
      states.set(rowId, values)
    }
    if (selectedCell) add(selectedCell.rowId, selectedCell)
    if (editing) add(editing.rowId, [editing, editorTarget, editorCaret, suggestionIndex, suggestionsDismissed])
    if (activeFormulaRowId) add(activeFormulaRowId, activeFormulaReferences)
    Object.values(saveFeedback).forEach((feedback) => add(feedback.rowId, feedback))
    return new Map([...states].map(([id, state]) => [id, JSON.stringify(state)]))
  }, [selectedCell, editing, editorTarget, editorCaret, suggestionIndex, suggestionsDismissed, activeFormulaRowId, activeFormulaReferences, saveFeedback])

  const activeColumnFilters = (id: string): ActiveColumnFilter[] => [
    ...viewDefinition.filters.flatMap((filter, index) => filter.id === id ? [{ filter, index }] : []),
    ...(viewDefinition.filterGroups ?? []).flatMap((group, groupIndex) => group.filters.flatMap((filter, index) => filter.id === id ? [{ filter, index, groupId: group.id, groupLabel: `Grupo ${groupIndex + 1}` }] : [])),
  ]

  const columnHeaderProps = (id: string) => {
    const withoutColumn = (filters: ViewFilter[]) => filters.filter((filter) => filter.id !== id)
    return {
      filters: activeColumnFilters(id),
      sort: viewDefinition.sort[0]?.id === id ? viewDefinition.sort[0] : undefined,
      canHide: viewDefinition.columns.length > 1,
      pinned: Boolean(viewDefinition.columns.find((item) => item.id === id)?.pinned),
      onBeforeOpen: () => { keepEditorDuringMenuRef.current = true; window.setTimeout(() => { keepEditorDuringMenuRef.current = false }, 0) },
      onClose: () => { if (editingRef.current) commitEdit(false, true) },
      onApply: (filters: ViewFilter[]) => setViewDefinition((current) => ({ ...current, filters: [...withoutColumn(current.filters), ...filters] })),
      onClear: () => setViewDefinition((current) => ({ ...current, filters: withoutColumn(current.filters), filterGroups: current.filterGroups?.map((group) => ({ ...group, filters: withoutColumn(group.filters) })) })),
      onSort: (descending: boolean) => setViewDefinition((current) => ({ ...current, sort: [{ id, descending }] })),
      onHide: () => setViewDefinition((current) => ({ ...current, columns: current.columns.filter((item) => item.id !== id), sort: current.sort.filter((item) => item.id !== id) })),
      onTogglePin: () => setViewDefinition((current) => {
        const columns = current.columns.map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item)
        return { ...current, columns: [...columns.filter((item) => item.pinned), ...columns.filter((item) => !item.pinned)] }
      }),
    }
  }
  // Os cabeçalhos ficam em useMemo sem viewDefinition.columns nas dependências: lê sempre a versão atual (fixar/ocultar).
  /** Nome da célula do valor no resultado: na consulta da abertura é o da própria view; depois, o da consulta resolvida. */
  const valueKeyFor = useCallback((id: string) => openActive ? openQuery?.keys.get(id) ?? id : viewValueKey(id, viewShape, catalog), [catalog, openActive, openQuery?.keys, viewShape])
  const columnHeaderPropsRef = useRef(columnHeaderProps)
  columnHeaderPropsRef.current = columnHeaderProps

  const columnFilterLabels = useMemo(() => createColumnFilterLabels(rows), [rows])
  const columnFilterLabelsRef = useRef(columnFilterLabels)
  columnFilterLabelsRef.current = columnFilterLabels

  const columns = useMemo(() => {
    const sortableHeader = (id: string, label: string) => () => {
      const referenceIndex = activeFormulaReferencesRef.current.indexOf(id as MoneyField)
      const referenceTone = referenceIndex >= 0 ? ` formula-reference--${referenceIndex % 4 + 1}` : ''
      const displayFilter = (value: string) => id === 'date'
        ? formatDepartureDate(value)
        : moneyFields.some((field) => field.key === id) ? moneyFormat(value) : value

      const catalogField = catalog.find((field) => field.id === id)
      return <ColumnHeader id={id} label={label} field={catalogField} type={catalogField?.type ?? (id === 'date' ? 'DateTime' : moneyFields.some((field) => field.key === id) ? 'Money' : 'String')} displayValue={displayFilter} referenceClass={referenceIndex >= 0 ? ` column-header--reference${referenceTone}` : ''} disabled={!catalogReady} {...columnHeaderPropsRef.current(id)} />
    }

    const staticColumns = [column.display({
      id: 'select',
      meta: { className: 'grid-select fixed-col fixed-col--select' },
      header: ({ table }) => <input type="checkbox" aria-label="Selecionar todas as composições" checked={table.getIsAllRowsSelected()} ref={(node) => { if (node) node.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected() }} onChange={table.getToggleAllRowsSelectedHandler()} />,
      cell: ({ row }) => <input type="checkbox" aria-label={`Selecionar ${row.original.client}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
    }), column.accessor((row) => row.client, {
      id: 'client', meta: { className: 'fixed-col fixed-col--client' }, header: sortableHeader('client', 'Cliente'),
      cell: ({ row }) => {
        const item = row.original
        const clientId = item.clientId
        return (
          <span className="grid-client">
            <span className={`grid-status ${item.status === 'Concluído' ? 'grid-status--done' : ''}`} />
            {clientId ? (
              <span className="lookup-preview">
                <button type="button" className="lookup-link" onClick={() => {
                  const navigation = getXrmHost()?.Navigation
                  if (navigation) void navigation.openForm({ entityName: 'cr40f_clientes1', entityId: clientId })
                }} aria-label={`Abrir cliente ${item.client}`}>
                  {item.client}
                </button>
                <span className="lookup-preview__card" role="tooltip">
                  <strong>{item.client}</strong>
                  {item.clientRegistration && <span className="lookup-preview__detail"><span>Registro</span><span>{item.clientRegistration}</span></span>}
                  {item.clientAddress && <span className="lookup-preview__detail"><span>Endereço</span><span>{item.clientAddress}</span></span>}
                </span>
              </span>
            ) : item.client}
          </span>
        )
      },
    }), column.accessor((row) => row.route, {
      id: 'route', meta: { className: 'fixed-col fixed-col--route' }, header: sortableHeader('route', 'Trajeto'),
      cell: ({ row }) => {
        const item = row.original
        const serviceId = item.serviceId
        return serviceId ? (
          <span className="lookup-preview">
            <button type="button" className="lookup-link grid-route" onClick={() => { void openGridRecord('cr40f_reservadeveculos', serviceId) }} aria-label={`Abrir serviço relacionado: ${item.route}`}>
              {item.route}
            </button>
            <span className="lookup-preview__card" role="tooltip">
              <strong>Serviço relacionado</strong>
              <span>{item.route}</span>
              <span>Cliente: {item.client}</span>
              {item.departureAt && <span>Saída: {formatDepartureDate(item.departureAt)}</span>}
              {item.serviceStatus && <span>Status: {item.serviceStatus}</span>}
              {item.serviceType && <span>Tipo: {item.serviceType}</span>}
              {item.vehicleType && <span>Veículo: {item.vehicleType}</span>}
              {item.passengers.length > 0 && <span>Passageiros: {item.passengers.join(', ')}</span>}
            </span>
          </span>
        ) : <span className="grid-route" title={item.route}>{item.route}</span>
      },
    }), column.accessor((row) => row.departureAt, {
      id: 'date', meta: { className: 'fixed-col fixed-col--date' }, header: sortableHeader('date', 'Data'),
      cell: ({ row }) => formatDepartureDate(row.original.departureAt),
    })]

    const priceColumns = moneyFields.map(({ key, label }) => column.accessor((row) => row.values[key], {
      id: key,
      meta: { className: `money-column ${key === 'new_valortotal' ? 'money-column--total' : ''} ${!isWritableMoneyField(key) ? 'money-column--readonly' : ''}` },
      header: sortableHeader(key, label),
      cell: ({ row }) => {
        const item = row.original
        const currentEditing = editingRef.current
        const currentSelectedCell = selectedCellRef.current
        const currentSaveFeedback = saveFeedbackRef.current
        const isEditing = currentEditing?.rowId === item.id && currentEditing.field === key
        const isSelected = currentSelectedCell?.rowId === item.id && currentSelectedCell.field === key
        const referenceIndex = item.id === activeFormulaRowIdRef.current ? activeFormulaReferencesRef.current.indexOf(key) : -1
        const referenceTone = referenceIndex >= 0 ? ` money-cell--reference formula-reference--${referenceIndex % 4 + 1}` : ''
        const cellFeedback = currentSaveFeedback[`${item.id}:${key}`]
        const startCellEdit = () => beginEdit(item, key)
        const moveSelection = (direction: string, currentCell: HTMLElement) => {
          const targetCell = adjacentGridCell(currentCell, direction)
          const [targetRowId, targetFieldKey] = targetCell?.dataset.gridCell?.split(':') ?? []
          const targetRow = rowsRef.current.find((candidate) => candidate.id === targetRowId)
          const targetField = moneyFields.find((candidate) => candidate.key === targetFieldKey)
          if (targetCell && !targetField) { setSelectedCell(null); targetCell.focus(); return }
          if (!targetRow || !targetField) return

          if (isEditing) {
            if (commitEdit()) requestAnimationFrame(() => beginEdit(targetRow, targetField.key))
            return
          }
          setSelectedCell({ rowId: targetRow.id, field: targetField.key })
          requestAnimationFrame(() => targetCell?.focus())
        }
        return (
          <div
            className={`money-cell ${isSelected ? 'money-cell--selected' : ''} ${isEditing ? 'money-cell--editing' : ''} ${cellFeedback ? 'money-cell--has-feedback' : ''} ${!isWritableMoneyField(key) ? 'money-cell--readonly' : ''}${referenceTone}`}
            data-grid-cell={`${item.id}:${key}`}
            data-grid-editable={isWritableMoneyField(key)}
            tabIndex={0}
            onFocus={(event) => { if (event.target === event.currentTarget) setSelectedCell({ rowId: item.id, field: key }) }}
            aria-label={`${item.client}, ${label}: ${moneyFormat(item.values[key])}${item.formulas[key] ? ', possui fórmula' : ''}${!isWritableMoneyField(key) ? ', somente leitura' : ''}`}
            onPointerDown={(event) => {
              if (event.button !== 0 || isEditing) return
              event.preventDefault()
              if (insertFormulaReference(item.id, key)) return
              if (editingRef.current) {
                if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current)
                if (!commitEdit(false, true)) return
              }
              setSelectedCell({ rowId: item.id, field: key })
              event.currentTarget.focus()
            }}
            onDoubleClick={() => { if (isWritableMoneyField(key) && !editingRef.current) startCellEdit() }}
            onContextMenu={(event) => { event.preventDefault(); setSelectedCell({ rowId: item.id, field: key }); setContextCell({ x: event.clientX, y: event.clientY, rowId: item.id, field: key }) }}
            onKeyDown={(event) => {
              if (!isEditing && isWritableMoneyField(key) && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); beginEdit(item, key, 'cell', event.key); return }
              if (!isEditing && isWritableMoneyField(key) && event.key === 'F2') { event.preventDefault(); startCellEdit(); return }
              if (!isEditing && event.key === 'Enter') { event.preventDefault(); focusVerticalCell(item.id, key, event.shiftKey ? -1 : 1); return }
              if (!isEditing && event.key === 'Tab') { if (focusNextEditableCell(item.id, key, event.shiftKey)) event.preventDefault(); return }
              if (event.key.startsWith('Arrow')) { event.preventDefault(); moveSelection(event.key, event.currentTarget); return }
              if (!isEditing) return
            }}
            onCopy={(event) => {
              const text = item.formulas[key]?.expression ?? moneyDraft(item.values[key])
              clipboardRef.current = text
              event.clipboardData.setData('text/plain', text)
              event.preventDefault()
            }}
            onPaste={(event) => {
              if (isEditing || !isWritableMoneyField(key)) return
              const text = event.clipboardData.getData('text/plain') || clipboardRef.current || ''
              if (/\r|\n|\t/.test(text)) {
                event.preventDefault()
                const feedbackKey = `${item.id}:${key}`
                const requestId = (saveRequestIdsRef.current.get(feedbackKey) ?? 0) + 1
                saveRequestIdsRef.current.set(feedbackKey, requestId)
                setCellFeedback(feedbackKey, { rowId: item.id, field: key, status: 'error', message: 'Colagem múltipla não é suportada.', draft: text }, requestId)
                return
              }
              event.preventDefault()
              if (formulasErrorRef.current) { beginEdit(item, key); return }
              const paste = (source: Composition) => {
                try {
                  const input = prepareInput(source, key, text)
                  void persistCellInput(source, key, text, input)
                } catch (error) {
                  pasteFailed(error)
                }
              }
              // Colar sobre linha sem as fórmulas carregadas trocaria uma fórmula por valor: espera as fórmulas da linha.
              const pendingFormulas = formulasPendingRef.current.get(item.id)
              const pasteFailed = (error: unknown) => {
                const failedEdit = { rowId: item.id, field: key, value: text }
                editingRef.current = failedEdit
                setEditing(failedEdit)
                const feedbackKey = `${item.id}:${key}`
                const requestId = (saveRequestIdsRef.current.get(feedbackKey) ?? 0) + 1
                saveRequestIdsRef.current.set(feedbackKey, requestId)
                setCellFeedback(feedbackKey, { rowId: item.id, field: key, status: 'error', message: formulaErrorMessage(error), draft: text }, requestId)
              }
              if (pendingFormulas) void pendingFormulas.then(() => paste(rowsRef.current.find((candidate) => candidate.id === item.id) ?? item))
              else paste(item)
            }}
          >
            {cellFeedback ? (
              <span className={`cell-save-feedback cell-save-feedback--${cellFeedback.status}`} role="status" aria-live="polite" title={cellFeedback.message} aria-label={cellFeedback.message ?? (cellFeedback.status.startsWith('saved') ? 'Salvo' : cellFeedback.status === 'saving' ? 'Salvando' : 'Falha ao salvar')}>
                {cellFeedback.status === 'saving' ? <LoaderCircle aria-hidden="true" /> : null}
                {cellFeedback.status === 'saved' || cellFeedback.status === 'saved-leaving' ? <Check aria-hidden="true" /> : null}
                {cellFeedback.status === 'error' ? <X aria-hidden="true" /> : null}
              </span>
            ) : null}
            {isEditing ? (
              <input
                ref={inputRef}
                className={`money-editor ${cellFeedback ? 'money-editor--has-feedback' : ''}`}
                data-formula={editingRef.current?.value.trimStart().startsWith('=')}
                value={editingRef.current?.value ?? ''}
                aria-autocomplete="list"
                aria-expanded={editorTarget === 'cell' && referenceSuggestions.length > 0}
                aria-controls={editorTarget === 'cell' && referenceSuggestions.length > 0 ? 'formula-suggestions-cell' : undefined}
                aria-activedescendant={editorTarget === 'cell' && referenceSuggestions.length > 0 ? `formula-suggestion-cell-${referenceSuggestions[Math.min(suggestionIndex, referenceSuggestions.length - 1)].key}` : undefined}
                inputMode={editingRef.current?.value.trimStart().startsWith('=') ? 'text' : 'decimal'}
                aria-label={`Editar ${label}`}
                onFocus={() => { editorTargetRef.current = 'cell'; setEditorTarget('cell') }}
                onChange={(event) => {
                  const value = event.target.value
                  clearCellError(item.id, key)
                  const next = editingRef.current ? { ...editingRef.current, value } : null
                  editingRef.current = next
                  setEditing(next)
                  setEditorCaret(event.target.selectionStart ?? value.length)
                  setSuggestionIndex(0)
                  setSuggestionsDismissed(false)
                }}
                onSelect={(event) => setEditorCaret(event.currentTarget.selectionStart ?? 0)}
                onBlur={() => {
                  if (keepEditorDuringMenuRef.current) return
                  blurTimerRef.current = window.setTimeout(() => {
                    blurTimerRef.current = null
                    commitEdit(false, true)
                  }, 0)
                }}
                onKeyDown={(event) => {
                  if (suggestionKeyDownRef.current(event)) return
                  if (event.key.startsWith('Arrow')) { event.stopPropagation(); return }
                  if (event.key === 'Enter') { event.preventDefault(); if (commitEdit()) focusVerticalCell(item.id, key, event.shiftKey ? -1 : 1) }
                  else if (event.key === 'Escape') { event.preventDefault(); void commitEdit(true) }
                  else if (event.key === 'Tab') {
                    event.preventDefault()
                    if (commitEdit()) focusNextEditableCell(item.id, key, event.shiftKey)
                  }
                }}
              />
            ) : <span className="money-cell-value" data-cell-formula={item.formulas[key] ? friendlyExpression(item.formulas[key]!.expression) : undefined}>{item.formulas[key] ? <span className="formula-indicator" aria-hidden="true">ƒx</span> : null}{moneyFormat(item.values[key])}</span>}
            {isEditing ? suggestionListRef.current('cell') : null}
          </div>
        )
      },
    }))
    return column.columns([...staticColumns, ...priceColumns])
  }, [beginEdit, catalog, catalogReady, clearCellError, commitEdit, focusNextEditableCell, focusVerticalCell, insertFormulaReference, persistCellInput, prepareInput, setCellFeedback, viewDefinition.filters, viewDefinition.filterGroups, viewDefinition.sort])

  const applySavedViewField = useCallback((result: SavedFieldValue) => {
    setRows((current) => current.map((row) => {
      const fields = { ...row.viewFields }
      let changed = false
      for (const candidate of catalog) {
        if (candidate.table !== result.table || candidate.attribute !== result.attribute) continue
        const key = valueKeyFor(candidate.id)
        if (relatedRecordId(candidate, fields, key, row.id) !== result.recordId) continue
        fields[key] = result.value
        const formattedKey = `${key}@OData.Community.Display.V1.FormattedValue`
        if (result.formatted) fields[formattedKey] = result.formatted
        else delete fields[formattedKey]
        changed = true
      }
      const displayPatch: Partial<Composition> = {}
      if (result.table === 'cr40f_reservadeveculos' && row.serviceId === result.recordId) {
        if (result.attribute === 'cr40f_trajeto') displayPatch.route = String(result.value ?? 'Trajeto não informado')
        if (result.attribute === 'cr40f_cliente') {
          Object.assign(displayPatch, { clientId: result.value, client: result.formatted ?? 'Cliente sem nome', clientRegistration: '', clientAddress: '' })
          for (const candidate of catalog.filter((field) => field.relationships?.[0]?.to === 'cr40f_servicorelacionadogeral' && field.relationships?.[1]?.to === 'cr40f_cliente')) {
            const key = valueKeyFor(candidate.id)
            fields[key] = null
            delete fields[`${key}@OData.Community.Display.V1.FormattedValue`]
            if (candidate.primaryIdAttribute) fields[`${key.slice(0, key.lastIndexOf('.'))}.${candidate.primaryIdAttribute}`] = null
          }
        }
        if (result.attribute === 'cr40f_dataehorriodesada') displayPatch.departureAt = String(result.value ?? '')
      }
      if (!changed && !Object.keys(displayPatch).length) return row
      const updated = { ...row, ...displayPatch, viewFields: fields, rowVersion: row.id === result.recordId && result.rowVersion ? result.rowVersion : row.rowVersion }
      saveQueueRef.current?.sync(updated)
      return updated
    }))
    if (catalog.some((field) => field.table === result.table && field.attribute === result.attribute && field.type === 'Lookup') || result.table === 'cr40f_reservadeveculos' && result.attribute === 'cr40f_dataehorriodesada') setRelatedRefreshPending(true)
    if (result.refreshWarning) setNotice({ tone: 'warning', title: 'Campo salvo', detail: result.refreshWarning, retryRefresh: true })
  }, [catalog, valueKeyFor])

  const displayedColumns = useMemo(() => {
    const base = new Map(columns.map((definition) => [definition.id, definition]))
    const layout = viewShape.columns
    const interactionProps = (rowId: string, id: string) => {
      const key = `${rowId}:${id}`
      return {
        onSelect: () => setSelectedCell(null),
        onBeforeEdit: () => { if (refreshingRef.current) return false; const committed = commitEdit(); if (committed) setSelectedCell(null); return committed },
        onEditingChange: (active: boolean) => { if (active) fieldEditsRef.current.add(key); else fieldEditsRef.current.delete(key); setRelatedFieldBusy(Boolean(fieldEditsRef.current.size || fieldSavesRef.current.size)) },
        onSavingChange: (active: boolean) => { if (active) { fieldSavesRef.current.add(key); localWritesRef.current++ } else fieldSavesRef.current.delete(key); setRelatedFieldBusy(Boolean(fieldEditsRef.current.size || fieldSavesRef.current.size)) },
      }
    }
    const generic = (id: string) => {
      const catalogField = catalog.find((item) => item.id === id)
      // Com a consulta da abertura as colunas vêm do layout da view: a célula tem o mesmo nome do campo no resultado e
      // aparece antes da metadata, com rótulo provisório e sem edição até o campo ser reconhecido.
      if (!catalogField && !openActive) return null
      const field = catalogField ?? provisionalField(id)
      const provisional = !catalogField
      const valueKey = valueKeyFor(id)
      // Campo de outra tabela edita quando a linha traz o id do registro relacionado (a abertura leva a chave de cada vínculo).
      const editable = dataSource === 'dataverse' && !provisional
      return column.accessor((row) => readViewField(row.viewFields, valueKey).value, {
        id,
        header: () => provisional
          ? <span className="column-header column-header--provisional" title={id}>{field.label}</span>
          : <ColumnHeader id={id} label={field.label} field={field} type={field.type} displayValue={columnFilterLabelsRef.current(id, (row) => String(readViewField(row.viewFields, valueKey).value ?? ''), (row) => readViewField(row.viewFields, valueKey).formatted)} {...columnHeaderPropsRef.current(id)} disabled={!catalogReady} />,
        cell: ({ getValue, row }) => {
          const value = getValue()
          if (id === 'new_status' && value !== null && value !== undefined && value !== '') {
            const formattedValue = readViewField(row.original.viewFields, valueKey).formatted
            const title = typeof formattedValue === 'string' && formattedValue ? formattedValue : String(value)
            const color = statusColors[String(value)]
            return <EditableViewFieldCell field={field} value={value} formatted={formattedValue} viewFields={row.original.viewFields} valueKey={valueKey} baseRecordId={row.original.id} editable={editable} {...interactionProps(row.original.id, id)} onSaved={applySavedViewField} display={<span className="grid-choice-badge" style={color ? { color, borderColor: color, backgroundColor: `${color}18` } : undefined} title={title}>{title}</span>} />
          }
          const formatted = readViewField(row.original.viewFields, valueKey).formatted
          return <EditableViewFieldCell field={field} value={value} formatted={formatted} viewFields={row.original.viewFields} valueKey={valueKey} baseRecordId={row.original.id} editable={editable} {...interactionProps(row.original.id, id)} onSaved={applySavedViewField} />
        },
      })
    }
    for (const [id, attribute, label] of [['client', 'cr40f_cliente', 'Cliente'], ['route', 'cr40f_trajeto', 'Trajeto'], ['date', 'cr40f_dataehorriodesada', 'Data']] as const) {
      const source = catalog.find((field) => field.table === 'cr40f_reservadeveculos' && field.attribute === attribute && field.relationships?.[0]?.to === 'cr40f_servicorelacionadogeral')
      const original = base.get(id)
      if (!source || !original) continue
      const field = { ...source, id, label }
      base.set(id, column.accessor((row) => id === 'client' ? row.client : id === 'route' ? row.route : row.departureAt, {
        id, header: original.header, meta: original.meta,
        cell: ({ row }) => {
          const item = row.original
          const value = id === 'client' ? item.clientId : id === 'route' ? item.route : item.departureAt
          const title = id === 'client' ? item.client : id === 'route' ? item.route : formatDepartureDate(item.departureAt)
          const target = id === 'client' ? item.clientId : id === 'route' ? item.serviceId : null
          const display = <span className={id === 'client' ? 'grid-client lookup-preview' : 'lookup-preview grid-route'}>
            {id === 'client' && <span className={`grid-status ${item.status === 'Concluído' ? 'grid-status--done' : ''}`} />}
            <span title={title}>{title}</span>
            {id === 'client' && <span className="lookup-preview__card" role="tooltip"><strong>{item.client}</strong>{item.clientRegistration && <span>{item.clientRegistration}</span>}{item.clientAddress && <span>{item.clientAddress}</span>}</span>}
            {id === 'route' && target && <span className="lookup-preview__card" role="tooltip"><strong>Serviço relacionado</strong><span>{item.route}</span><span>Cliente: {item.client}</span>{item.departureAt && <span>Saída: {formatDepartureDate(item.departureAt)}</span>}{item.serviceStatus && <span>Status: {item.serviceStatus}</span>}{item.serviceType && <span>Tipo: {item.serviceType}</span>}{item.vehicleType && <span>Veículo: {item.vehicleType}</span>}{item.passengers.length > 0 && <span>Passageiros: {item.passengers.join(', ')}</span>}</span>}
          </span>
          return <EditableViewFieldCell field={field} value={value} formatted={id === 'client' ? item.client : undefined} display={display} viewFields={item.viewFields} valueKey={attribute} baseRecordId={item.id} ownerRecordId={item.serviceId} editable={dataSource === 'dataverse'} {...interactionProps(item.id, id)} onSaved={applySavedViewField} />
        },
      }))
    }
    return [base.get('select')!, ...layout.map((item) => base.get(item.id) ?? generic(item.id)).filter((item): item is NonNullable<typeof item> => Boolean(item))]
  }, [applySavedViewField, catalog, catalogReady, columns, commitEdit, dataSource, openActive, statusColors, valueKeyFor, viewShape])
  const tableLayout = useMemo(() => [{ id: 'select', width: 36, pinned: true }, ...viewDefinition.columns], [viewDefinition])
  const resizeColumn = useCallback((id: string, width: number) => {
    const current = viewDefinitionRef.current
    applyViewDefinition({ ...current, columns: current.columns.map((item) => item.id === id ? { ...item, width } : item) })
  }, [applyViewDefinition])
  // Os cabeçalhos mostram referências da fórmula em edição e as opções de filtro derivadas das linhas carregadas.
  const rowsVersion = useMemo(() => ++rowsVersionCounter, [rows])
  const headerRenderKeys = useMemo(() => new Map(displayedColumns.map((definition) => {
    const id = String(definition.id)
    return [id, `${activeFormulaReferences.indexOf(id as MoneyField)}:${rowsVersion}`]
  })), [activeFormulaReferences, displayedColumns, rowsVersion])
  const footerValues = useMemo(() => footerCells ? Object.fromEntries(moneyFields.map(({ key }, index) => [key, footerCells[index + 4]])) : undefined, [footerCells])
  const exportExcel = async () => {
    setExporting(true)
    try {
      // Com serviços selecionados, só eles; sem seleção, a mesma consulta da grade (view, filtros e busca).
      let records: Composition[]
      if (selectedVisibleRows.length) records = selectedVisibleRows
      else if (dataSource === 'mock') records = visibleRows
      else {
        const { view, error } = resolveCompositionQuery(activeView, viewDefinition, catalog, search.trim())
        if (error) throw new Error(error)
        records = await collectCompositionPages((link) => loadCompositions(link, view))
      }
      const viewName = activeView?.name ?? 'Todas as composições'
      const blob = compositionWorkbook(records, viewDefinition, catalog, selectedVisibleRows.length ? `${viewName} (selecionados)` : viewName)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `composicoes-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      void logAppError(error, { action: 'extrair-excel', phase: 'export', component: 'ComposicaoPage' })
      setNotice({ tone: 'error', title: 'Falha ao extrair para Excel', detail: errorMessage(error, 'Não foi possível carregar todas as linhas.') })
    } finally { setExporting(false) }
  }
  const hasActiveFilters = Boolean(search.trim() || Object.keys(columnFilters).length || viewDefinition.filters.length || viewDefinition.filterGroups?.some((group) => group.filters.length))
  const clearFilters = () => {
    setSearch('')
    setColumnFilters({})
    setViewDefinition((current) => ({ ...current, filters: [], filterGroups: [] }))
  }

  const formulaBarRow = selectedCell ? projectedRows.find((row) => row.id === selectedCell.rowId) : undefined
  const formulaBarField = selectedCell ? moneyFields.find(({ key }) => key === selectedCell.field) : undefined
  const formulaBarValue = selectedCell && editing?.rowId === selectedCell.rowId && editing.field === selectedCell.field
    ? editing.value
    : selectedCell && formulaBarRow
      ? formulaBarRow.formulas[selectedCell.field]?.expression
        ? friendlyExpression(formulaBarRow.formulas[selectedCell.field]!.expression)
        : moneyDraft(formulaBarRow.values[selectedCell.field])
      : ''

  const contextRow = contextCell ? rows.find((candidate) => candidate.id === contextCell.rowId) : undefined
  const contextActions: MenuAction[] = contextCell ? [
    {
      id: 'edit', label: isWritableMoneyField(contextCell.field) ? 'Editar valor ou fórmula' : 'Campo calculado no Dataverse', disabled: !isWritableMoneyField(contextCell.field),
      onSelect: () => { if (contextRow) beginEdit(contextRow, contextCell.field) },
    },
    {
      id: 'copy', label: 'Copiar valor',
      onSelect: () => {
        if (!contextRow) return
        copyText(moneyDraft(contextRow.values[contextCell.field]))
          .then(() => setNotice({ tone: 'success', title: 'Valor copiado', detail: moneyFormatter.format(Number(contextRow.values[contextCell.field])) }))
          .catch(() => setNotice({ tone: 'error', title: 'Não foi possível copiar', detail: 'O navegador bloqueou a área de transferência.' }))
      },
    },
    ...(isWritableMoneyField(contextCell.field) && contextRow?.formulas[contextCell.field] ? [{
      id: 'keep-value', label: 'Manter só o valor (remover fórmula)', disabled: commandLocked,
      onSelect: () => {
        const value = contextRow.values[contextCell.field]
        void persistCellInput(contextRow, contextCell.field, moneyDraft(value), { kind: 'literal', value })
      },
    }] : []),
  ] : []

  return (
    <div className="composicao">
    <PageLayout
      className="page--full composition-layout"
      bodyClassName="composition-layout__body"
      title="Composição de preços"
      description="Valores relacionados às reservas"
      meta={<span className="composition-count" aria-label={nextLink ? `${visibleRows.length} registros carregados de ${totalCount ?? 'um total ainda não calculado'}` : undefined}>{nextLink
            ? totalCount !== null ? `${visibleRows.length} de ${totalCount.toLocaleString('pt-BR')} registros` : `${visibleRows.length}+ registros`
            : `${visibleRows.length} ${visibleRows.length === 1 ? 'registro' : 'registros'}`}</span>}
      actions={(
        <div className="composition-actions">
          <div className="composition-view-actions">
          <ViewManager catalog={catalog} views={views} active={activeView} definition={viewDefinition} disabled={commandLocked || (!catalogReady && dataSource !== 'mock')} mockMode={dataSource === 'mock'} filterDrawerHost={filterDrawerHost} onChange={applyViewDefinition} onSelect={selectView} onSave={saveCurrentView} onDelete={deleteCurrentView} />
          </div>
          <label className="composition-search">
            <Search aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} disabled={!catalogReady && dataSource !== 'mock'} placeholder="Buscar cliente ou trajeto" aria-label="Buscar cliente ou trajeto" />
          </label>
        </div>
      )}
    >
    <div className="composition-workspace">
    <section className="composition-page" aria-label="Composições de preço">
      {viewError && <div className="view-load-error" role="alert">Visualizações: {viewError}</div>}
      {notice?.retryRefresh && (
        <div className={`composition-notice composition-notice--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <span><strong>{notice.title}</strong>{notice.detail ? ` ${notice.detail}` : ''}</span>
          <button type="button" onClick={() => { setNotice(null); void refreshData() }}>Tentar novamente</button>
          <button type="button" className="composition-notice__close" aria-label="Fechar aviso" onClick={() => setNotice(null)}><X aria-hidden="true" /></button>
        </div>
      )}

      <nav className="composition-commandbar" aria-label="Ações da composição de preços">
        <button type="button" data-command="refresh" disabled={commandLocked} onClick={() => void refreshData()} title="Recarregar dados sem perder filtros, seleção ou posição"><RefreshCw className={commandPhase === 'refresh' ? 'command-icon--spin' : ''} /><span className="command-button-label">{commandPhase === 'refresh' ? 'Atualizando…' : 'Atualizar'}</span></button>
        <button type="button" data-command="export" disabled={commandLocked || !dataSource || Boolean(queryError) || (dataSource === 'dataverse' && !catalog.length)} onClick={() => void exportExcel()} title={selectedCount ? `Extrair os ${selectedCount} serviços selecionados para Excel` : "Extrair as linhas da view e dos filtros atuais para Excel"}><Download /><span className="command-button-label">{exporting ? 'Extraindo…' : selectedCount ? `Extrair ${selectedCount} para Excel` : 'Extrair para Excel'}</span></button>
        <span className="composition-commandbar__divider" aria-hidden="true" />
        <button type="button" data-command="op" disabled={commandLocked || !dataSource || !selectedCount} onClick={() => void generateOp()} title={selectedCount ? `Gerar 1 OP com as ${selectedCount} composição(ões) selecionada(s)` : 'Selecione uma composição para gerar OP'}><FilePlus2 /><span className="command-button-label">{commandPhase === 'inspect-op' ? 'Verificando…' : commandPhase === 'send-op' ? 'Enviando…' : 'Gerar OP'}</span></button>
        <button type="button" data-command="audit" disabled={commandLocked || !dataSource} onClick={() => setAuditIds(selectedIds)} title={selectedCount ? 'Ver auditoria das composições selecionadas' : 'Ver auditoria da tabela'}><ClipboardList /><span className="command-button-label">Auditoria</span></button>
        <span className="composition-commandbar__divider" aria-hidden="true" />
        <button type="button" data-command="delete" disabled={commandLocked || !dataSource || !selectedCount} onClick={excludeSelected} title={selectedCount ? `Excluir ${selectedCount} composição(ões) selecionada(s)` : 'Selecione uma composição para excluir'}><Trash2 /><span className="command-button-label">{commandPhase === 'delete' ? 'Excluindo…' : 'Excluir'}</span></button>
        <span className="composition-commandbar__context" role="status">{commandProgress || (dataSource === 'mock' ? selectedCount ? `Modo local · ${selectedCount} selecionado(s)` : 'Modo local · ações simuladas' : selectedCount ? `${selectedCount} ${selectedCount === 1 ? 'registro selecionado' : 'registros selecionados'}` : 'Selecione registros para Gerar OP ou Excluir')}</span>
      </nav>

      <div ref={formulaBarContainerRef} className="formula-bar" aria-label="Barra de fórmulas">
        <span className="formula-bar__field" title={formulaBarField?.label ?? 'Selecione uma célula'}>{formulaBarField?.label ?? '—'}</span>
        <span className="formula-bar__fx" aria-hidden="true">ƒx</span>
        <input
          ref={formulaBarRef}
          value={formulaBarValue}
          data-formula={formulaBarValue.trimStart().startsWith('=')}
          aria-autocomplete="list"
          aria-expanded={editorTarget === 'bar' && referenceSuggestions.length > 0}
          aria-controls={editorTarget === 'bar' && referenceSuggestions.length > 0 ? 'formula-suggestions-bar' : undefined}
          aria-activedescendant={editorTarget === 'bar' && referenceSuggestions.length > 0 ? `formula-suggestion-bar-${referenceSuggestions[Math.min(suggestionIndex, referenceSuggestions.length - 1)].key}` : undefined}
          disabled={!selectedCell || !formulaBarRow || !isWritableMoneyField(selectedCell.field)}
          placeholder="Selecione uma célula para ver ou inserir uma fórmula"
          aria-label={formulaBarField ? `Fórmula de ${formulaBarField.label}` : 'Fórmula da célula selecionada'}
          onFocus={() => {
            editorTargetRef.current = 'bar'
            setEditorTarget('bar')
            if (blurTimerRef.current !== null) {
              window.clearTimeout(blurTimerRef.current)
              blurTimerRef.current = null
            }
            if (selectedCell && formulaBarRow && isWritableMoneyField(selectedCell.field)) {
              const active = editingRef.current
              if (active?.rowId === selectedCell.rowId && active.field === selectedCell.field) {
                setEditorCaret(formulaBarRef.current?.selectionStart ?? active.value.length)
              } else beginEdit(formulaBarRow, selectedCell.field, 'bar')
            }
          }}
          onChange={(event) => {
            const active = editingRef.current
            if (!active) return
            clearCellError(active.rowId, active.field)
            const next = { ...active, value: event.target.value }
            editingRef.current = next
            setEditing(next)
            setEditorCaret(event.target.selectionStart ?? next.value.length)
            setSuggestionIndex(0)
            setSuggestionsDismissed(false)
          }}
          onSelect={(event) => setEditorCaret(event.currentTarget.selectionStart ?? 0)}
          onScroll={(event) => positionBarSuggestions(event.currentTarget.selectionStart ?? editorCaret)}
          onBlur={() => {
            if (keepEditorDuringMenuRef.current) return
            blurTimerRef.current = window.setTimeout(() => { blurTimerRef.current = null; commitEdit(false, true) }, 0)
          }}
          onKeyDown={(event) => {
            if (handleSuggestionKeyDown(event)) return
            if (event.key === 'Enter') { event.preventDefault(); if (commitEdit() && selectedCell) focusVerticalCell(selectedCell.rowId, selectedCell.field, event.shiftKey ? -1 : 1) }
            else if (event.key === 'Escape') { event.preventDefault(); commitEdit(true) }
            else if (event.key === 'Tab' && selectedCell) { event.preventDefault(); if (commitEdit()) focusNextEditableCell(selectedCell.rowId, selectedCell.field, event.shiftKey) }
          }}
        />
        {suggestionList('bar')}
      </div>

      <div ref={setTableRegion} className="composition-table-region" role="region" aria-label="Tabela de composições" tabIndex={0}>
        <CellHoverPreview />
        {loading ? <PriceGridSkeleton />
          : connectionError && rows.length === 0 ? <div className="price-grid__empty" role="alert">{connectionError}</div>
            : <DataTable rowRenderKeys={rowRenderKeys} headerRenderKeys={headerRenderKeys} resetKey={openActive ? `open:${openQuery?.viewId ?? 'default'}` : `${activeView?.id ?? 'default'}:${JSON.stringify(viewDefinition.filters)}:${JSON.stringify(viewDefinition.filterGroups)}:${viewDefinition.groupOperator}:${JSON.stringify(viewDefinition.sort)}`} data={visibleRows} columns={displayedColumns} layout={tableLayout} onResizeColumn={resizeColumn} footerValues={footerValues} getRowId={(row) => row.id} footerLabel={footerLabel} footerCells={footerCells} scroller={tableScroller} onSelectionChange={handleSelectionChange} emptyContent={<div className="composition-empty-state"><div className="composition-empty-state__icon" aria-hidden="true"><SearchX /></div><strong>{hasActiveFilters ? 'Nenhum resultado para os filtros atuais' : 'Nenhuma composição encontrada'}</strong><p>{hasActiveFilters ? 'Ajuste a busca ou os filtros para encontrar composições.' : 'Não há composições para exibir nesta view.'}</p>{hasActiveFilters && <button type="button" onClick={clearFilters}>Zerar filtros</button>}</div>} />}
        {!loading && nextLink && !connectionError ? (
          <div ref={loadMoreRef} className="composition-load-more" role="status" aria-busy={loadingMore}>
            <LoaderCircle aria-hidden="true" />Carregando mais registros…
          </div>
        ) : null}
        {connectionError && rows.length > 0 ? (
          <div className="composition-load-error" role="alert">
            {connectionError}
            {nextLink ? <button type="button" onClick={() => { setConnectionError(null); void loadMore() }}>Tentar novamente</button> : null}
          </div>
        ) : null}
      </div>

      <ContextMenu at={contextCell ? { x: contextCell.x, y: contextCell.y } : null} actions={contextActions} onClose={() => setContextCell(null)} />
      {pendingConfirm && <CommandConfirmDialog
        {...confirmDialogContent(pendingConfirm, dataSource === 'mock')}
        mock={dataSource === 'mock'}
        onCancel={closeConfirm}
        onConfirm={() => void confirmPending()}
      />}
      {auditIds !== null && <AuditOverlay ids={auditIds} mock={dataSource === 'mock'} onClose={closeAudit} />}
      <footer className="composition-footer">
        <span>
          {dataSource === 'mock'
            ? `Modo local · ${rows.length} registros de demonstração · edições em memória`
            : dataSource === 'dataverse'
              ? `${getDataverseEnvironmentLabel()} · ${rows.length} composições reais · salva ao confirmar`
              : 'Carregando dados…'}
        </span>
      </footer>
    </section>
    <div className="view-filter-drawer-host" ref={setFilterDrawerHost} />
    </div>
    </PageLayout>
    </div>
  )
}
