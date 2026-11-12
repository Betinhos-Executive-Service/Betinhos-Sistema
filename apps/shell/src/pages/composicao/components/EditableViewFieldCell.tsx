import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useGridRowState } from './grid-row-state'
import { choiceOptions, dateFieldConfig, lookupOptions, relatedRecordId, saveRelatedField, type DateFieldConfig, type EditOption, type SavedFieldValue } from '../data/related-field-edit'
import { gridFieldDraft, gridFieldValue, numericFieldTypes } from '../data/grid-field-value'
import { ViewFieldCell, type ViewFieldCellProps } from './ViewFieldCell'
import { GridFieldOptions } from './GridFieldOptions'
import { adjacentGridCell } from './grid-cell-focus'

type Props = ViewFieldCellProps & {
  ownerRecordId?: string | null
  editable?: boolean
  onBeforeEdit?: () => boolean
  onSaved?: (result: SavedFieldValue) => void | Promise<unknown>
  onEditingChange?: (editing: boolean) => void
  onSavingChange?: (saving: boolean) => void
  onSelect?: () => void
}

const booleanOptions: EditOption[] = [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
const errorText = (error: unknown) => error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível salvar. Tente novamente.'

export function EditableViewFieldCell(props: Props) {
  const { field, value, formatted, viewFields, valueKey, baseRecordId, editable, display, onBeforeEdit, onSaved, onEditingChange, onSavingChange, onSelect } = props
  const cell = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const editingRef = useRef(false)
  const gridRow = useGridRowState()
  const savingRef = useRef(false)
  const draftRef = useRef('')
  const selectOnFocus = useRef(true)
  const draftTouched = useRef(false)
  const activeChanged = useRef(false)
  const failedDraft = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [feedback, setFeedback] = useState<'saving' | 'saved' | 'error' | null>(null)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<SavedFieldValue | null>(null)
  const [options, setOptions] = useState<EditOption[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [optionsError, setOptionsError] = useState('')
  const [query, setQuery] = useState('')
  const [retry, setRetry] = useState(0)
  const [keyboard, setKeyboard] = useState(false)
  const [dateConfig, setDateConfig] = useState<DateFieldConfig>({ behavior: 'UserLocal', dateOnly: false })
  const recordId = props.ownerRecordId !== undefined ? props.ownerRecordId : relatedRecordId(field, viewFields, valueKey, baseRecordId)
  const canEdit = Boolean(editable && field.writable && recordId)
  const picker = ['Lookup', 'Picklist', 'Status', 'State', 'Boolean'].includes(field.type)
  const numeric = numericFieldTypes.has(field.type)
  const dateReady = field.type === 'DateTime' && !loading
  const shownValue = preview ? preview.value : value
  const shownFormatted = preview ? preview.formatted : formatted
  const currentLabel = typeof shownFormatted === 'string' ? shownFormatted : field.type === 'Boolean' ? booleanOptions.find((option) => option.value === String(shownValue))?.label ?? '' : shownValue === null || shownValue === undefined ? '' : String(shownValue)

  const changeDraft = (text: string) => { draftRef.current = text; setDraft(text) }
  const close = () => { editingRef.current = false; setEditing(false); onEditingChange?.(false); gridRow?.setEditing(false) }
  const begin = (initial?: string, fromKeyboard = false) => {
    if (!canEdit || savingRef.current || onBeforeEdit?.() === false) return
    if (timer.current) clearTimeout(timer.current)
    setKeyboard(fromKeyboard)
    selectOnFocus.current = initial === undefined
    draftTouched.current = initial !== undefined || failedDraft.current !== null
    activeChanged.current = false
    const text = initial ?? failedDraft.current ?? (picker ? currentLabel : gridFieldDraft(field, shownValue, dateConfig.behavior))
    changeDraft(text)
    setQuery(initial ?? '')
    setActive(0)
    setOptionsError('')
    setMessage('')
    setFeedback(null)
    setOptions(field.type === 'Boolean' ? booleanOptions : [])
    setLoading(picker && field.type !== 'Boolean' || field.type === 'DateTime')
    editingRef.current = true
    setEditing(true)
    onEditingChange?.(true)
    gridRow?.setEditing(true)
  }

  useLayoutEffect(() => {
    if (!editing || field.type === 'DateTime' && !dateReady) return
    input.current?.focus()
    if (field.type !== 'DateTime') {
      if (selectOnFocus.current) input.current?.select()
      else input.current?.setSelectionRange(draftRef.current.length, draftRef.current.length)
    }
  }, [editing, field.type, dateReady])

  useEffect(() => {
    if (!editing || field.type !== 'DateTime') return
    let current = true
    void dateFieldConfig(field).then((config) => {
      if (!current) return
      setDateConfig(config)
      const initial = gridFieldDraft(field, shownValue, config.behavior)
      if (!draftTouched.current) changeDraft(config.dateOnly ? initial.slice(0, 10) : initial)
      setLoading(false)
    }).catch((error) => { if (current) { setOptionsError(errorText(error)); setLoading(false) } })
    return () => { current = false }
  }, [editing, field.table, field.attribute, retry])

  useEffect(() => {
    if (!editing || !picker) return
    let current = true
    setLoading(true)
    const delay = field.type === 'Lookup' && query ? 180 : 0
    const handle = setTimeout(() => {
      const request = field.type === 'Lookup' ? lookupOptions(field, query) : choiceOptions(field)
      void request.then((result) => {
        if (!current) return
        const filtered = field.type === 'Lookup' ? result : result.filter((option) => option.label.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
        const allowClear = shownValue !== null && shownValue !== undefined && field.type !== 'Boolean'
        setOptions(allowClear ? [...filtered, { value: '', label: 'Limpar valor' }] : filtered)
        setActive(query ? 0 : Math.max(0, filtered.findIndex((option) => option.value === String(shownValue))))
        setOptionsError('')
      }).catch((error) => { if (current) { setOptions([]); setOptionsError(errorText(error)) } }).finally(() => { if (current) setLoading(false) })
    }, delay)
    return () => { current = false; clearTimeout(handle) }
  }, [editing, picker, field, query, retry])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => {
    if (!editingRef.current && (!savingRef.current || preview && String(value ?? '') === String(preview.value ?? ''))) setPreview(null)
  }, [value, formatted])

  const focusNext = (key?: string, reverse = false) => {
    const next = key ? adjacentGridCell(cell.current, key, reverse) : cell.current
    requestAnimationFrame(() => {
      const focused = document.activeElement
      if (next?.isConnected && (focused === document.body || focused === cell.current || cell.current?.contains(focused))) next.focus()
    })
  }
  const commit = (option?: EditOption, navigation?: string, reverse = false, restoreFocus = true) => {
    if (!editingRef.current || savingRef.current || !recordId) return
    if (loading || optionsError) { input.current?.focus(); return }
    // O valor visível do controle nativo também cobre eventos de data/hora do navegador.
    const originalDraft = input.current?.value ?? draftRef.current
    let next: unknown
    let nextFormatted: string | undefined
    try {
      if (picker) {
        if (!option) { close(); if (restoreFocus) focusNext(navigation, reverse); return }
        next = option.value === '' ? null : field.type === 'Lookup' ? option.value : field.type === 'Boolean' ? option.value === 'true' : Number(option.value)
        nextFormatted = option.value === '' ? undefined : option.label
      } else next = gridFieldValue(field, originalDraft, dateConfig.behavior, dateConfig.dateOnly)
      if (String(next ?? '') === String(shownValue ?? '')) { close(); if (restoreFocus) focusNext(navigation, reverse); return }
    } catch (error) { setFeedback('error'); setMessage(errorText(error)); input.current?.focus(); return }
    const optimistic: SavedFieldValue = { value: next, formatted: nextFormatted, table: field.table, recordId, attribute: field.attribute }
    setPreview(optimistic)
    setFeedback('saving')
    setMessage('Salvando')
    savingRef.current = true
    onSavingChange?.(true)
    gridRow?.setSaving(true)
    close()
    if (restoreFocus) focusNext(navigation, reverse)
    void saveRelatedField(field, recordId, next, option).then(async (result) => {
      setPreview(result)
      failedDraft.current = null
      setFeedback('saved')
      setMessage(result.refreshWarning ?? 'Salvo')
      await onSaved?.(result)
      timer.current = setTimeout(() => setFeedback(null), 1800)
    }).catch((error) => {
      setPreview(null)
      failedDraft.current = originalDraft
      setFeedback('error')
      setMessage(errorText(error))
    }).finally(() => { savingRef.current = false; onSavingChange?.(false); gridRow?.setSaving(false) })
  }

  const cancel = () => { failedDraft.current = null; close(); setFeedback(null); setMessage(''); focusNext() }
  const onInputKey = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return }
    if (picker && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      activeChanged.current = true
      setActive((index) => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
      return
    }
    if (field.type === 'Memo' && event.key === 'Enter' && !event.ctrlKey && !event.metaKey) return
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const chosen = picker && (event.key === 'Enter' || activeChanged.current || query || options[active]?.value === String(shownValue ?? '')) ? options[active] : undefined
      commit(chosen, event.key, event.shiftKey)
    }
  }

  const updateInput = (element: HTMLInputElement | HTMLTextAreaElement) => {
    const value = field.type === 'DateTime' ? element.value.replace(/^(\d{4})\d+(-)/, '$1$2') : element.value
    if (element.value !== value) element.value = value
    draftTouched.current = true
    changeDraft(value)
    setQuery(value)
    setFeedback(null)
    setMessage('')
  }
  const inputProps = {
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => { input.current = element },
    value: draft,
    disabled: field.type === 'DateTime' && loading,
    min: field.type === 'DateTime' ? dateConfig.dateOnly ? '0001-01-01' : '0001-01-01T00:00' : undefined,
    max: field.type === 'DateTime' ? dateConfig.dateOnly ? '9999-12-31' : '9999-12-31T23:59' : undefined,
    'aria-busy': field.type === 'DateTime' && loading || undefined,
    'aria-label': `Editar ${field.label}`,
    'aria-invalid': feedback === 'error' || undefined,
    'aria-describedby': feedback === 'error' ? `${listId}-error` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updateInput(event.currentTarget),
    onInput: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => updateInput(event.currentTarget),
    onKeyDown: onInputKey,
    onBlur: () => { setTimeout(() => { if (editingRef.current && document.activeElement !== input.current) { if (picker) { close() } else commit(undefined, undefined, false, false) } }, 0) },
  }

  return <div ref={cell} tabIndex={canEdit ? 0 : -1} data-grid-cell={`${baseRecordId}:${field.id}`} data-grid-editable={canEdit} className={`money-cell grid-field-cell${numeric ? ' grid-field-cell--numeric' : ''}${editing ? ' money-cell--editing' : ''}${feedback ? ' money-cell--has-feedback' : ''}${!canEdit ? ' grid-field-cell--readonly' : ''}`} aria-label={`${field.label}: ${currentLabel || 'vazio'}${!canEdit ? ', somente leitura' : ''}`} onFocus={(event) => { if (event.target === event.currentTarget) onSelect?.() }} onPointerDown={(event) => {
    if (editing || event.button !== 0 || (event.target as HTMLElement).closest('button, a')) return
    event.preventDefault(); cell.current?.focus()
  }} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('button, a')) begin() }} onKeyDown={(event) => {
    if (editing || event.target !== event.currentTarget || event.nativeEvent.isComposing) return
    if (event.key === 'F2' || picker && event.key === ' ' || event.altKey && event.key === 'ArrowDown') { event.preventDefault(); begin(undefined, true); return }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && canEdit) { event.preventDefault(); begin(event.key, true); return }
    if (event.key === 'Enter' || event.key === 'Tab' || event.key.startsWith('Arrow')) { const next = adjacentGridCell(cell.current, event.key, event.shiftKey); if (next) { event.preventDefault(); next.focus() } }
  }} onPaste={(event) => {
    if (editing || picker || !canEdit) return
    const text = event.clipboardData.getData('text/plain')
    if (field.type !== 'Memo' && /[\r\n\t]/.test(text)) { setFeedback('error'); setMessage('Colagem múltipla não é suportada.'); event.preventDefault(); return }
    event.preventDefault(); begin(text, true)
  }}>
    {editing ? field.type === 'Memo' ? <textarea {...inputProps} className="money-editor grid-field-editor grid-field-editor--memo" rows={1} /> : <input {...inputProps} className={`money-editor${!numeric ? ' grid-field-editor' : ''}${picker ? ' grid-field-editor--picker' : ''}${feedback ? ' money-editor--has-feedback' : ''}`} type={field.type === 'DateTime' ? dateConfig.dateOnly ? 'date' : 'datetime-local' : 'text'} inputMode={numeric ? 'decimal' : undefined} role={picker ? 'combobox' : undefined} aria-expanded={picker ? true : undefined} aria-controls={picker ? listId : undefined} aria-autocomplete={picker ? 'list' : undefined} aria-activedescendant={picker && !loading && options[active] ? `${listId}-${active}` : undefined} /> : <span className="money-cell-value">{!preview && display ? display : <ViewFieldCell {...props} value={shownValue} formatted={shownFormatted} />}</span>}
    {picker && canEdit && !feedback && <button className="grid-field-chevron" type="button" tabIndex={-1} aria-label={`Escolher ${field.label}`} onPointerDown={(event) => event.preventDefault()} onClick={() => { if (editing) cancel(); else begin() }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
    {feedback && <span className={`cell-save-feedback cell-save-feedback--${feedback}`} role="status" aria-live="polite" aria-label={message} title={message}><svg viewBox="0 0 16 16" aria-hidden="true">{feedback === 'saving' ? <path d="M8 2a6 6 0 1 1-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : feedback === 'saved' ? <path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /> : <path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}</svg></span>}
    {feedback === 'error' && <span id={`${listId}-error`} className="grid-field-error" role="alert">{message}</span>}
    {editing && picker && <GridFieldOptions anchor={cell} id={listId} label={field.label} options={options} active={active} current={shownValue} loading={loading} error={optionsError} keyboard={keyboard} onChoose={(option) => commit(option)} onActive={setActive} onRetry={() => setRetry((count) => count + 1)} />}
    {editing && field.type === 'DateTime' && optionsError && <span className="grid-field-error" role="alert">{optionsError}</span>}
  </div>
}
