import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  Button, FILTER_OPS, FilterValueEditor, Select, conditionProblem, describeCondition, newCondition,
  type FilterCondition, type FilterField, type LookupSearch, type SelectOption,
} from '@betinhos/ui'

type Props = {
  /** Cabeçalho da coluna: o painel abre logo abaixo dele e o foco volta para ele ao fechar. */
  anchor: HTMLElement
  field: FilterField
  /** Condição que vale hoje para a coluna; o painel abre já com ela. */
  value: FilterCondition | undefined
  search?: LookupSearch
  /** Grava a condição ao Aplicar (`null` limpa). */
  onChange: (condition: FilterCondition | null) => void
  onClose: () => void
}

/** Filtro da coluna num painel ancorado ao título, como o "Filtrar por" do model-driven: operador do tipo da coluna, valor, Aplicar e Limpar. Esc e clique fora fecham sem aplicar. */
export function ColumnFilter({ anchor, field, value, search, onChange, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<FilterCondition>(() => value ?? { ...newCondition(field), id: `rapido-${field.key}` })
  const problem = conditionProblem(draft, field)
  const opOptions: SelectOption[] = FILTER_OPS[field.kind].map((o) => ({ value: o.op, label: o.label }))

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
    panel.querySelector<HTMLElement>('[role="combobox"], input, button')?.focus()
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
  const apply = () => { if (problem) return; onChange(draft); close() }
  const clear = () => { onChange(null); close() }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    // Enter num campo de texto/número/data aplica; nas listas o Enter escolhe a opção.
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); apply() }
  }

  return (
    <div ref={panelRef} role="dialog" aria-label={`Filtro da coluna ${field.label}`} className="gr-colfilter" popover="manual" onKeyDown={onKeyDown}>
      <div className="gr-colfilter__title">Filtrar por {field.label}</div>
      {value ? <p className="gr-colfilter__active" role="status">Filtro ativo: {describeCondition(value, [field])}</p> : null}
      <div className="gr-colfilter__controls">
        <Select
          aria-label="Operador"
          size="compact"
          searchable={false}
          clearable={false}
          options={opOptions}
          value={draft.op}
          onChange={(op) => op && setDraft((c) => ({ ...c, op: op as FilterCondition['op'], value: undefined, to: undefined, values: undefined }))}
        />
        <FilterValueEditor field={field} condition={draft} search={search} invalid={Boolean(problem) && draft.op === value?.op} onChange={setDraft} />
      </div>
      {problem ? <p className="gr-colfilter__hint">{problem}</p> : null}
      <div className="gr-colfilter__actions">
        <Button variant="secondary" size="compact" disabled={!value} onClick={clear}>Limpar</Button>
        <Button size="compact" disabled={Boolean(problem)} onClick={apply}>Aplicar</Button>
      </div>
    </div>
  )
}
