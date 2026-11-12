import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { portalHost } from './portal-host'
import { Check, ChevronDown, Search, UserRound } from 'lucide-react'

export type SelectOption = { value: string; label: string; disabled?: boolean; icon?: 'user' }
type Props = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  'aria-label': string
  className?: string
  inline?: boolean
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

/** Select pesquisável usado nos formulários operacionais, seguindo o padrão da Tela Planner. */
export function SearchableSelect({ value, onChange, options, placeholder = 'Selecione...', disabled, className = '', inline = false, 'aria-label': ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 })
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => options.filter((option) => normalize(option.label).includes(normalize(query))), [options, query])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom
      const above = rect.top
      const height = Math.min(320, Math.max(160, Math.max(below, above) - 12))
      const upward = below < 220 && above > below
      const width = Math.max(rect.width, 240)
      setPosition({ top: upward ? Math.max(8, rect.top - height - 4) : rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight: height })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])

  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const choose = (option: SelectOption) => {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
    setQuery('')
    trigger.current?.focus()
  }
  const move = (direction: number) => {
    if (!filtered.length) return
    let next = activeIndex
    for (let i = 0; i < filtered.length; i++) {
      next = (next + direction + filtered.length) % filtered.length
      if (!filtered[next].disabled) { setActiveIndex(next); break }
    }
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus() }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) setOpen(true); else move(event.key === 'ArrowDown' ? 1 : -1) }
    else if (event.key === 'Enter' && open) { event.preventDefault(); const option = filtered[activeIndex]; if (option) choose(option) }
  }

  return <div className={`custom-select ${className}`}>
    <button ref={trigger} type="button" className="custom-select-trigger" role="combobox" aria-label={ariaLabel} aria-controls={open ? id : undefined} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onKeyDown={onKeyDown} onClick={() => { setQuery(''); setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value))); setOpen(!open) }}><span className="custom-select-option-label">{selected?.icon === 'user' && <UserRound size={14} aria-hidden="true" />}{selected?.label ?? placeholder}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {open && (() => { const content = <div ref={panel} className={`custom-select-panel${inline ? ' is-inline' : ''} ${className}`} style={inline ? undefined : { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}><div className="custom-select-search"><Search size={15} aria-hidden="true" /><input ref={search} value={query} aria-label={`Buscar ${ariaLabel.toLowerCase()}`} placeholder="Buscar..." onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={onKeyDown} /></div><div id={id} role="listbox" aria-label={ariaLabel} className="custom-select-options">{filtered.length ? filtered.map((option, index) => <button key={option.value} type="button" role="option" aria-label={option.icon === 'user' ? `Pessoal: ${option.label}` : option.label} aria-selected={option.value === value} disabled={option.disabled} className={index === activeIndex ? 'is-active' : ''} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}><span className="custom-select-option-label">{option.icon === 'user' && <UserRound size={14} aria-hidden="true" />}{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}</button>) : <div className="custom-select-empty">Nenhuma opção encontrada.</div>}</div></div>; return inline ? content : createPortal(content, portalHost(trigger.current)) })()}
  </div>
}
