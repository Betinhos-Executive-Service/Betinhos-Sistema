import { useEffect, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Button, Field, Input, Select, Sheet, Switch, Textarea } from '@betinhos/ui'
import { cellKind } from '../domain/cells'
import type { EditValue } from '../domain/edit'
import { decideChoice, decideCommit, draftOf, lookupOptions, type PickedOption } from '../domain/editing'
import { formatCell } from '../domain/format'
import { columnLabel, rowKey } from '../domain/layout'
import type { AttributeInfo, AttributeMap, CellStatus, Column, LookupOption } from '../domain/types'
import { useLookupSearch } from './useLookupSearch'

type Props = {
  row: Row
  /** Colunas visíveis da visão: a sheet edita só o que a visão mostra. */
  columns: Column[]
  attributes: AttributeMap | null
  /** Estado de gravação da célula do atributo, na linha aberta. */
  cellStatus: (attribute: string) => CellStatus
  open: boolean
  onClose: () => void
  /** Grava o valor; devolve `false` quando falhou (o erro chega por `cellStatus`). */
  onSave: (column: Column, value: EditValue) => Promise<boolean>
  onReset: (column: Column) => void
  search: (column: Column, text: string) => Promise<LookupOption[]>
}

type FieldProps = {
  row: Row
  column: Column
  info: AttributeInfo | undefined
  status: CellStatus
  onSave: (value: EditValue) => Promise<boolean>
  onReset: () => void
  search: (text: string) => Promise<LookupOption[]>
}

/** Um campo da sheet: mesmos controles da célula, em tamanho de toque, gravando ao sair do controle ou ao escolher. */
function SheetField({ row, column, info, status, onSave, onReset, search }: FieldProps) {
  const key = rowKey(column, info)
  const kind = cellKind(column, info)
  const raw = row[key]
  const text = formatCell(kind, row, key)
  const label = columnLabel(column, info)

  const [draft, setDraft] = useState(() => draftOf(kind, row, key))
  const [localError, setLocalError] = useState<string | null>(null)
  const lookup = useLookupSearch(search)
  const lastRef = useRef<EditValue>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // O valor gravado (ou revertido por erro) volta para o controle; digitar não passa por aqui.
  useEffect(() => { setDraft(draftOf(kind, row, key)); setLocalError(null) }, [kind, key, raw]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (value: EditValue) => { lastRef.current = value; void onSave(value).catch(() => undefined) }
  const message = localError ?? (status.kind === 'error' ? status.message : null)
  const hint = status.kind === 'saving' ? 'Gravando…' : status.kind === 'saved' ? 'Salvo ✓' : undefined

  const commit = () => {
    const decision = decideCommit(kind, draft, raw, inputRef.current?.validity.badInput === true)
    if (decision && 'error' in decision) setLocalError(decision.error)
    else if (decision) submit(decision.submit)
  }

  const onType = (event: { target: { value: string } }) => { setDraft(event.target.value); setLocalError(null) }
  const onEnter = (event: { key: string; currentTarget: HTMLElement; nativeEvent: { isComposing: boolean } }) => {
    // Enter sai do campo e o blur grava: um único caminho de gravação.
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur()
  }

  const retry = () => {
    onReset()
    setLocalError(null)
    submit(lastRef.current)
  }

  const current: PickedOption | null = raw == null || raw === '' ? null : { value: String(raw), label: text }
  const lookupList = lookupOptions(lookup.found, current)
  const choose = (value: string | null) => {
    setLocalError(null)
    const decision = decideChoice(kind, value, raw, lookupList.find((o) => o.value === value)?.label ?? '')
    if (decision) submit(decision.submit)
  }

  let control
  if (kind === 'text') control = <Input size="touch" value={draft} onChange={onType} onBlur={commit} onKeyDown={onEnter} />
  else if (kind === 'money') control = <Input size="touch" inputMode="decimal" prefix="R$" value={draft} onChange={onType} onBlur={commit} onKeyDown={onEnter} />
  else if (kind === 'datetime') control = <Input ref={inputRef} size="touch" type="datetime-local" value={draft} onChange={onType} onBlur={commit} onKeyDown={onEnter} />
  else if (kind === 'memo') control = <Textarea rows={3} value={draft} onChange={onType} onBlur={commit} />
  else if (kind === 'choice') {
    const list = (info?.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))
    const options = current && !list.some((o) => o.value === current.value) ? [current, ...list] : list
    control = <Select size="touch" options={options} value={current?.value ?? null} searchable={false} clearable={false} onChange={choose} />
  } else if (kind === 'lookup') {
    control = <Select size="touch" options={lookupList} value={current?.value ?? null} searchable clearable loading={lookup.searching} onSearchChange={lookup.onSearch} onChange={choose} />
  }

  const retryButton = status.kind === 'error' ? <Button variant="ghost" size="touch" onClick={retry}>Tentar de novo</Button> : null

  if (kind === 'boolean') {
    return (
      <div className="gr-sheet__field">
        <Switch
          label={label}
          checked={raw === true}
          disabled={status.kind === 'saving'}
          onChange={(event) => { setLocalError(null); submit(event.target.checked) }}
        />
        {hint ? <p className="bt-field__hint">{hint}</p> : null}
        {message ? <p className="bt-field__error" role="alert"><span>{message}</span></p> : null}
        {retryButton}
      </div>
    )
  }

  return (
    <div className="gr-sheet__field">
      <Field label={label} hint={hint} error={message ?? undefined}>{control}</Field>
      {retryButton}
    </div>
  )
}

/** Edição dos campos do serviço no celular: um campo por coluna editável da visão, gravado campo a campo. */
export function GeralSheet({ row, columns, attributes, cellStatus, open, onClose, onSave, onReset, search }: Props) {
  const name = formatCell('readonly', row, 'cr40f_id')
  return (
    <Sheet open={open} onClose={onClose} eyebrow="Editar campos" expandLabel="Ver todos os campos" title={`Serviço ${name}`}>
      <div className="gr-sheet">
        {columns.map((column) => {
          if (!column.alias && column.attribute === 'cr40f_id') return null
          const info = attributes?.get(column.key)
          if (cellKind(column, info) === 'readonly') {
            return (
              <p key={column.key} className="gr-sheet__line">
                <span>{columnLabel(column, info)}</span>
                <strong>{formatCell('readonly', row, rowKey(column, info))}</strong>
              </p>
            )
          }
          return (
            <SheetField
              key={column.key}
              row={row}
              column={column}
              info={info}
              status={cellStatus(column.attribute)}
              onSave={(value) => onSave(column, value)}
              onReset={() => onReset(column)}
              search={(text) => search(column, text)}
            />
          )
        })}
      </div>
    </Sheet>
  )
}
