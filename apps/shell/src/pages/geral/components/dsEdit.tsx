import { useEffect, useRef } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Input, Select, Textarea, type SelectOption, type TableCellEdit, type TableCellStatus, type TableEditorProps } from '@betinhos/ui'
import { MOTORISTA_TITLE } from '../domain/cells'
import type { EditValue } from '../domain/edit'
import { decideChoice, decideCommit, draftOf, lookupOptions, sameId, type PickedOption } from '../domain/editing'
import { formatCell } from '../domain/format'
import { rowKey } from '../domain/layout'
import type { AttributeInfo, CellKind, CellStatus, Column, LookupOption } from '../domain/types'
import { useLookupSearch } from './useLookupSearch'

/**
 * Edição na célula da Geral no `Table` do DS (§10.9.5), parte 2 da migração. As regras de cada tipo são as do grid
 * próprio (`domain/editing.ts`); aqui elas viram `column.edit`. Gravar continua com a tela (`save`), e o andamento volta
 * por `cellStatus`.
 */

/** Rascunho dos campos de digitação; `bad` é o `validity.badInput` do navegador (data pela metade). */
export type TextDraft = { text: string; bad: boolean }

export type EditDeps = {
  /** Grava; o andamento chega por `cells`. */
  save: (id: string, column: Column, value: EditValue) => void
  search: (attribute: string, text: string) => Promise<LookupOption[]>
}

const typing = (kind: CellKind) => kind === 'text' || kind === 'memo' || kind === 'money'

function TextEditor({ kind, props }: { kind: CellKind; props: TableEditorProps<TextDraft> }) {
  const { draft, setDraft, error, label } = props
  const change = (event: { target: HTMLInputElement | HTMLTextAreaElement }) => setDraft({ text: event.target.value, bad: 'validity' in event.target && event.target.validity.badInput })
  if (kind === 'memo') return <Textarea rows={3} value={draft.text} aria-label={label} invalid={error != null} onChange={change} />
  if (kind === 'money') return <Input size="compact" inputMode="decimal" prefix="R$" value={draft.text} aria-label={label} invalid={error != null} onChange={change} />
  if (kind === 'datetime') return <Input size="compact" type="datetime-local" value={draft.text} aria-label={label} invalid={error != null} onChange={change} />
  return <Input size="compact" value={draft.text} aria-label={label} invalid={error != null} onChange={change} />
}

/** Escolha e relação: gravam ao escolher; o painel abre já ao entrar em edição, como no grid próprio. */
function ChoiceEditor({ kind, column, info, current, search, props }: { kind: CellKind; column: Column; info: AttributeInfo | undefined; current: PickedOption | null; search: EditDeps['search']; props: TableEditorProps<string | null> }) {
  const lookup = useLookupSearch((text) => search(column.attribute, text))
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { trigger.current?.click() }, [])
  let options: SelectOption[]
  if (kind === 'choice') {
    const list = (info?.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))
    options = current && !list.some((o) => o.value === current.value) ? [current, ...list] : list
  } else options = lookup.found ? lookupOptions(lookup.found, current) : current ? [current] : []
  const select = (
    <Select
      ref={trigger}
      size="compact"
      aria-label={props.label}
      options={options}
      value={props.draft}
      searchable={kind === 'lookup'}
      clearable={kind === 'lookup'}
      loading={lookup.searching}
      onSearchChange={kind === 'lookup' ? lookup.onSearch : undefined}
      // O rótulo da opção vai junto: a relação grava id e nome.
      onChange={(value) => props.commit(value == null ? null : `${value}\u0000${options.find((o) => o.value === value)?.label ?? value}`)}
    />
  )
  return column.attribute === 'cr40f_motorista' && !column.alias ? <div title={MOTORISTA_TITLE}>{select}</div> : select
}

/** `column.edit` da coluna, ou `undefined` quando o tipo não edita na célula (só leitura e Sim/Não, que é um switch). */
export function editOf(kind: CellKind, column: Column, info: AttributeInfo | undefined, deps: EditDeps, idOf: (row: Row) => string): TableCellEdit<Row, unknown> | undefined {
  const key = rowKey(column, info)
  if (kind === 'choice' || kind === 'lookup') {
    const current = (row: Row): PickedOption | null => { const raw = row[key]; return raw == null || raw === '' ? null : { value: String(raw), label: formatCell(kind, row, key) } }
    const edit: TableCellEdit<Row, string | null> = {
      start: (row) => current(row)?.value ?? null,
      editor: (row, props) => <ChoiceEditor kind={kind} column={column} info={info} current={current(row)} search={deps.search} props={props} />,
      commit: (row, draft) => {
        // Sair sem escolher só fecha; a escolha chega com o rótulo (`valor\0rótulo`).
        if (draft === current(row)?.value) return
        const [value, label] = draft == null ? [null, ''] : draft.split('\u0000')
        if (kind === 'lookup' && value != null && sameId(value, row[key])) return
        const decision = decideChoice(kind, value, row[key], label ?? '')
        if (decision) deps.save(idOf(row), column, decision.submit)
      },
    }
    return edit as TableCellEdit<Row, unknown>
  }
  if (kind === 'text' || kind === 'memo' || kind === 'money' || kind === 'datetime') {
    const edit: TableCellEdit<Row, TextDraft> = {
      typing: typing(kind),
      start: (row, typed) => ({ text: typed ?? draftOf(kind, row, key), bad: false }),
      editor: (_row, props) => <TextEditor kind={kind} props={props} />,
      commit: (row, draft) => {
        const decision = decideCommit(kind, draft.text, row[key], draft.bad)
        if (decision && 'error' in decision) return decision.error
        if (decision) deps.save(idOf(row), column, decision.submit)
      },
    }
    return edit as TableCellEdit<Row, unknown>
  }
  return undefined
}

/** Andamento da Geral (`CellStatus`) no formato do DS; `onRetry` regrava o último valor tentado. */
export function statusOf(status: CellStatus | undefined, retry?: () => void): TableCellStatus | null {
  if (!status || status.kind === 'idle') return null
  if (status.kind === 'saving') return { state: 'saving' }
  if (status.kind === 'saved') return { state: 'saved' }
  return { state: 'error', message: status.message, ...(retry ? { onRetry: retry } : {}) }
}
