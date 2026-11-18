import { useCallback, useMemo, type MouseEvent, type ReactNode, type Ref } from 'react'
import type { Row } from '@betinhos/dataverse'
import { LookupCell, Table, type TableColumn, type TableQuickFilters, type TableViewState } from '@betinhos/ui'
import { BrandLoader } from '../../../app/BrandLoader'
import { cellKind, isBadgeValue, lookupTarget, readonlyHint } from '../domain/cells'
import { toConfigKey } from '../domain/extraLinks'
import { formatCell } from '../domain/format'
import { columnLabel, rowKey } from '../domain/layout'
import { ID_ATTRIBUTE, type AttributeInfo, type AttributeMap, type Column } from '../domain/types'
import { ChoiceBadge } from './ChoiceBadge'

type Props = {
  /** Todas as colunas da visão (as ocultas também): quem decide o que aparece, a ordem, as larguras e as fixas é a visão. */
  columns: Column[]
  /** Chaves das colunas adicionadas pelo painel (`x__…`), que na visão usam a chave `x:`. */
  extraKeys: ReadonlySet<string>
  attributes: AttributeMap | null
  rows: Row[]
  loading: boolean
  /** Estado de visão da `ViewBar` (`useGeralViewState`): ordenar, ocultar, mover, redimensionar e fixar passam por ele. */
  view: TableViewState
  quickFilters: TableQuickFilters
  selected: ReadonlySet<string>
  onSelectionChange: (next: Set<string>) => void
  onOpen: (id: string) => void
  /** Clique direito: o menu da própria Geral (as ações saem da seleção depois que a linha clicada entra nela). */
  onRowContextMenu: (id: string, event: MouseEvent<HTMLElement>) => void
  /** Colunas virtuais (não existem no FetchXML): sem ordenar nem filtrar pelo título. */
  virtualKeys: ReadonlySet<string>
  /** Conteúdo das colunas virtuais (Comprovantes, Portal); `undefined` nas demais. */
  special: (row: Row, column: Column) => ReactNode | undefined
  scrollRef?: Ref<HTMLDivElement>
  afterRows?: ReactNode
  footer?: ReactNode
  empty?: ReactNode
}

const rowId = (row: Row) => String(row[ID_ATTRIBUTE])

/** Valor da célula só para leitura (a edição na célula entra na parte 2 da migração). */
function ReadValue({ row, column, info }: { row: Row; column: Column; info: AttributeInfo | undefined }) {
  const key = rowKey(column, info)
  const kind = cellKind(column, info)
  const raw = row[key]
  const text = formatCell(kind, row, key)
  if (kind === 'boolean') return <span className="gr-cell__value">{raw === true ? 'Sim' : raw === false ? 'Não' : ''}</span>
  if (isBadgeValue(column, raw) && text !== '') return <ChoiceBadge column={column} info={info} raw={raw} text={text} />
  const target = kind === 'lookup' || kind === 'readonly' ? lookupTarget(row, key, info) : null
  if (target && text !== '') return <span className="gr-cell__value" title={text}><LookupCell table={target.table} id={target.id}>{text}</LookupCell></span>
  if (typeof raw === 'string' && /^https?:\/\//i.test(raw) && column.attribute === 'new_linkdovoucher') return <a className="gr-cell__value" href={raw} target="_blank" rel="noreferrer" title={text}>{text}</a>
  const hint = kind === 'readonly' ? readonlyHint(column) : null
  return <span className="gr-cell__value" title={hint ? `${text}\n${hint}` : text}>{text}</span>
}

/**
 * Grade da Geral no `Table` do Design System (§10.9), atrás de `?tabela=ds` enquanto a migração anda em partes.
 * Parte 1: colunas dos metadados, seleção, clique direito, ordenar/filtrar/ocultar/mover/redimensionar/fixar pelo
 * título e virtualização, com a tabela ocupando a altura da tela (`fill`) e rolando por dentro. Células só leitura; a primeira coluna abre o serviço.
 */
export function GeralDsTable({ columns, extraKeys, attributes, rows, loading, view, quickFilters, selected, onSelectionChange, onOpen, onRowContextMenu, virtualKeys, special, scrollRef, afterRows, footer, empty }: Props) {
  const tableColumns = useMemo(() => columns.map((column, index): TableColumn<Row> => {
    const info = attributes?.get(column.key)
    const label = columnLabel(column, info)
    return {
      key: extraKeys.has(column.key) ? toConfigKey(column.key) : column.key,
      header: label,
      label,
      defaultWidth: column.width,
      sortable: !virtualKeys.has(column.key),
      opens: index === 0,
      // Cada célula leva o id do serviço: o clique direito acha o serviço pela linha clicada (a ordem é da visão).
      cell: (row) => <span className="gr-ds__cell" data-row-id={rowId(row)}>{special(row, column) ?? <ReadValue row={row} column={column} info={info} />}</span>,
    }
  }), [columns, extraKeys, attributes, virtualKeys, special])
  // Filtro pelo título só nas colunas da própria tabela: o campo do filtro tem a chave do atributo.
  const quick = useMemo<TableQuickFilters>(() => ({ ...quickFilters, fields: quickFilters.fields.filter((f) => !virtualKeys.has(f.key)) }), [quickFilters, virtualKeys])

  const contextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    const id = (event.target as Element).closest('.bt-table__row')?.querySelector<HTMLElement>('[data-row-id]')?.dataset.rowId
    if (id) onRowContextMenu(id, event)
  }, [onRowContextMenu])

  return (
    <Table<Row>
      className="gr-ds"
      aria-label="Serviços"
      columns={tableColumns}
      rows={rows}
      rowKey={rowId}
      loading={loading}
      loadingContent={<BrandLoader variant="inline" label="Carregando serviços" text="Carregando serviços…" />}
      // Como no grid próprio: a largura do layout é o mínimo e a coluna cresce com a tela (`fluid`); sem espaço, rola para o lado.
      view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true, fluid: true }}
      quickFilters={quick}
      selection={{ selected, onChange: onSelectionChange, label: (row) => `Selecionar serviço ${formatCell('readonly', row, 'cr40f_id')}` }}
      onRowClick={(row) => onOpen(rowId(row))}
      // O menu do DS fica desligado (`[]`): o clique direito sobe até a tabela e abre o menu da Geral.
      rowActions={() => []}
      onContextMenu={contextMenu}
      density="dense"
      columnLines
      fill
      virtual
      scrollRef={scrollRef}
      afterRows={afterRows}
      footer={footer}
      empty={empty}
    />
  )
}
