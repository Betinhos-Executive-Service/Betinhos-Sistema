import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  useTable,
  flexRender,
  type ColumnDef,
  type CellData,
  type Header,
  type RowData,
  type Row,
  type RowSelectionState,
  type SortingState,
  type TableFeatures,
} from '@tanstack/react-table'
import { useVirtualRows } from '../../../app/VirtualTable'
import { GridRowContext } from './grid-row-state'
import { REVEAL_GRID_ROW, type RevealGridRow } from './grid-cell-focus'
import { dataTableFeatures, type DataTableFeatures } from './features'
import type { ViewColumn } from '../data/views'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue extends CellData = CellData> {
    className?: string
  }
}

type DataTableProps<TData extends RowData> = {
  data: TData[]
  columns: ColumnDef<DataTableFeatures, TData, any>[]
  getRowId: (row: TData) => string
  footerLabel?: string
  footerCells?: ReactNode[]
  onSelectionChange?: (selectedIds: string[]) => void
  layout?: ViewColumn[]
  footerValues?: Record<string, ReactNode>
  onResizeColumn?: (id: string, width: number) => void
  emptyContent?: ReactNode
  /** Snapshots of external cell state. Omit to keep unconditionally rendering rows. */
  rowRenderKeys?: ReadonlyMap<string, string>
  /** Snapshots do estado externo exibido nos cabeçalhos (referências de fórmula, dados dos filtros). Omitido, os cabeçalhos sempre renderizam. */
  headerRenderKeys?: ReadonlyMap<string, string>
  /** Quando muda, limpa seleção e ordenação locais sem remontar a grade. */
  resetKey?: string
  /** Elemento que rola a grade. Com ele e mais de `VIRTUAL_FROM` linhas, só as linhas perto da tela entram no DOM. */
  scroller?: HTMLElement | null
}

/** Altura fixa da linha (`.price-grid td`); as linhas fora da janela viram uma linha espaçadora com esta soma. */
const ROW_HEIGHT = 38

type RowPresentation = Map<string, { className: string; style: CSSProperties }>
type ResizeApi = { begin: (id: string, startX: number, startWidth: number) => void; commit: (id: string, width: number) => void }

const clampWidth = (width: number) => Math.max(100, Math.min(600, width))

function DataRow<TData extends RowData>({ row, selected, presentation, report }: {
  row: Row<DataTableFeatures, TData>
  selected: boolean
  presentation: RowPresentation
  report: (rowId: string, kind: 'editing' | 'saving', on: boolean) => void
  columns: DataTableProps<TData>['columns']
  renderKey: unknown
}) {
  const rowId = row.id
  const state = useMemo(() => ({ setEditing: (on: boolean) => report(rowId, 'editing', on), setSaving: (on: boolean) => report(rowId, 'saving', on) }), [report, rowId])
  return <GridRowContext.Provider value={state}>
    <tr data-row-id={row.id} data-state={selected ? 'selected' : undefined} className="price-grid__body-row">
      {row.getAllCells().map((cell) => <td key={cell.id} {...presentation.get(cell.column.id)}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </td>)}
    </tr>
  </GridRowContext.Provider>
}

// O TanStack recria os objetos Row a cada mudança de `data`; a linha só precisa renderizar de novo quando o
// registro de origem, a seleção, as colunas, a apresentação ou o snapshot externo mudarem.
const MemoDataRow = memo(DataRow, (previous, next) =>
  previous.row.id === next.row.id
  && previous.row.original === next.row.original
  && previous.selected === next.selected
  && previous.presentation === next.presentation
  && previous.columns === next.columns
  && previous.renderKey === next.renderKey,
) as typeof DataRow

// Chama a função do cabeçalho em vez de usá-la como componente (flexRender): a grade recria essas funções
// a cada recálculo das colunas, e um tipo de componente novo remontaria o filtro rápido, fechando o popup aberto.
function renderHeader<TData extends RowData>(header: Header<DataTableFeatures, TData, unknown>) {
  const def = header.column.columnDef.header
  return typeof def === 'function' ? def(header.getContext()) : def
}

