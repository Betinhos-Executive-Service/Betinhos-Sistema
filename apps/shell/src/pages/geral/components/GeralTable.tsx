import { Fragment, useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Checkbox } from '@betinhos/ui'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cellKind } from '../domain/cells'
import { columnLabel, rowKey } from '../domain/layout'
import { isEmptyFilter, type FilterSet } from '../domain/filters'
import { filterKindOf } from '../domain/filterKind'
import { ColumnMenu } from './ColumnMenu'
import { formatCell } from '../domain/format'
import { nextSort, sameSort } from '../domain/sort'
import { ID_ATTRIBUTE, type AttributeMap, type Column, type Sort } from '../domain/types'

type Props = {
  columns: Column[]
  attributes: AttributeMap | null
  rows: Row[]
  loading: boolean
  /** Ordenação escolhida pelo usuário; `null` = a da própria visão. */
  sort: Sort
  /** Ordem da visão, mostrada no cabeçalho enquanto `sort` é `null`. */
  defaultSort: Sort
  onSort: (sort: Sort) => void
  filters: FilterSet
  onEditFilter: (attribute: string) => void
  onClearFilter: (attribute: string) => void
  onHide: (key: string) => void
  /** Larguras escolhidas pelo usuário: viram trilhas fixas (sem fr). */
  customWidths?: Record<string, number>
  /** Grava a largura da coluna (px); `null` volta à largura da visão. */
  onResize: (key: string, width: number | null) => void
  /** Move a coluna para a posição indicada (0 = primeira coluna de dados) entre as visíveis. */
  onMove: (key: string, toIndex: number) => void
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  onOpen: (id: string) => void
  /** Devolve o `gridcell` completo da coluna (a primeira coluna é desenhada aqui, como botão que abre o serviço). */
  renderCell: (row: Row, column: Column) => ReactNode
  /** Contêiner de rolagem (`.gr-grid`): é a raiz do observador que carrega mais linhas. */
  scrollRef?: RefObject<HTMLDivElement | null>
  /** Dentro do contêiner de rolagem, logo depois da última linha (o sentinela da rolagem infinita). */
  tail?: ReactNode
  footer: ReactNode
  empty: ReactNode
}

