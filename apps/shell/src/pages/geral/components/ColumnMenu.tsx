import type { KeyboardEvent, ReactNode } from 'react'
import { Menu, type MenuAction } from '@betinhos/ui'
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Filter, FilterX } from 'lucide-react'

type Props = {
  label: string
  /** Chave da coluna: vai em `data-col` para o foco voltar ao cabeçalho depois de mover a coluna. */
  columnKey: string
  /** Seta de ordenação atual (ou nada). */
  sortIcon?: ReactNode
  /** `false` em coluna de link-entity ou de tipo que não filtra: só ordenar e ocultar. */
  filterable: boolean
  filtered: boolean
  /** Não deixa ocultar a última coluna visível. */
  canHide: boolean
  onSort: (descending: boolean) => void
  onFilter: () => void
  onClearFilter: () => void
  onHide: () => void
  /** Teclas do cabeçalho além das do menu (Alt+setas movem a coluna). */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}

/** Título da coluna, como no model-driven: clicar abre o menu (ordenar, filtrar, ocultar). O ▾ aparece no hover/foco e sempre que a coluna está filtrada (com ponto de ação). */
export function ColumnMenu({ label, columnKey, sortIcon, filterable, filtered, canHide, onSort, onFilter, onClearFilter, onHide, onKeyDown }: Props) {
  const actions: MenuAction[] = [
    { id: 'asc', label: 'Ordenar A→Z', icon: <ArrowUp size={16} />, onSelect: () => onSort(false) },
    { id: 'desc', label: 'Ordenar Z→A', icon: <ArrowDown size={16} />, onSelect: () => onSort(true) },
    ...(filterable ? [{ id: 'filter', label: 'Filtrar por…', icon: <Filter size={16} />, onSelect: onFilter }] : []),
    ...(filterable && filtered ? [{ id: 'clear', label: 'Limpar filtro', icon: <FilterX size={16} />, onSelect: onClearFilter }] : []),
    { id: 'hide', label: 'Ocultar coluna', icon: <EyeOff size={16} />, onSelect: onHide, disabled: !canHide },
  ]
  return (
    <Menu
      align="start"
      actions={actions}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className={filtered ? 'gr-head__sort is-filtered' : 'gr-head__sort'}
          data-col={columnKey}
          onKeyDown={(event) => { onKeyDown?.(event); if (!event.defaultPrevented) props.onKeyDown(event) }}
        >
          <span className="gr-head__label">{label}</span>
          {sortIcon}
          <span className="gr-head__chevron" aria-hidden="true">
            <ChevronDown size={14} />
            {filtered ? <span className="gr-head__dot" /> : null}
          </span>
        </button>
      )}
    />
  )
}