function HeaderCell<TData extends RowData>({ header, className, style, sorted, width, resize }: {
  header: Header<DataTableFeatures, TData, unknown>
  className: string
  style: CSSProperties
  sorted: false | 'asc' | 'desc'
  width: number
  /** Ausente quando a coluna não pode ser redimensionada. */
  resize: ResizeApi | null
  renderKey: unknown
}) {
  return (
    <th
      className={className}
      style={style}
      scope="col"
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
    >
      {header.isPlaceholder ? null : renderHeader(header)}
      {resize && <span className="view-column-resize" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`Redimensionar ${header.column.id}`} aria-valuemin={100} aria-valuemax={600} aria-valuenow={width} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        const next = event.key === 'Home' ? 100 : event.key === 'End' ? 600 : width + (event.key === 'ArrowRight' ? 10 : -10)
        resize.commit(header.column.id, clampWidth(next))
      }} onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        resize.begin(header.column.id, event.clientX, width)
      }} />}
    </th>
  )
}

// Os cabeçalhos carregam os menus de filtro de cada coluna; só renderizam de novo quando algo visível neles muda.
const MemoHeaderCell = memo(HeaderCell, (previous, next) =>
  previous.header === next.header
  && previous.className === next.className
  && previous.style === next.style
  && previous.sorted === next.sorted
  && previous.width === next.width
  && previous.resize === next.resize
  && previous.renderKey === next.renderKey,
) as typeof HeaderCell

