import { Menu, type MenuAction } from '@betinhos/ui'
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Filter, FilterX } from 'lucide-react'

type Props = {
  label: string
  /** `false` em coluna de link-entity ou de tipo que não filtra: só ordenar e ocultar. */
  filterable: boolean
  filtered: boolean
  /** Não deixa ocultar a última coluna visível. */
  canHide: boolean
  onSort: (descending: boolean) => void
  onFilter: () => void
  onClearFilter: () => void
  onHide: () => void
}

/** Botão ▾ do cabeçalho: visível no hover/foco e sempre que a coluna está filtrada (com ponto de ação). */
export function ColumnMenu({ label, filterable, filtered, canHide, onSort, onFilter, onClearFilter, onHide }: Props) {
  const actions: MenuAction[] = [
    { id: 'asc', label: 'Ordenar A→Z', icon: <ArrowUp size={16} />, onSelect: () => onSort(false) },
    { id: 'desc', label: 'Ordenar Z→A', icon: <ArrowDown size={16} />, onSelect: () => onSort(true) },
    ...(filterable ? [{ id: 'filter', label: 'Filtrar por…', icon: <Filter size={16} />, onSelect: onFilter }] : []),
    ...(filterable && filtered ? [{ id: 'clear', label: 'Limpar filtro', icon: <FilterX size={16} />, onSelect: onClearFilter }] : []),
    { id: 'hide', label: 'Ocultar coluna', icon: <EyeOff size={16} />, onSelect: onHide, disabled: !canHide },
  ]
  return (
    <span className={filtered ? 'gr-head__more is-filtered' : 'gr-head__more'}>
      <Menu
        align="start"
        actions={actions}
        trigger={(props) => (
          <button type="button" className="gr-head__menu" aria-label={`Opções da coluna ${label}`} {...props}>
            <ChevronDown size={14} />
            {filtered ? <span className="gr-head__dot" aria-hidden="true" /> : null}
          </button>
        )}
      />
    </span>
  )
}
