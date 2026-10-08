import { useEffect, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Button, Field, Input, Select, Sheet, Switch, Textarea, type SelectOption } from '@betinhos/ui'
import { cellKind } from '../domain/cells'
import type { EditValue } from '../domain/edit'
import { formatCell, parseMoney, toDateTimeLocal } from '../domain/format'
import { columnLabel, rowKey } from '../domain/layout'
import type { AttributeInfo, AttributeMap, CellStatus, Column, LookupOption } from '../domain/types'

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

const SEARCH_DELAY_MS = 250
const moneyInput = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
const sameId = (a: unknown, b: unknown) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase()

function draftOf(kind: string, raw: unknown) {
  if (raw == null) return ''
  if (kind === 'money') return typeof raw === 'number' ? moneyInput.format(raw) : ''
  if (kind === 'datetime') return toDateTimeLocal(String(raw))
  return String(raw)
}

/** Um campo da sheet: mesmos controles da célula, em tamanho de toque, gravando ao sair do controle ou ao escolher. */
function SheetField({ row, column, info, status, onSave, onReset, search }: FieldProps) {
  const key = rowKey(column, info)
  const kind = cellKind(column, info)
  const raw = row[key]
  const text = formatCell(kind, row, key)
  const label = columnLabel(column, info)

  const [draft, setDraft] = useState(() => draftOf(kind, raw))
  const [localError, setLocalError] = useState<string | null>(null)
  const [found, setFound] = useState<SelectOption[] | null>(null)
  const [searching, setSearching] = useState(false)
  const lastRef = useRef<EditValue>(null)
  const timerRef = useRef(0)
  const tokenRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // O valor gravado (ou revertido por erro) volta para o controle; digitar não passa por aqui.
  useEffect(() => { setDraft(draftOf(kind, raw)); setLocalError(null) }, [kind, raw])
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const submit = (value: EditValue) => { lastRef.current = value; void onSave(value).catch(() => undefined) }
  const message = localError ?? (status.kind === 'error' ? status.message : null)
  const hint = status.kind === 'saving' ? 'Gravando…' : status.kind === 'saved' ? 'Salvo ✓' : undefined

  const commit = () => {
    switch (kind) {
      case 'text': case 'memo': {
        const before = raw == null ? '' : String(raw)
        if (draft.trim() !== before.trim()) submit(draft)
        return
      }
      case 'money': {
        const typed = draft.trim()
        if (typed === '') { if (raw != null) submit(null); return }
        const value = parseMoney(typed)
        if (value == null) { setLocalError('Valor inválido.'); return }
        if (value !== raw) submit(value)
        return
      }
      case 'datetime': {
        // Data pela metade (campo do navegador incompleto) chega como '' e apagaria o valor.
        if (inputRef.current?.validity.badInput) { setLocalError('Data ou hora inválida.'); return }
        if (draft !== toDateTimeLocal(raw == null ? null : String(raw))) submit(draft)
        return
      }
    }
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

  const current: SelectOption | null = raw == null || raw === '' ? null : { value: String(raw), label: text }
  const choose = (value: string | null) => {
    setLocalError(null)
    if (kind === 'choice') {
      if (value != null && Number(value) !== raw) submit(Number(value))
    } else if (value == null) {
      if (raw != null) submit(null)
    } else if (!sameId(value, raw)) {
      submit({ id: value, nome: found?.find((o) => o.value === value)?.label ?? '' })
    }
  }

  const onSearch = (typed: string) => {
    window.clearTimeout(timerRef.current)
    const run = () => {
      const token = ++tokenRef.current
      setSearching(true)
      search(typed).then(
        (list) => { if (token === tokenRef.current) { setFound(list.map((o) => ({ value: o.id, label: o.nome }))); setSearching(false) } },
        () => { if (token === tokenRef.current) setSearching(false) },
      )
    }
    if (typed.trim() === '') { run(); return }
    setSearching(true)
    timerRef.current = window.setTimeout(run, SEARCH_DELAY_MS)
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
    const list = found ?? []
    const options = current && !list.some((o) => sameId(o.value, current.value)) ? [current, ...list] : list
    control = <Select size="touch" options={options} value={current?.value ?? null} searchable clearable loading={searching} onSearchChange={onSearch} onChange={choose} />
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
    <Sheet open={open} onClose={onClose} eyebrow="Editar campos" title={`Serviço ${name}`}>
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
