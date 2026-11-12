import { useEffect, useId, useState } from 'react'
import { resolveFilterOption, searchFilterOptions, type FilterOption } from '../data/filter-options'
import type { CatalogField } from '../data/views'

type Props = { field: CatalogField; value: string; onChange: (value: string) => void }

export function SearchFilterSelect({ field, value, onChange }: Props) {
  const listId = useId()
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<FilterOption[]>([])
  const [savedOption, setSavedOption] = useState<FilterOption>()
  const [resolvedValue, setResolvedValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  useEffect(() => {
    let current = true
    if (value) void resolveFilterOption(field, value).then((option) => { if (current) setSavedOption(option) }).catch(() => { if (current) setSavedOption(undefined) }).finally(() => { if (current) setResolvedValue(value) })
    else setSavedOption(undefined)
    return () => { current = false }
  }, [field, value])
  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      searchFilterOptions(field, search).then((result) => {
        if (current) { setOptions(result); setActive(0); setError('') }
      }).catch((cause) => {
        if (current) { setOptions([]); setError(cause instanceof Error ? cause.message : String(cause)) }
      }).finally(() => { if (current) setLoading(false) })
    }, 250)
    return () => { current = false; window.clearTimeout(timer) }
  }, [field, search])
  const selectedLabel = options.find((option) => option.value === value)?.label ?? (savedOption?.value === value ? savedOption.label : undefined)
  const displayedValue = open ? search : value ? selectedLabel ?? (field.type === 'Lookup' ? resolvedValue !== value ? 'Carregando…' : 'Registro não encontrado neste ambiente — selecione outro' : `Selecionado: ${value}`) : ''
  return <div className={`filter-search-select${open ? ' is-open' : ''}`}>
    <input role="combobox" aria-label={`Buscar ${field.label}`} aria-expanded={open} aria-controls={open ? listId : undefined} aria-autocomplete="list" placeholder={`Buscar ${field.label}…`} value={displayedValue} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 100)} onChange={(event) => { setSearch(event.target.value); setOpen(true) }} onKeyDown={(event) => {
      if (event.key === 'Escape') { setSearch(''); setOpen(false); event.currentTarget.blur() }
      if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index) => Math.min(options.length - 1, index + 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, index - 1)) }
      if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); onChange(options[active].value); setSearch(''); setOpen(false); event.currentTarget.blur() }
    }} />
    {open && <div id={listId} role="listbox" className="filter-search-select__options">
      {loading ? <span>Buscando…</span> : error ? <span role="alert">{error}</span> : options.length ? options.map((option, index) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={index === active ? 'is-active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.value); setSearch(''); setOpen(false); document.activeElement instanceof HTMLElement && document.activeElement.blur() }}>{option.label}</button>) : <span>Nenhum valor encontrado.</span>}
    </div>}
  </div>
}
