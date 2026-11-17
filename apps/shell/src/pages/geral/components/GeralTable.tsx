import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Alert, Button, Checkbox, ColumnFilter, ColumnMenu, Spinner, type TableDensity, type TableQuickFilters } from '@betinhos/ui'
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react'
import { ChoiceBadge } from './ChoiceBadge'
import { useVirtualRows } from '../../../app/VirtualTable'
import { cellKind, isBadgeValue } from '../domain/cells'
import { columnLabel, rowKey } from '../domain/layout'
import { formatCell } from '../domain/format'
import { sameSort } from '../domain/sort'
import { ID_ATTRIBUTE, type AttributeMap, type Column, type Sort } from '../domain/types'
import { BrandLoader } from '../../../app/BrandLoader'
import { LoadSentinel } from './LoadMore'

/** Um grupo do servidor: rótulo e contagem reais; `rows` só tem o que já carregou (abre sob demanda, 100 por vez). */
export type GroupView = { id: string; label: string; count: number; open: boolean; rows: Row[]; more: boolean; loading: boolean; error: string | null }
export type Grouping = {
  /** `null` enquanto não agrupa (ou a contagem ainda não chegou): a grade mostra `rows`. */
  groups: GroupView[] | null
  onToggle: (id: string) => void
  onLoadMore: (id: string) => void
  onRetry: (id: string) => void
  /** Entrada "Agrupar por…" do menu do título; `undefined` quando a coluna não agrupa. */
  menu: (column: Column) => { date: boolean; active: 'value' | 'month' | 'year' | null; onChange: (next: 'value' | 'month' | 'year' | null) => void } | undefined
}

type Item = { type: 'group'; key: string; group: GroupView } | { type: 'row'; key: string; row: Row } | { type: 'foot'; key: string; group: GroupView }

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
  /** Atributos com filtro valendo (rápido ou avançado): ponto no ▾ e "Limpar filtro" no menu da coluna. */
  filteredKeys: string[]
  /** Filtro por coluna (DS §10.9.2): "Filtrar por…" no menu do título abre o painel ancorado ao cabeçalho; `visible` não se aplica. */
  quick?: TableQuickFilters
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
  /** Clique na linha (fora de controles): sozinho substitui a seleção; Ctrl/Cmd alterna; Shift marca o intervalo. */
  onSelectRow: (id: string, mode: 'only' | 'toggle' | 'range') => void
  /** Clique direito na linha: menu de contexto com as ações da seleção (DS §10.9.3). */
  onRowContextMenu?: (id: string, event: MouseEvent<HTMLElement>) => void
  onToggleAll: () => void
  onOpen: (id: string) => void
  /** Devolve o `gridcell` completo da coluna (a primeira coluna é desenhada aqui, como botão que abre o serviço). */
  renderCell: (row: Row, column: Column) => ReactNode
  /** Colunas que não existem no FetchXML (virtuais): o menu do título não oferece ordenar. */
  unsortable?: ReadonlySet<string>
  /** Contêiner de rolagem (`.gr-grid`): é a raiz do observador que carrega mais linhas. */
  scrollRef?: RefObject<HTMLDivElement | null>
  /** Dentro do contêiner de rolagem, logo depois da última linha (o sentinela da rolagem infinita). */
  tail?: ReactNode
  footer: ReactNode
  empty: ReactNode
  /** Botão "Densidade das linhas" da `ViewBar`: `default` (confortável, 56 px) ou `dense` (44 px, o padrão da Geral). */
  density?: TableDensity
  /** Agrupamento no servidor: cabeçalhos recolhíveis com a contagem e as linhas de cada grupo aberto no lugar de `rows` na grade. */
  grouping?: Grouping
}

