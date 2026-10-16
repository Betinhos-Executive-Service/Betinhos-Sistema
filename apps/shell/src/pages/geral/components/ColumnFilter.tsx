import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { Button, QuickFilterCell, type FilterCondition, type FilterField, type LookupSearch } from '@betinhos/ui'

type Props = {
  /** Cabeçalho da coluna: o painel abre logo abaixo dele e o foco volta para ele ao fechar. */
  anchor: HTMLElement
  field: FilterField
  value: FilterCondition | undefined
  search?: LookupSearch
  /** Aplica na hora (`null` limpa), como a célula de filtro rápido do DS. */
  onChange: (condition: FilterCondition | null) => void
  onClose: () => void
}

/** Filtro da coluna num painel ancorado ao título, como o "Filtrar por" do model-driven: o controle do tipo da coluna, Limpar e Concluído. Esc e clique fora fecham. */
export function ColumnFilter({ anchor, field, value, search, onChange, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    try { panel.showPopover?.() } catch { /* sem suporte: fixo com z-index alto */ }
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const width = panel.offsetWidth
      panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`
      panel.style.top = `${r.bottom + 4}px`
    }
    place()
    panel.querySelector<HTMLElement>('input, [role="combobox"], button')?.focus()
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.contains(target) && !anchor.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [anchor, onClose])

  const close = () => { onClose(); anchor.focus() }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  }

  return (
    <div ref={panelRef} role="dialog" aria-label={`Filtro da coluna ${field.label}`} className="gr-colfilter" popover="manual" onKeyDown={onKeyDown}>
      <div className="gr-colfilter__title">Filtrar por {field.label}</div>
      <div className="gr-colfilter__control">
        <QuickFilterCell field={field} value={value} search={search} onChange={onChange} />
      </div>
      <div className="gr-colfilter__actions">
        <Button variant="secondary" size="compact" disabled={!value} onClick={() => onChange(null)}>Limpar</Button>
        <Button size="compact" onClick={close}>Concluído</Button>
      </div>
    </div>
  )
}
