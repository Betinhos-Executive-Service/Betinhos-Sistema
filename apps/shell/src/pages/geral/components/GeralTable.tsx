import { Fragment, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Checkbox } from '@betinhos/ui'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cellKind } from '../domain/cells'
import { columnLabel, rowKey } from '../domain/layout'
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
export function GeralTable({ columns, attributes, rows, loading, sort, defaultSort, onSort, selected, onToggle, onToggleAll, onOpen, renderCell, scrollRef, tail, footer, empty }: Props) {
  // Trilhas crescem na proporção da largura da visão (fr) e nunca ficam abaixo do mínimo; a largura mínima total
  // garante que cabeçalho e linhas compartilhem as mesmas trilhas quando a soma dos mínimos excede o contêiner.
  // Sim/Não ocupa uma trilha fixa estreita: o conteúdo é um switch, não cresce com a tela.
  const BOOLEAN_WIDTH = 96
  const track = (c: Column) => (cellKind(c, attributes?.get(c.key)) === 'boolean' ? `${BOOLEAN_WIDTH}px` : `minmax(${Math.max(90, c.width)}px, ${c.width}fr)`)
  const minOf = (c: Column) => (cellKind(c, attributes?.get(c.key)) === 'boolean' ? BOOLEAN_WIDTH : Math.max(90, c.width))
  const minTotal = 40 + columns.reduce((sum, c) => sum + minOf(c), 0)
  const style = { '--gr-columns': `40px ${columns.map(track).join(' ')}`, '--gr-min-width': `${minTotal}px` } as CSSProperties
  const ids = rows.map((r) => String(r[ID_ATTRIBUTE]))
  const all = ids.length > 0 && ids.every((id) => selected.has(id))
  const some = !all && ids.some((id) => selected.has(id))
  const skeleton = loading && rows.length === 0
  const shown = sort ?? defaultSort

  return (
    <div className="bt-table gr-table">
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
            return (
              <div key={column.key} className={index === 0 ? 'bt-table__cell gr-cell--first' : 'bt-table__cell'} role="columnheader" title={label} aria-sort={active ? (shown?.descending ? 'descending' : 'ascending') : 'none'}>
                <button type="button" className="gr-head__sort" onClick={() => onSort(nextSort(sort, defaultSort, column))}>
                  <span className="gr-head__label">{label}</span>
                  {active ? (shown?.descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />) : null}
                </button>
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
