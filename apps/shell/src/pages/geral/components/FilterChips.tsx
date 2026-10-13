import { Button } from '@betinhos/ui'
import { TriangleAlert, X } from 'lucide-react'
import { describeFilter, isEmptyFilter, type FilterSet } from '../domain/filters'
import type { AttributeMap } from '../domain/types'

type Props = {
  filters: FilterSet
  attributes: AttributeMap | null
  /** Celular: alvos de toque de 44 px. */
  mobile: boolean
  /** Metadata indisponível: os filtros restaurados não estão sendo aplicados. */
  ignored?: boolean
  onEdit: (attribute: string) => void
  onRemove: (attribute: string) => void
  onClearAll: () => void
}

/** Um chip por filtro ativo: o texto reabre o editor, o × remove. Some quando não há filtros. */
export function FilterChips({ filters, attributes, mobile, ignored, onEdit, onRemove, onClearAll }: Props) {
  const active = Object.entries(filters).filter(([, f]) => !isEmptyFilter(f))
  if (active.length === 0) return null
  return (
    <div className={mobile ? 'gr-chips gr-chips--touch' : 'gr-chips'} role="group" aria-label="Filtros ativos">
      {active.map(([attribute, filter]) => {
        const info = attributes?.get(attribute)
        const label = info?.label || attribute
        return (
          <span key={attribute} className={ignored ? 'gr-chip is-ignored' : 'gr-chip'} title={ignored ? 'Este filtro não está sendo aplicado' : undefined}>
            {ignored ? <span role="img" className="gr-chip__warn" aria-label="Este filtro não está sendo aplicado"><TriangleAlert size={14} aria-hidden="true" /></span> : null}
            <button type="button" className="gr-chip__text" title={`Editar filtro ${label}`} onClick={() => onEdit(attribute)}>{describeFilter(attribute, filter, info)}</button>
            <button type="button" className="gr-chip__remove" aria-label={`Remover filtro ${label}`} onClick={() => onRemove(attribute)}><X size={14} /></button>
          </span>
        )
      })}
      <Button variant="ghost" size={mobile ? 'touch' : 'compact'} onClick={onClearAll}>Limpar filtros</Button>
    </div>
  )
}