export function DataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  footerLabel,
  footerCells,
  onSelectionChange,
  layout,
  footerValues,
  onResizeColumn,
  emptyContent,
  rowRenderKeys,
  headerRenderKeys,
  resetKey,
  scroller = null,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [resizingWidth, setResizingWidth] = useState<{ id: string; width: number } | null>(null)
  const resizeCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanup.current?.(), [])
  const onResizeColumnRef = useRef(onResizeColumn)
  onResizeColumnRef.current = onResizeColumn
  // Objeto estável: os cabeçalhos memoizados não dependem da identidade de onResizeColumn.
  const resizeApi = useMemo<ResizeApi>(() => ({
    commit: (id, width) => {
      resizeCleanup.current?.()
      setResizingWidth(null)
      onResizeColumnRef.current?.(id, width)
    },
    begin: (id, startX, startWidth) => {
      resizeCleanup.current?.()
      let frame = 0
      let pendingWidth = startWidth
      const move = (moveEvent: PointerEvent) => {
        pendingWidth = clampWidth(startWidth + moveEvent.clientX - startX)
        if (!frame) frame = requestAnimationFrame(() => {
          frame = 0
          setResizingWidth({ id, width: pendingWidth })
        })
      }
      const cleanup = () => {
        cancelAnimationFrame(frame)
        document.documentElement.classList.remove('is-resizing-column')
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', cancel)
        resizeCleanup.current = null
      }
      const cancel = () => { cleanup(); setResizingWidth(null) }
      const stop = (upEvent: PointerEvent) => {
        cleanup()
        setResizingWidth(null)
        onResizeColumnRef.current?.(id, clampWidth(startWidth + upEvent.clientX - startX))
      }
      // Cursor de redimensionar e sem seleção de texto na página inteira enquanto arrasta, mesmo fora do cabeçalho.
      document.documentElement.classList.add('is-resizing-column')
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', stop, { once: true })
      window.addEventListener('pointercancel', cancel, { once: true })
      resizeCleanup.current = cleanup
    },
  }), [])
  const [appliedResetKey, setAppliedResetKey] = useState(resetKey)
  if (appliedResetKey !== resetKey) {
    setAppliedResetKey(resetKey)
    setSorting([])
    setRowSelection({})
  }
  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
  })
  const tableRef = useRef<HTMLTableElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const rows = table.getRowModel().rows
  const { virtual, visible, start } = useVirtualRows(rows, (row) => row.id, scroller, scrollMargin, ROW_HEIGHT)
  // Posição absoluta de cada linha no DOM para a navegação por teclado (grid-cell-focus). Vai pelo DOM, não por prop,
  // para a linha mantida não renderizar de novo quando um filtro só muda a posição dela.
  useLayoutEffect(() => {
    const element = tableRef.current
    if (!element) return
    const positions = new Map(rows.map((row, index) => [row.id, index]))
    element.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row-id]').forEach((item) => { item.dataset.rowIndex = String(positions.get(item.dataset.rowId ?? '') ?? '') })
  })

  // Linhas com célula editando ou salvando continuam montadas fora da janela: desmontar perderia o rascunho.
  const heldKinds = useRef({ editing: new Set<string>(), saving: new Set<string>() })
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set())
  const report = useCallback((rowId: string, kind: 'editing' | 'saving', on: boolean) => {
    const kinds = heldKinds.current
    kinds[kind][on ? 'add' : 'delete'](rowId)
    const next = new Set([...kinds.editing, ...kinds.saving])
    setHeld((current) => current.size === next.size && [...next].every((id) => current.has(id)) ? current : next)
  }, [])
  // Onde a primeira linha começa no conteúdo do scroller: a tabela pode ter algo acima dela e o cabeçalho é fixo.
  useLayoutEffect(() => {
    const element = tableRef.current
    if (!scroller || !element || !virtual) return
    const update = () => {
      const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + (element.tHead?.offsetHeight ?? 0)
      setScrollMargin((current) => (Math.abs(top - current) > 1 ? top : current))
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(scroller)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [scroller, virtual])
  // O teclado pede (grid-cell-focus) uma linha que a janela não desenha: rola até ela e foca a célula quando a linha entra no DOM.
  const pendingFocus = useRef<RevealGridRow | null>(null)
  const [revealTick, setRevealTick] = useState(0)
  useEffect(() => {
    const element = tableRef.current
    if (!element || !scroller) return
    const reveal = (event: Event) => {
      const request = (event as CustomEvent<RevealGridRow>).detail
      pendingFocus.current = request
      // Posição calculada com a altura fixa da linha (ROW_HEIGHT); se as linhas passarem a ter altura variável, medir.
      scroller.scrollTop = Math.max(0, scrollMargin + request.index * ROW_HEIGHT - scroller.clientHeight / 2)
      setRevealTick((tick) => tick + 1)
    }
    element.addEventListener(REVEAL_GRID_ROW, reveal)
    return () => element.removeEventListener(REVEAL_GRID_ROW, reveal)
  }, [scroller, scrollMargin])
  useLayoutEffect(() => {
    const request = pendingFocus.current
    if (!request) return
    const row = tableRef.current?.querySelector(`tbody tr[data-row-index="${request.index}"]`)
    if (!row) return
    pendingFocus.current = null
    const cells = Array.from(row.querySelectorAll<HTMLElement>('[data-grid-cell]'))
    const target = request.column != null ? cells[request.column] : (request.edge === 'last' ? cells.reverse() : cells).find((cell) => cell.dataset.gridEditable !== 'false')
    target?.focus()
  }, [revealTick, visible, start, virtual])
  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.id)
  const leafColumns = table.getAllLeafColumns()
  const layoutById = new Map(layout?.map((item) => [item.id, item]))
  const columnWidth = (id: string) => Math.max(id === 'select' ? 36 : 100, resizingWidth?.id === id ? resizingWidth.width : layoutById.get(id)?.width ?? 100)
  const pinnedLeft = new Map<string, number>()
  let offset = 0
  for (const item of layout ?? []) {
    if (!item.pinned) continue
    pinnedLeft.set(item.id, offset)
    offset += columnWidth(item.id)
  }
  const columnIndexes = new Map(leafColumns.map((item, index) => [item.id, index]))
  const cellStyle = (id: string) => {
    const index = columnIndexes.get(id)
    const width = `var(--grid-width-${index})`
    return { width, minWidth: width, maxWidth: width, left: pinnedLeft.has(id) ? `var(--grid-left-${index})` : undefined }
  }
  const tableStyle = Object.fromEntries(leafColumns.flatMap((item, index) => [
    [`--grid-width-${index}`, `${columnWidth(item.id)}px`],
    [`--grid-left-${index}`, `${pinnedLeft.get(item.id) ?? 0}px`],
  ])) as CSSProperties
  if (layout) tableStyle.width = leafColumns.reduce((sum, item) => sum + columnWidth(item.id), 0)
  const cellClass = (id: string, base?: string) => `${pinnedLeft.has(id) ? base ?? '' : (base ?? '').replace(/\bfixed-col(?:--[a-z]+)?\b/g, '')}${pinnedLeft.has(id) ? ' view-pinned' : ''}`
  // As células leem a largura das variáveis CSS; só ordem e fixação mudam a apresentação das linhas.
  const layoutShape = layout?.map((item) => `${item.id}:${item.pinned ? 1 : 0}`).join()
  const rowPresentation = useMemo(() => new Map(leafColumns.map((item) => [item.id, {
    className: cellClass(item.id, item.columnDef.meta?.className),
    style: cellStyle(item.id),
  }])), [columns, layoutShape])

  const spacer = (key: string, height: number) => <tr key={key} aria-hidden="true" data-spacer className="price-grid__spacer"><td colSpan={leafColumns.length} style={{ height }} /></tr>
  const dataRow = (row: Row<DataTableFeatures, TData>) => (
    <MemoDataRow
      key={row.id}
      row={row}
      columns={columns}
      selected={row.getIsSelected()}
      presentation={rowPresentation}
      report={report}
      renderKey={rowRenderKeys ? rowRenderKeys.get(row.id) : {}}
    />
  )
  // Uma lista só, com chaves: a linha mantida passa de "na janela" a "fora dela" sem desmontar. As linhas mantidas ficam
  // entre espaçadores que somam a altura que a posição delas já ocupava, para a rolagem não pular.
  const bodyItems: ReactNode[] = []
  if (!virtual) bodyItems.push(...visible.map(dataRow))
  else {
    const end = start + visible.length
    const heldOutside = held.size ? rows.flatMap((row, index) => held.has(row.id) && (index < start || index >= end) ? [{ row, index }] : []) : []
    const push = (from: number, items: typeof heldOutside, to: number, tag: string) => {
      let cursor = from
      for (const item of items) {
        if (item.index > cursor) bodyItems.push(spacer(`${tag}-${cursor}`, (item.index - cursor) * ROW_HEIGHT))
        bodyItems.push(dataRow(item.row))
        cursor = item.index + 1
      }
      if (to > cursor) bodyItems.push(spacer(`${tag}-${cursor}`, (to - cursor) * ROW_HEIGHT))
    }
    push(0, heldOutside.filter((item) => item.index < start), start, 'antes')
    bodyItems.push(...visible.map(dataRow))
    push(end, heldOutside.filter((item) => item.index >= end), rows.length, 'depois')
  }

  useEffect(() => onSelectionChange?.(selectedIds), [onSelectionChange, data, rowSelection])

  return (
    <table ref={tableRef} className="price-grid" style={tableStyle} data-row-count={rows.length}>
      {layout && <colgroup>{leafColumns.map((column) => <col key={column.id} style={{ width: columnWidth(column.id) }} />)}</colgroup>}
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id} className="price-grid__header-row">
            {group.headers.map((header) => {
              const presentation = rowPresentation.get(header.column.id)
              return <MemoHeaderCell
                key={header.id}
                header={header}
                className={presentation?.className ?? cellClass(header.column.id, header.column.columnDef.meta?.className)}
                style={presentation?.style ?? cellStyle(header.column.id)}
                sorted={header.column.getIsSorted()}
                width={columnWidth(header.column.id)}
                resize={onResizeColumn && header.column.id !== 'select' ? resizeApi : null}
                renderKey={headerRenderKeys ? headerRenderKeys.get(header.column.id) : {}}
              />
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.length ? bodyItems : (
          <tr className="price-grid__empty-row">
            <td className="price-grid__empty" colSpan={leafColumns.length}>
              <div className="price-grid__empty-content">{emptyContent ?? 'Nenhuma composição encontrada.'}</div>
            </td>
          </tr>
        )}
      </tbody>
      {footerCells && (
        <tfoot className="price-grid__footer">
          <tr>
            {layout ? leafColumns.map((column, index) => <td key={column.id} className={cellClass(column.id, column.columnDef.meta?.className)} style={cellStyle(column.id)}>{index === 1 ? footerLabel : footerValues?.[column.id]}</td>) : <>
              <td className="price-grid__footer-label" colSpan={4}>{footerLabel}</td>
              {footerCells.slice(4).map((cell, index) => (
                <td key={`total-${index}`} className={leafColumns[index + 4]?.columnDef.meta?.className}>{cell}</td>
              ))}
            </>}
          </tr>
        </tfoot>
      )}
    </table>
  )
}
