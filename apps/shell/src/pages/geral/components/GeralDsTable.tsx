import { useCallback, useMemo, useRef, type MouseEvent, type ReactNode, type Ref } from 'react'
import type { Row } from '@betinhos/dataverse'
import { LookupCell, Switch, Table, type TableColumn, type TableQuickFilters, type TableViewState } from '@betinhos/ui'
import { BrandLoader } from '../../../app/BrandLoader'
import { cellKind, isBadgeValue, lookupTarget, readonlyHint } from '../domain/cells'
import { toConfigKey } from '../domain/extraLinks'
import { formatCell } from '../domain/format'
import { MIN_WIDTH } from '../domain/columns'
import { columnLabel, rowKey } from '../domain/layout'
import type { EditValue } from '../domain/edit'
import { isProtegido } from '../domain/protecao'
import { ID_ATTRIBUTE, type AttributeInfo, type AttributeMap, type CellStatus, type Column, type LookupOption } from '../domain/types'
import { cellKey } from '../useGeral'
import { ChoiceBadge } from './ChoiceBadge'
import { editOf, statusOf } from './dsEdit'
import { ProtecaoLock } from './ProtecaoLock'

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
  /** Edição na célula (parte 2). Sem ela, ou com `editable` falso (metadata ainda chegando), as células ficam só leitura. */
  edit?: {
    editable: boolean
    /** Andamento de cada célula (`cellKey(id, atributo)`), o mesmo do grid próprio. */
    cells: ReadonlyMap<string, CellStatus>
    save: (id: string, column: Column, value: EditValue) => Promise<boolean>
    reset: (id: string, attribute: string) => void
    search: (attribute: string, text: string) => Promise<LookupOption[]>
  }
}

const BOOLEAN_WIDTH = 96

const rowId = (row: Row) => String(row[ID_ATTRIBUTE])

/** Valor da célula fora da edição. Sim/Não é um switch que grava no clique (`onToggle`); sem ele, texto. */
function ReadValue({ row, column, info, onToggle, busy }: { row: Row; column: Column; info: AttributeInfo | undefined; onToggle?: (value: boolean) => void; busy?: boolean }) {
  const key = rowKey(column, info)
  const kind = cellKind(column, info)
  const raw = row[key]
  const text = formatCell(kind, row, key)
  if (kind === 'boolean') {
    if (onToggle) return <Switch label={null} aria-label={columnLabel(column, info)} checked={raw === true} disabled={busy} onChange={(event) => onToggle(event.target.checked)} />
    return <span className="gr-cell__value">{raw === true ? 'Sim' : raw === false ? 'Não' : ''}</span>
  }
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
export function GeralDsTable({ columns, extraKeys, attributes, rows, loading, view, quickFilters, selected, onSelectionChange, onOpen, onRowContextMenu, virtualKeys, special, scrollRef, afterRows, footer, empty, edit }: Props) {
  // Último valor tentado por célula: "Tentar de novo" regrava esse valor.
  const tried = useRef(new Map<string, EditValue>())
  const editing = edit?.editable ? edit : null
  const save = useCallback((id: string, column: Column, value: EditValue) => {
    if (!editing) return
    tried.current.set(cellKey(id, column.attribute), value)
    void editing.save(id, column, value).catch(() => undefined)
  }, [editing])
  const tableColumns = useMemo(() => columns.map((column, index): TableColumn<Row> => {
    const info = attributes?.get(column.key)
    const label = columnLabel(column, info)
    const kind = cellKind(column, info)
    const virtual = virtualKeys.has(column.key)
    const busy = (row: Row) => editing?.cells.get(cellKey(rowId(row), column.attribute))?.kind === 'saving'
    const onToggle = editing && kind === 'boolean' && !virtual ? (row: Row) => (value: boolean) => save(rowId(row), column, value) : null
    return {
      edit: editing && !virtual ? editOf(kind, column, info, { save, search: editing.search }, rowId) : undefined,
      readOnly: editing && !virtual && kind === 'readonly' ? (readonlyHint(column) ?? true) : undefined,
      key: extraKeys.has(column.key) ? toConfigKey(column.key) : column.key,
      header: label,
      label,
      // Como no grid próprio: Sim/Não tem largura fixa e as demais, no mínimo 90 px.
      defaultWidth: kind === 'boolean' ? BOOLEAN_WIDTH : Math.max(MIN_WIDTH, column.width),
      sortable: !virtualKeys.has(column.key),
      opens: index === 0,
      // Cada célula leva o id do serviço: o clique direito acha o serviço pela linha clicada (a ordem é da visão).
      cell: (row) => (
        <span className="gr-ds__cell" data-row-id={rowId(row)}>
          {special(row, column) ?? <ReadValue row={row} column={column} info={info} onToggle={onToggle?.(row)} busy={busy(row)} />}
          {!virtual && isProtegido(row, column) ? <ProtecaoLock id={rowId(row)} attribute={column.attribute} label={label} atual={formatCell(kind, row, rowKey(column, info))} info={info} /> : null}
        </span>
      ),
    }
  }), [columns, extraKeys, attributes, virtualKeys, special, editing, save])
  const byKey = useMemo(() => new Map(columns.map((c) => [extraKeys.has(c.key) ? toConfigKey(c.key) : c.key, c])), [columns, extraKeys])
  const cellStatus = useCallback((row: Row, key: string) => {
    const column = byKey.get(key)
    if (!editing || !column) return null
    const id = rowId(row)
    const at = cellKey(id, column.attribute)
    const retry = () => {
      editing.reset(id, column.attribute)
      if (tried.current.has(at)) save(id, column, tried.current.get(at) ?? null)
    }
    return statusOf(editing.cells.get(at), retry)
  }, [byKey, editing, save])
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
      cellStatus={cellStatus}
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
