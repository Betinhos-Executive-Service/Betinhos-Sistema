import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Button, Input, Select, Spinner, StatusBadge, Switch, Textarea, Tooltip, type SelectOption } from '@betinhos/ui'
import { AlertTriangle, Check, Lock } from 'lucide-react'
import { cellKind, statusTone } from '../domain/cells'
import type { EditValue } from '../domain/edit'
import { formatCell, parseMoney, toDateTimeLocal } from '../domain/format'
import { columnLabel, rowKey } from '../domain/layout'
import type { AttributeInfo, CellStatus, Column, LookupOption } from '../domain/types'

type Props = {
  row: Row
  column: Column
  info: AttributeInfo | undefined
  status: CellStatus
  /** Grava o valor; devolve `false` quando falhou (o erro chega por `status`). */
  onSave: (value: EditValue) => Promise<boolean>
  /** Limpa o aviso de erro da célula. */
  onReset: () => void
  /** Busca no servidor as opções de um lookup. */
  search: (text: string) => Promise<LookupOption[]>
  /** `false` enquanto a metadata não chegou: nenhuma célula edita. */
  editable: boolean
}

type Pick = { value: string; label: string }

const STATUS_COLUMNS: ReadonlySet<string> = new Set(['cr40f_status', 'cr40f_statusdefaturamento'])
const SEARCH_DELAY_MS = 250
const MEMO_MAX_LINES = 8
const moneyInput = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })

const isSelect = (kind: string) => kind === 'choice' || kind === 'lookup'
const sameId = (a: unknown, b: unknown) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase()
const cellsOf = (row: Element) => Array.from(row.children).filter((child) => child.getAttribute('role') === 'gridcell')

/** Foca a célula; as que não são focáveis (primeira coluna, seleção) entregam o foco ao controle de dentro. */
function focusCell(target: Element | undefined) {
  if (!(target instanceof HTMLElement)) return
  if (target.tabIndex >= 0) target.focus()
  else target.querySelector<HTMLElement>('button, input, [tabindex]')?.focus()
}

/** Setas: move o foco para a célula vizinha, na mesma coluna (cima e baixo) ou na mesma linha. */
function moveFocus(from: HTMLElement, rows: number, columns: number) {
  const row = from.closest('[role="row"]')
  if (!row) return
  const index = cellsOf(row).indexOf(from)
  let target: Element | null = row
  if (rows !== 0) {
    target = rows > 0 ? row.nextElementSibling : row.previousElementSibling
    while (target && target.getAttribute('role') !== 'row') target = rows > 0 ? target.nextElementSibling : target.previousElementSibling
  }
  if (target) focusCell(cellsOf(target)[index + columns])
}

/** Próxima (ou anterior) célula editável da mesma linha. */
function siblingEditable(from: HTMLElement, step: 1 | -1) {
  let next = step > 0 ? from.nextElementSibling : from.previousElementSibling
  while (next && !next.matches('.gr-cell--editable')) next = step > 0 ? next.nextElementSibling : next.previousElementSibling
  return next instanceof HTMLElement ? next : null
}

function grow(area: HTMLTextAreaElement) {
  // O jsdom não calcula layout: scrollHeight vem 0 e não há o que ajustar.
  if (area.scrollHeight === 0) return
  const line = parseFloat(window.getComputedStyle(area).lineHeight) || 20
  area.style.height = 'auto'
  area.style.height = `${Math.min(area.scrollHeight, line * MEMO_MAX_LINES)}px`
}