const SKELETON_ROWS = 8
/** Grid editável com rolagem horizontal, seleção por linha e a primeira coluna fixa. As classes visuais são as da tabela do DS. */
export function GeralTable({ columns, attributes, rows, loading, sort, defaultSort, onSort, filters, onEditFilter, onClearFilter, onHide, customWidths, onResize, onMove, selected, onToggle, onToggleAll, onOpen, renderCell, scrollRef, tail, footer, empty }: Props) {
  // Trilhas crescem na proporção da largura da visão (fr) e nunca ficam abaixo do mínimo; a largura mínima total
  // garante que cabeçalho e linhas compartilhem as mesmas trilhas quando a soma dos mínimos excede o contêiner.
  // Sim/Não ocupa uma trilha fixa estreita: o conteúdo é um switch, não cresce com a tela.
  const BOOLEAN_WIDTH = 96
  // Durante o arraste a largura vem de `live`; ao soltar ela é gravada nas preferências e `live` zera.
  const [live, setLive] = useState<Record<string, number>>({})
  const drag = useRef<{ key: string; startX: number; start: number; width: number } | null>(null)
  const [dropAt, setDropAt] = useState<{ key: string; after: boolean } | null>(null)
  const [announce, setAnnounce] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    const key = refocus.current
    if (!key) return
    refocus.current = null
    const buttons = root.current?.querySelectorAll<HTMLElement>('.gr-head__sort')
    buttons?.forEach((b) => { if (b.dataset.col === key) b.focus() })
  }, [columns])
  const widthOf = (c: Column) => live[c.key] ?? c.width
  const isBoolean = (c: Column) => cellKind(c, attributes?.get(c.key)) === 'boolean'
  const isFixed = (c: Column) => live[c.key] != null || customWidths?.[c.key] != null
  const track = (c: Column) => (isBoolean(c) ? `${BOOLEAN_WIDTH}px` : isFixed(c) ? `minmax(${widthOf(c)}px, ${widthOf(c)}px)` : `minmax(${Math.max(90, widthOf(c))}px, ${widthOf(c)}fr)`)
  const minOf = (c: Column) => (isBoolean(c) ? BOOLEAN_WIDTH : Math.max(90, widthOf(c)))
  const clampW = (w: number) => Math.min(1200, Math.max(90, Math.round(w)))
  const resizeDown = (column: Column) => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { key: column.key, startX: e.clientX, start: column.width, width: column.width }
  }
  const resizeMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.buttons === 0) return
    d.width = clampW(d.start + e.clientX - d.startX)
    setLive((l) => ({ ...l, [d.key]: d.width }))
  }
  const resizeEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (d.width !== d.start) onResize(d.key, d.width)
    setLive((l) => { const { [d.key]: _gone, ...rest } = l; return rest })
  }
  const resizeKey = (column: Column) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      onResize(column.key, clampW(column.width + (e.key === 'ArrowRight' ? 16 : -16)))
    } else if (e.key === 'Enter' || e.key === 'Delete') {
      e.preventDefault()
      e.stopPropagation()
      onResize(column.key, null)
    }
  }
  const moveKey = (column: Column, index: number) => (e: KeyboardEvent<HTMLElement>) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    const to = index + (e.key === 'ArrowRight' ? 1 : -1)
    if (to < 0 || to >= columns.length) return
    e.preventDefault()
    refocus.current = column.key
    onMove(column.key, to)
    setAnnounce(`Coluna ${columnLabel(column, attributes?.get(column.key))} movida para a posição ${to + 1}`)
  }
  const dragOver = (column: Column) => (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('text/x-gr-column')) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setDropAt({ key: column.key, after: e.clientX > rect.left + rect.width / 2 })
  }
  const dropOn = (column: Column, index: number) => (e: DragEvent<HTMLDivElement>) => {
    const from = e.dataTransfer.getData('text/x-gr-column')
    const after = dropAt?.after ?? false
    setDropAt(null)
    if (!from || from === column.key) return
    e.preventDefault()
    const fromIndex = columns.findIndex((c) => c.key === from)
    let to = index + (after ? 1 : 0)
    if (fromIndex < to) to -= 1
    if (fromIndex >= 0 && to !== fromIndex) onMove(from, to)
  }
  const minTotal = 40 + columns.reduce((sum, c) => sum + minOf(c), 0)
  const style = { '--gr-columns': `40px ${columns.map(track).join(' ')}`, '--gr-min-width': `${minTotal}px` } as CSSProperties
  const ids = rows.map((r) => String(r[ID_ATTRIBUTE]))
  const all = ids.length > 0 && ids.every((id) => selected.has(id))
  const some = !all && ids.some((id) => selected.has(id))
  const skeleton = loading && rows.length === 0
  const shown = sort ?? defaultSort

  return (
    <div ref={root} className="bt-table gr-table">
      <span className="gr-sr" role="status">{announce}</span>
      <div ref={scrollRef} className="gr-grid" role="grid" aria-label="Serviços" aria-busy={loading || undefined} aria-colcount={columns.length + 1} style={style}>
        <div className="bt-table__head" role="row">
          <div className="bt-table__cell gr-cell--select" role="columnheader">
            <Checkbox
              label={<span className="gr-sr">Selecionar carregados</span>}
              checked={all}
              ref={(node) => { if (node) node.indeterminate = some }}
              disabled={ids.length === 0}
              onChange={onToggleAll}
            />
          </div>
          {columns.map((column, index) => {
            const active = sameSort(shown, column)
            const label = columnLabel(column, attributes?.get(column.key))
            const filter = column.alias ? undefined : filters[column.attribute]
            return (
              <div
                key={column.key}
                className={`${index === 0 ? 'bt-table__cell gr-cell--first' : 'bt-table__cell'}${dropAt?.key === column.key ? (dropAt.after ? ' gr-drop--after' : ' gr-drop--before') : ''}`}
                role="columnheader"
                aria-label={label}
                title={label}
                aria-sort={active ? (shown?.descending ? 'descending' : 'ascending') : 'none'}
                draggable
                onDragStart={(e) => { if ((e.target as HTMLElement).closest?.('.gr-resize')) { e.preventDefault(); return } e.dataTransfer.setData('text/x-gr-column', column.key); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={dragOver(column)}
                onDragLeave={(e) => { if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return; setDropAt((d) => (d?.key === column.key ? null : d)) }}
                onDrop={dropOn(column, index)}
                onDragEnd={() => setDropAt(null)}
              >
                <div className="gr-head">
                  <button type="button" className="gr-head__sort" data-col={column.key} onKeyDown={moveKey(column, index)} onClick={() => onSort(nextSort(sort, defaultSort, column))}>
                    <span className="gr-head__label">{label}</span>
                    {active ? (shown?.descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />) : null}
                  </button>
                  <ColumnMenu
                    label={label}
                    filterable={!column.alias && filterKindOf(column.attribute, attributes?.get(column.key)) != null}
                    filtered={filter != null && !isEmptyFilter(filter)}
                    canHide={columns.length > 1}
                    onSort={(descending) => onSort({ attribute: column.attribute, alias: column.alias, descending })}
                    onFilter={() => onEditFilter(column.attribute)}
                    onClearFilter={() => onClearFilter(column.attribute)}
                    onHide={() => onHide(column.key)}
                  />
                </div>
                {isBoolean(column) ? null : (
                  <div
                    className="gr-resize"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Redimensionar coluna ${label}`}
                    tabIndex={0}
                    draggable={false}
                    onPointerDown={resizeDown(column)}
                    onPointerMove={resizeMove}
                    onPointerUp={resizeEnd}
                    onPointerCancel={resizeEnd}
                    onLostPointerCapture={resizeEnd}
                    aria-valuenow={widthOf(column)}
                    aria-valuemin={90}
                    aria-valuemax={1200}
                    onDoubleClick={() => onResize(column.key, null)}
                    onKeyDown={resizeKey(column)}
                  />
                )}
              </div>
            )
          })}
        </div>

        {skeleton
          ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div key={i} className="bt-table__row" role="row" aria-hidden="true">
              <div className="bt-table__cell gr-cell--select" role="gridcell"><span className="bt-table__skeleton" style={{ width: 16 }} /></div>
              {columns.map((column, index) => (
                <div key={column.key} className={index === 0 ? 'bt-table__cell gr-cell--first' : 'bt-table__cell'} role="gridcell"><span className="bt-table__skeleton" /></div>
              ))}
            </div>
          ))
          : rows.map((row) => {
            const id = String(row[ID_ATTRIBUTE])
            const isSelected = selected.has(id)
            return (
              <div key={id} className={isSelected ? 'bt-table__row is-selected' : 'bt-table__row'} role="row" aria-selected={isSelected}>
                <div className="bt-table__cell gr-cell--select" role="gridcell">
                  <Checkbox label={<span className="gr-sr">Selecionar serviço {formatCell('readonly', row, 'cr40f_id')}</span>} checked={isSelected} onChange={() => onToggle(id)} />
                </div>
                {columns.map((column, index) => {
                  if (index > 0) return <Fragment key={column.key}>{renderCell(row, column)}</Fragment>
                  const value = formatCell('readonly', row, rowKey(column, attributes?.get(column.key)))
                  return (
                    <div key={column.key} className="bt-table__cell gr-cell gr-cell--first" role="gridcell">
                      <button type="button" className="gr-open" aria-label={`Abrir serviço ${value} no Formulário Geral`} onClick={() => onOpen(id)}>{value}</button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        {tail}
      </div>
      {!loading && rows.length === 0 && empty != null ? <div className="bt-table__empty gr-empty">{empty}</div> : null}
      <div className="bt-table__footer">{footer}</div>
    </div>
  )
}
