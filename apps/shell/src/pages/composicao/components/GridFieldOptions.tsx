import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { portalHost } from './portal-host'
import type { EditOption } from '../data/related-field-edit'

type Props = {
  anchor: RefObject<HTMLDivElement | null>
  id: string
  label: string
  options: EditOption[]
  active: number
  current: unknown
  loading: boolean
  error: string
  keyboard: boolean
  onChoose: (option: EditOption) => void
  onActive: (index: number) => void
  onRetry: () => void
}

export const optionIdentity = (option: EditOption) => `${option.table ?? ''}:${option.value}`

/** Portal keeps the options out of the table's scroll and row sizing. */
export function GridFieldOptions({ anchor, id, label, options, active, current, loading, error, keyboard, onChoose, onActive, onRetry }: Props) {
  const list = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 260, maxHeight: 264, above: false })
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16)
      const above = window.innerHeight - rect.bottom < 180 && rect.top > window.innerHeight - rect.bottom
      const available = above ? rect.top - 12 : window.innerHeight - rect.bottom - 12
      const maxHeight = Math.max(60, Math.min(264, available))
      setPosition({ top: above ? rect.top - 4 : rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight, above })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    if (anchor.current) observer?.observe(anchor.current)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer?.disconnect() }
  }, [anchor])
  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])
  const multipleTables = new Set(options.filter((option) => option.table).map((option) => option.table)).size > 1
  return createPortal(<div ref={list} id={id} role="listbox" aria-label={`Opções de ${label}`} aria-busy={loading} className="grid-field-options" data-keyboard={keyboard} data-side={position.above ? 'top' : 'bottom'} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, transform: position.above ? 'translateY(-100%)' : undefined }} onPointerDown={(event) => event.preventDefault()}>
    {loading ? <div className="grid-field-options__message" role="status">Buscando registros…</div> : error ? <div className="grid-field-options__message" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Tentar novamente</button></div> : options.length ? options.map((option, index) => <button id={`${id}-${index}`} key={optionIdentity(option)} role="option" type="button" aria-selected={String(current ?? '') === option.value} data-option-index={index} data-active={active === index} className="grid-field-option" onPointerMove={() => onActive(index)} onClick={() => onChoose(option)}>
      <span className="grid-field-option__label">{option.label}{multipleTables && option.tableLabel && <small>{option.tableLabel}</small>}</span>
      {String(current ?? '') === option.value && <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>) : <div className="grid-field-options__message">Nenhum registro encontrado.</div>}
  </div>, portalHost(anchor.current))
}