const rowId = (row: Row) => String(row[ID_ATTRIBUTE])
/** Grid editável com rolagem horizontal, seleção por linha e a primeira coluna fixa. As classes visuais são as da tabela do DS. */
export function GeralTable({ columns, attributes, rows, loading, sort, defaultSort, onSort, filteredKeys, quick, onClearFilter, onHide, customWidths, onResize, onMove, selected, onToggle, onSelectRow, onRowContextMenu, onToggleAll, onOpen, renderCell, unsortable, scrollRef, tail, footer, empty, density = 'dense', grouping }: Props) {
  // Trilhas crescem na proporção da largura da visão (fr) e nunca ficam abaixo do mínimo; a largura mínima total
  // garante que cabeçalho e linhas compartilhem as mesmas trilhas quando a soma dos mínimos excede o contêiner.
  // Sim/Não ocupa uma trilha fixa estreita: o conteúdo é um switch, não cresce com a tela.
  const BOOLEAN_WIDTH = 96
  // Durante o arraste a largura vive em `drag` e vai direto para o estilo da grade (um quadro por vez), sem renderizar a tabela; ao soltar é gravada nas preferências.
  const drag = useRef<{ key: string; start: number; drawn: number; x: number; width: number; frame: number; done: () => void } | null>(null)
  const [dropAt, setDropAt] = useState<{ key: string; after: boolean } | null>(null)
  const [announce, setAnnounce] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const refocus = useRef<string | null>(null)
  const pressing = useRef(false)
  useEffect(() => () => drag.current?.done(), [])
  // Coluna com o painel de filtro aberto (chave) e o cabeçalho que o ancora.
  const [filterAt, setFilterAt] = useState<string | null>(null)
  const filterAnchor = filterAt ? Array.from(root.current?.querySelectorAll<HTMLElement>('.bt-colhead') ?? []).find((b) => b.dataset.col === filterAt) ?? null : null
  const filterColumn = filterAt ? columns.find((c) => c.key === filterAt) : undefined
  const filterField = filterColumn && !filterColumn.alias ? quick?.fields.find((f) => f.key === filterColumn.attribute && !f.advancedOnly) : undefined
  const closeFilter = useCallback(() => setFilterAt(null), [])
  useEffect(() => {
    const key = refocus.current
    if (!key) return
    refocus.current = null
    const buttons = root.current?.querySelectorAll<HTMLElement>('.bt-colhead')
    buttons?.forEach((b) => { if (b.dataset.col === key) b.focus() })
  }, [columns])
  const widthOf = (c: Column) => (drag.current?.key === c.key ? drag.current.width : c.width)
  const isBoolean = (c: Column) => cellKind(c, attributes?.get(c.key)) === 'boolean'
  const isFixed = (c: Column) => drag.current?.key === c.key || customWidths?.[c.key] != null
  const track = (c: Column) => (isBoolean(c) ? `${BOOLEAN_WIDTH}px` : isFixed(c) ? `minmax(${widthOf(c)}px, ${widthOf(c)}px)` : `minmax(${Math.max(90, widthOf(c))}px, ${widthOf(c)}fr)`)
  const minOf = (c: Column) => (isBoolean(c) ? BOOLEAN_WIDTH : Math.max(90, widthOf(c)))
  const clampW = (w: number) => Math.min(1200, Math.max(90, Math.round(w)))
  const resizeDown = (column: Column) => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    pressing.current = true
    const handle = e.currentTarget
    const pointer = e.pointerId
    handle.setPointerCapture?.(pointer)
    // Esc devolve a largura de antes; o cursor de redimensionar vale na página inteira enquanto arrasta.
    const esc = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      resizeFinish(handle, pointer, false)
    }
    window.addEventListener('keydown', esc, true)
    document.documentElement.classList.add('gr-resizing')
    const done = () => { window.removeEventListener('keydown', esc, true); document.documentElement.classList.remove('gr-resizing') }
    // Mede a borda desenhada uma vez, ao apertar: trilhas `fr` ficam mais largas que a largura declarada (partir dela
    // fazia a borda fugir do cursor), e medir a cada movimento forçava um reflow por evento, logo depois do quadro anterior.
    const drawn = handle.parentElement?.getBoundingClientRect().width || column.width
    drag.current = { key: column.key, start: column.width, drawn, x: e.clientX, width: column.width, frame: 0, done }
  }
  const resizeMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.buttons === 0) return
    d.width = clampW(d.drawn + e.clientX - d.x)
    const grid = e.currentTarget.closest<HTMLElement>('.gr-grid')
    if (!grid || d.frame) return
    d.frame = requestAnimationFrame(() => {
      d.frame = 0
      const { cols, min } = layout()
      grid.style.setProperty('--gr-columns', cols)
      grid.style.setProperty('--gr-min-width', min)
    })
  }
  const resizeFinish = (handle: HTMLElement, pointer: number, commit: boolean) => {
    pressing.current = false
    const d = drag.current
    if (!d) return
    cancelAnimationFrame(d.frame)
    d.done()
    const changed = commit && d.width !== d.start
    if (!changed) drag.current = null
    // Grava no estilo a largura final (a mesma que o React renderiza depois de onResize) ou, sem mudança, a de antes.
    // Voltar sempre à de antes quebrava: se a tabela renderizou no meio do arraste, o React já tinha a largura final
    // como último estilo, não regravava ao soltar e a coluna voltava ao tamanho antigo.
    const grid = handle.closest<HTMLElement>('.gr-grid')
    if (grid) { const { cols, min } = layout(); grid.style.setProperty('--gr-columns', cols); grid.style.setProperty('--gr-min-width', min) }
    drag.current = null
    if (handle.hasPointerCapture?.(pointer)) handle.releasePointerCapture?.(pointer)
    if (changed) onResize(d.key, d.width)
  }
  const resizeEnd = (e: PointerEvent<HTMLDivElement>) => resizeFinish(e.currentTarget, e.pointerId, true)
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
    // Vale só para o commit desta tecla; se a ordem não mudar, o pedido expira e não rouba o foco depois.
    window.setTimeout(() => { refocus.current = null }, 0)
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
  const layout = () => ({ cols: `40px ${columns.map(track).join(' ')}`, min: `${40 + columns.reduce((sum, c) => sum + minOf(c), 0)}px` })
  const { cols, min } = layout()
  const style = { '--gr-columns': cols, '--gr-min-width': min } as CSSProperties
  const ids = rows.map((r) => String(r[ID_ATTRIBUTE]))
  const all = ids.length > 0 && ids.every((id) => selected.has(id))
  const some = !all && ids.some((id) => selected.has(id))
  // Clique em qualquer lugar da linha seleciona; botões, campos, o painel de um Select e a célula em edição ficam de fora.
  const rowClick = (id: string) => (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!event.currentTarget.contains(target)) return
    if (target.closest('button, input, select, textarea, a, label, [role="listbox"], [role="option"], [role="dialog"], .gr-cell--select, .gr-cell--editing')) return
    onSelectRow(id, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'only')
  }
  const skeleton = loading && rows.length === 0
  const shown = sort ?? defaultSort
  // Muitas linhas carregadas: só as perto da tela vão para o DOM; a grade rola em `.gr-grid`, abaixo do cabeçalho fixo.
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [headHeight, setHeadHeight] = useState(0)
  useLayoutEffect(() => {
    const grid = scrollRef?.current
    setScroller(grid ?? null)
    setHeadHeight(grid?.querySelector<HTMLElement>('.bt-table__head')?.offsetHeight ?? 0)
  }, [scrollRef])
  const groups = grouping?.groups ?? null
  const items = useMemo(() => groups
    ? groups.flatMap((group): Item[] => [
      { type: 'group', key: `g:${group.id}`, group },
      ...(group.open ? group.rows.map((row): Item => ({ type: 'row', key: rowId(row), row })) : []),
      ...(group.open && (group.loading || group.error || group.more || group.rows.length === 0) ? [{ type: 'foot', key: `t:${group.id}`, group } as Item] : []),
    ])
    : rows.map((row): Item => ({ type: 'row', key: rowId(row), row })), [groups, rows])
  const { visible, start, before, after, measure } = useVirtualRows(items, (item) => item.key, skeleton ? null : scroller, headHeight, density === 'minimal' ? 32 : density === 'dense' ? 44 : 56)
  const nothing = groups ? groups.length === 0 : rows.length === 0

  return (
    <div ref={root} className={['bt-table gr-table brand-loader-host', density === 'default' && 'gr-table--confortavel', density === 'minimal' && 'gr-table--minima', !loading && nothing && 'gr-table--empty'].filter(Boolean).join(' ')}>
      <span className="gr-sr" role="status">{announce}</span>
      <div ref={scrollRef} className="gr-grid" role="grid" aria-label="Serviços" aria-busy={loading || undefined} aria-colcount={columns.length + 1} aria-rowcount={measure ? items.length + 1 : undefined} style={style}>
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
            return (
              <div
                key={column.key}
                className={`${index === 0 ? 'bt-table__cell gr-cell--first' : 'bt-table__cell'}${dropAt?.key === column.key ? (dropAt.after ? ' gr-drop--after' : ' gr-drop--before') : ''}`}
                role="columnheader"
                data-col={column.key}
                aria-label={label}
                title={label}
                aria-sort={active ? (shown?.descending ? 'descending' : 'ascending') : 'none'}
                draggable
                onDragStart={(e) => { if (pressing.current || (e.target as HTMLElement).closest?.('.gr-resize')) { e.preventDefault(); return } e.dataTransfer.setData('text/x-gr-column', column.key); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={dragOver(column)}
                onDragLeave={(e) => { if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return; setDropAt((d) => (d?.key === column.key ? null : d)) }}
                onDrop={dropOn(column, index)}
                onDragEnd={() => setDropAt(null)}
              >
                <div className="gr-head">
                  <ColumnMenu
                    label={label}
                    columnKey={column.key}
                    sortIcon={active ? (shown?.descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />) : null}
                    sortable={!unsortable?.has(column.key)}
                    filterable={!column.alias && Boolean(quick?.fields.some((f) => f.key === column.attribute && !f.advancedOnly))}
                    filtered={!column.alias && filteredKeys.includes(column.attribute)}
                    canHide={columns.length > 1}
                    onSort={(descending) => onSort({ attribute: column.attribute, alias: column.alias, descending })}
                    group={grouping?.menu(column)}
                    onFilter={() => setFilterAt(column.key)}
                    onClearFilter={() => onClearFilter(column.attribute)}
                    onHide={() => onHide(column.key)}
                    onKeyDown={moveKey(column, index)}
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
          ? (
            <div className="bt-table__row gr-table__loading" role="row">
              <div role="gridcell"><BrandLoader variant="inline" label="Carregando serviços" text="Carregando serviços…" /></div>
            </div>
          )
          : <>{before ? <div aria-hidden="true" style={{ height: before }} /> : null}{visible.map((item, offset) => {
            if (item.type === 'group') {
              const { group } = item
              return (
                <div key={item.key} ref={measure} data-index={start + offset} aria-rowindex={measure ? start + offset + 2 : undefined} className="bt-table__row gr-grouprow" role="row">
                  <div role="gridcell" aria-colspan={columns.length + 1}>
                    <button type="button" className="bt-groups__toggle" aria-expanded={group.open} onClick={() => grouping?.onToggle(group.id)}>
                      <span className={group.open ? 'bt-groups__chevron gr-grouprow__chevron is-open' : 'bt-groups__chevron gr-grouprow__chevron'} aria-hidden="true"><ChevronRight size={16} /></span>
                      <span className="bt-groups__label">{group.label}</span>
                      <span className="bt-groups__count" aria-label={`${group.count} ${group.count === 1 ? 'serviço' : 'serviços'}`}>{group.count}</span>
                    </button>
                  </div>
                </div>
              )
            }
            if (item.type === 'foot') {
              const { group } = item
              return (
                <div key={item.key} ref={measure} data-index={start + offset} aria-rowindex={measure ? start + offset + 2 : undefined} className="bt-table__row gr-grouprow gr-grouprow--foot" role="row">
                  <div role="gridcell" aria-colspan={columns.length + 1} className="gr-grouprow__foot">
                    <LoadSentinel root={scrollRef ?? null} active={group.more && !group.loading && !group.error} loaded={group.rows.length} onLoadMore={() => grouping?.onLoadMore(group.id)} />
                    {group.loading ? <><Spinner size={16} label={`Carregando ${group.label}`} /><span>Carregando…</span></> : null}
                    {group.error ? <Alert tone="danger" className="gr-loadmore__error" action={<Button variant="secondary" size="compact" onClick={() => grouping?.onRetry(group.id)}>Tentar novamente</Button>}>{group.error}</Alert> : null}
                    {!group.loading && !group.error && group.rows.length === 0 && !group.more ? <span>Nenhum serviço neste grupo</span> : null}
                  </div>
                </div>
              )
            }
            const { row } = item
            const id = String(row[ID_ATTRIBUTE])
            const isSelected = selected.has(id)
            return (
              <div key={id} ref={measure} data-index={start + offset} aria-rowindex={measure ? start + offset + 2 : undefined} className={isSelected ? 'bt-table__row is-selected' : 'bt-table__row'} role="row" aria-selected={isSelected} onClick={rowClick(id)} onContextMenu={onRowContextMenu ? (event) => onRowContextMenu(id, event) : undefined}>
                <div className="bt-table__cell gr-cell--select" role="gridcell">
                  <Checkbox label={<span className="gr-sr">Selecionar serviço {formatCell('readonly', row, 'cr40f_id')}</span>} checked={isSelected} onChange={() => onToggle(id)} />
                </div>
                {columns.map((column, index) => {
                  if (index > 0) return <Fragment key={column.key}>{renderCell(row, column)}</Fragment>
                  const info = attributes?.get(column.key)
                  const raw = row[rowKey(column, info)]
                  const value = formatCell('readonly', row, rowKey(column, info))
                  return (
                    <div key={column.key} className="bt-table__cell gr-cell gr-cell--first" role="gridcell">
                      <button type="button" className="gr-open" aria-label={`Abrir serviço ${value} no Formulário Geral`} onClick={() => onOpen(id)}>{isBadgeValue(column, raw) && value !== '' ? <ChoiceBadge column={column} info={info} raw={raw} text={value} /> : value}</button>
                    </div>
                  )
                })}
              </div>
            )
          })}{after ? <div aria-hidden="true" style={{ height: after }} /> : null}</>}
        {tail}
      </div>
      {!loading && nothing && empty != null ? <div className="bt-table__empty gr-empty">{empty}</div> : null}
      <div className="bt-table__footer">{footer}</div>
      {/* Recarga com a lista na tela: véu só sobre a tabela; filtros e menu continuam livres. */}
      {loading && rows.length > 0 ? <BrandLoader label="Atualizando serviços" /> : null}
      {quick && filterField && filterAnchor ? (
        <ColumnFilter anchor={filterAnchor} field={filterField} value={quick.value[filterField.key]} search={quick.search} onChange={(condition) => quick.onChange(filterField.key, condition)} onClose={closeFilter} />
      ) : null}
    </div>
  )
}