/** Célula do grid: lê o valor e, ao editar, troca pelo controle do tipo com feedback de gravação ali mesmo. */
export function Cell({ row, column, info, status, onSave, onReset, search, editable }: Props) {
  const key = rowKey(column, info)
  const kind = cellKind(column, info)
  const raw = row[key]
  const text = formatCell(kind, row, key)
  const label = columnLabel(column, info)
  const canEdit = editable && kind !== 'readonly' && kind !== 'boolean'

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const describedBy = useId()

  const editingRef = useRef(false)
  const [editing, setEditingState] = useState(false)
  const [draft, setDraft] = useState('')
  const [pick, setPick] = useState<Pick | null>(null)
  const [options, setOptions] = useState<SelectOption[]>([])
  const [searching, setSearching] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  // Último valor digitado ou escolhido, para "Tentar de novo" reabrir a edição de onde parou.
  const retryRef = useRef<{ draft: string; pick: Pick | null }>({ draft: '', pick: null })
  const keepRef = useRef<Pick | null>(null)
  // Boolean não tem modo de edição: guarda o último valor tentado para o "Tentar de novo" regravar.
  const lastBoolean = useRef<boolean | null>(null)
  const timerRef = useRef(0)
  const tokenRef = useRef(0)

  const setEditing = (value: boolean) => { editingRef.current = value; setEditingState(value) }
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const message = localError ?? (status.kind === 'error' ? status.message : null)
  const state = message ? 'error' : status.kind

  const current = (): Pick | null => (raw == null || raw === '' ? null : { value: String(raw), label: text })
  const initialDraft = () => {
    if (raw == null) return ''
    if (kind === 'money') return typeof raw === 'number' ? moneyInput.format(raw) : ''
    if (kind === 'datetime') return toDateTimeLocal(String(raw))
    return String(raw)
  }

  const restoreFocus = () => {
    // Depois do commit: se o foco caiu no corpo da página (o controle saiu), devolve à célula; se o usuário foi para outra, não toma.
    window.setTimeout(() => {
      const active = document.activeElement
      if (!active || active === document.body || rootRef.current?.contains(active)) rootRef.current?.focus()
    }, 0)
  }

  const finish = () => {
    window.clearTimeout(timerRef.current)
    tokenRef.current += 1
    setSearching(false)
    setLocalError(null)
    setEditing(false)
  }

  const submit = (value: EditValue) => { void onSave(value).catch(() => undefined) }

  const begin = (char?: string, retry = false) => {
    if (!canEdit || editingRef.current || status.kind === 'saving') return
    if (status.kind === 'error') onReset()
    setLocalError(null)
    if (isSelect(kind)) {
      const chosen = retry ? retryRef.current.pick : current()
      const keep = current()
      keepRef.current = keep
      setPick(chosen)
      if (kind === 'choice') {
        const list = (info?.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))
        setOptions(keep && !list.some((o) => o.value === keep.value) ? [keep, ...list] : list)
      } else {
        const list = [keep, chosen].filter((o): o is Pick => o != null)
        setOptions(list.filter((o, i) => list.findIndex((p) => sameId(p.value, o.value)) === i))
      }
    } else {
      setDraft(retry ? retryRef.current.draft : char ?? initialDraft())
    }
    setEditing(true)
  }

  useEffect(() => {
    if (!editing) return
    if (isSelect(kind)) {
      // O gatilho do Select é um botão: foco + clique abre o painel já ao entrar em edição.
      triggerRef.current?.focus()
      triggerRef.current?.click()
      return
    }
    const control = kind === 'memo' ? areaRef.current : inputRef.current
    if (!control) return
    control.focus()
    if (control instanceof HTMLTextAreaElement) { control.setSelectionRange(control.value.length, control.value.length); grow(control) }
    else if (control.type === 'text') control.setSelectionRange(control.value.length, control.value.length)
    // Só ao entrar em edição: digitar não pode mover o cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  /** Confirma o que está digitado. `false` quando o valor é inválido e a edição continua aberta. */
  const confirm = (): boolean => {
    if (!editingRef.current) return true
    switch (kind) {
      case 'text': case 'memo': {
        const before = raw == null ? '' : String(raw)
        retryRef.current = { draft, pick: null }
        finish()
        if (draft.trim() !== before.trim()) submit(draft)
        return true
      }
      case 'money': {
        const typed = draft.trim()
        retryRef.current = { draft, pick: null }
        if (typed === '') {
          finish()
          if (raw != null) submit(null)
          return true
        }
        const value = parseMoney(typed)
        if (value == null) { setLocalError('Valor inválido.'); return false }
        finish()
        if (value !== raw) submit(value)
        return true
      }
      case 'datetime': {
        // Data pela metade (campo do navegador incompleto) chega como '' e apagaria o valor: trata como inválida.
        if (inputRef.current?.validity.badInput) { setLocalError('Data ou hora inválida.'); return false }
        retryRef.current = { draft, pick: null }
        finish()
        if (draft !== toDateTimeLocal(raw == null ? null : String(raw))) submit(draft)
        return true
      }
      default:
        // Choice e lookup já gravaram ao escolher; sair sem escolher só fecha.
        finish()
        return true
    }
  }

  const retry = () => {
    if (kind !== 'boolean') { begin(undefined, true); return }
    onReset()
    submit(lastBoolean.current ?? raw !== true)
  }

  const cancel = () => { finish(); restoreFocus() }

  const chosen = (value: string | null) => {
    const option = options.find((o) => o.value === value)
    retryRef.current = { draft: '', pick: value == null ? null : { value, label: option?.label ?? value } }
    finish()
    restoreFocus()
    if (value == null) {
      if (raw != null) submit(null)
    } else if (kind === 'choice') {
      if (Number(value) !== raw) submit(Number(value))
    } else if (!sameId(value, raw)) {
      submit({ id: value, nome: option?.label ?? '' })
    }
  }

  const onSearch = (typed: string) => {
    window.clearTimeout(timerRef.current)
    const run = () => {
      const token = ++tokenRef.current
      setSearching(true)
      search(typed).then(
        (list) => {
          if (token !== tokenRef.current) return
          const keep = keepRef.current
          const found = list.map((o) => ({ value: keep && sameId(keep.value, o.id) ? keep.value : o.id, label: o.nome }))
          setOptions(keep && !found.some((o) => o.value === keep.value) ? [keep, ...found] : found)
          setSearching(false)
        },
        () => { if (token === tokenRef.current) setSearching(false) },
      )
    }
    if (typed.trim() === '') { run(); return }
    setSearching(true)
    timerRef.current = window.setTimeout(run, SEARCH_DELAY_MS)
  }

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // O Select consome o Esc no próprio gatilho; a captura garante que cancelar sempre cancele a edição inteira.
    if (editingRef.current && event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); cancel() }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    const root = event.currentTarget
    if (editingRef.current) {
      if (event.key === 'Tab') {
        event.preventDefault()
        if (!confirm()) return
        const next = siblingEditable(root, event.shiftKey ? -1 : 1)
        if (next) next.focus()
        else restoreFocus()
      } else if (event.key === 'Enter' && (kind === 'text' || kind === 'money' || kind === 'datetime' || (kind === 'memo' && (event.ctrlKey || event.metaKey)))) {
        event.preventDefault()
        if (confirm()) restoreFocus()
      }
      return
    }
    if (event.target !== root) return
    const move = (rows: number, columns: number) => { event.preventDefault(); moveFocus(root, rows, columns) }
    switch (event.key) {
      case 'ArrowUp': return move(-1, 0)
      case 'ArrowDown': return move(1, 0)
      case 'ArrowLeft': return move(0, -1)
      case 'ArrowRight': return move(0, 1)
      case 'Enter': case 'F2': if (canEdit) { event.preventDefault(); begin() } return
      default:
        if (canEdit && (kind === 'text' || kind === 'memo' || kind === 'money') && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          // O caractere entra como rascunho; sem isso o navegador o digitaria de novo no campo recém-aberto.
          event.preventDefault()
          begin(event.key)
        }
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!editingRef.current) return
    const next = event.relatedTarget
    if (next instanceof Node && (event.currentTarget.contains(next) || (next instanceof Element && next.closest('.bt-select-panel')))) return
    confirm()
  }

  const type = (setter: (value: string) => void) => (event: { target: { value: string } }) => { setter(event.target.value); setLocalError(null) }

  let control
  if (kind === 'text') control = <Input ref={inputRef} size="compact" value={draft} aria-label={label} invalid={localError != null} onChange={type(setDraft)} />
  else if (kind === 'money') control = <Input ref={inputRef} size="compact" inputMode="decimal" prefix="R$" value={draft} aria-label={label} invalid={localError != null} onChange={type(setDraft)} />
  else if (kind === 'datetime') control = <Input ref={inputRef} size="compact" type="datetime-local" value={draft} aria-label={label} invalid={localError != null} onChange={type(setDraft)} />
  else if (kind === 'memo') control = <Textarea ref={areaRef} rows={3} value={draft} aria-label={label} invalid={localError != null} onChange={(event) => { type(setDraft)(event); grow(event.target) }} />
  else if (isSelect(kind)) {
    control = (
      <Select
        ref={triggerRef}
        size="compact"
        aria-label={label}
        options={options}
        value={pick?.value ?? null}
        searchable={kind === 'lookup'}
        clearable={kind === 'lookup'}
        loading={searching}
        onSearchChange={kind === 'lookup' ? onSearch : undefined}
        onChange={chosen}
      />
    )
  }

  const rawStatus = typeof raw === 'number' ? raw : null
  const badge = !column.alias && STATUS_COLUMNS.has(column.attribute) && rawStatus != null
  const href = typeof raw === 'string' && /^https?:\/\//i.test(raw) ? raw : null

  let value
  if (kind === 'boolean') {
    value = (
      <Switch
        label={null}
        aria-label={label}
        checked={raw === true}
        disabled={!editable || status.kind === 'saving'}
        onChange={(event) => { lastBoolean.current = event.target.checked; submit(event.target.checked) }}
      />
    )
  } else if (badge) value = <StatusBadge tone={statusTone(column.attribute, rawStatus)}>{text}</StatusBadge>
  else if (href && column.attribute === 'new_linkdovoucher') value = <a className="gr-cell__value" href={href} target="_blank" rel="noreferrer" title={text}>{text}</a>
  else value = <span className="gr-cell__value" title={text}>{text}</span>

  const classes = ['bt-table__cell', 'gr-cell', `gr-cell--${kind}`, canEdit && 'gr-cell--editable', editing && 'gr-cell--editing', `is-${state}`].filter(Boolean).join(' ')

  return (
    <div
      ref={rootRef}
      className={classes}
      role="gridcell"
      tabIndex={0}
      aria-busy={status.kind === 'saving' || undefined}
      aria-invalid={message ? true : undefined}
      aria-describedby={message ? describedBy : undefined}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
      onDoubleClick={() => { if (!editingRef.current && canEdit) begin() }}
      onBlur={onBlur}
    >
      {editing ? <div className="gr-cell__editor">{control}</div> : value}
      {!editing && status.kind === 'saving' ? <span className="gr-cell__mark"><Spinner size={12} label="Gravando" /></span> : null}
      {!editing && status.kind === 'saved' ? <span className="gr-cell__mark" role="img" aria-label="Salvo"><Check size={14} aria-hidden="true" /></span> : null}
      {message ? (
        <>
          <Tooltip text={message} placement="bottom"><span className="gr-cell__mark"><AlertTriangle size={14} aria-hidden="true" /></span></Tooltip>
          <span id={describedBy} className="gr-sr">Erro: {message}</span>
        </>
      ) : null}
      {!editing && status.kind === 'error' ? <Button variant="ghost" size="compact" onClick={retry}>Tentar de novo</Button> : null}
      {kind === 'readonly' && editable && !message ? <span className="gr-cell__mark gr-cell__lock" role="img" aria-label="Somente leitura"><Lock size={12} aria-hidden="true" /></span> : null}
    </div>
  )
}
