import { useState } from 'react'
import { Button, Checkbox, Dialog } from '@betinhos/ui'
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react'
import { applyColumnPrefs, type ColumnPrefs } from '../domain/columns'
import { columnLabel } from '../domain/layout'
import type { AttributeMap, Column } from '../domain/types'

type Props = {
  /** Todas as colunas da visão, sem as preferências aplicadas. */
  columns: Column[]
  attributes: AttributeMap | null
  prefs: ColumnPrefs | null
  onChange: (prefs: ColumnPrefs | null) => void
}

/** Rascunho com a ordem completa; ocultas ficam na lista, só marcadas como desligadas. */
function draftFrom(columns: Column[], prefs: ColumnPrefs | null): ColumnPrefs {
  const ordered = applyColumnPrefs(columns, prefs ? { hidden: [], order: prefs.order } : null)
  return { order: ordered.map((c) => c.key), hidden: prefs?.hidden.filter((k) => columns.some((c) => c.key === k)) ?? [] }
}

const isDefault = (draft: ColumnPrefs, columns: Column[]) => draft.hidden.length === 0 && draft.order.every((key, i) => key === columns[i]?.key)

/** Botão "Colunas" e o diálogo com mostrar/ocultar e ordem; só vale ao aplicar. */
export function ColumnsMenu({ columns, attributes, prefs, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ColumnPrefs>({ hidden: [], order: [] })
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const visibleCount = draft.order.filter((key) => !draft.hidden.includes(key)).length

  function show() {
    setDraft(draftFrom(columns, prefs))
    setOpen(true)
  }
  const toggle = (key: string) => setDraft((d) => ({ ...d, hidden: d.hidden.includes(key) ? d.hidden.filter((k) => k !== key) : [...d.hidden, key] }))
  const move = (index: number, step: -1 | 1) => setDraft((d) => {
    const order = [...d.order]
    const target = index + step
    if (target < 0 || target >= order.length) return d
    ;[order[index], order[target]] = [order[target], order[index]]
    return { ...d, order }
  })
  function apply() {
    onChange(isDefault(draft, columns) ? null : draft)
    setOpen(false)
  }
  function restore() {
    onChange(null)
    setOpen(false)
  }

  return (
    <>
      <Button variant="secondary" icon={<Columns3 size={16} />} aria-haspopup="dialog" onClick={show}>Colunas</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Colunas da visão"
        actions={<>
          <Button variant="ghost" onClick={restore}>Restaurar colunas da visão</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={apply}>Aplicar</Button>
        </>}
      >
        {open ? (
          <ul className="gr-columns" aria-label="Colunas">
            {draft.order.map((key, index) => {
              const column = byKey.get(key)
              if (!column) return null
              const label = columnLabel(column, attributes?.get(column.key))
              const checked = !draft.hidden.includes(key)
              return (
                <li key={key} className="gr-columns__item">
                  <Checkbox label={label} checked={checked} disabled={checked && visibleCount === 1} onChange={() => toggle(key)} />
                  <span className="gr-columns__move">
                    <Button variant="ghost" size="compact" icon={<ArrowUp size={14} />} aria-label={`Mover ${label} para cima`} disabled={index === 0} onClick={() => move(index, -1)} />
                    <Button variant="ghost" size="compact" icon={<ArrowDown size={14} />} aria-label={`Mover ${label} para baixo`} disabled={index === draft.order.length - 1} onClick={() => move(index, 1)} />
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </Dialog>
    </>
  )
}
