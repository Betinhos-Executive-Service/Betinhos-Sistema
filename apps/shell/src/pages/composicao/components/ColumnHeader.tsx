import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp } from 'lucide-react'
import { ColumnFilter, ColumnMenu, type FilterCondition, type FilterField, type LookupSearch } from '@betinhos/ui'
import { isFilterable, toCondition, toFilterField, toViewFilters } from '../data/column-filter'
import { resolveFilterOption, searchFilterOptions } from '../data/filter-options'
import type { CatalogField, ViewFilter, ViewSort } from '../data/views'

export type ActiveColumnFilter = { filter: ViewFilter; index: number; groupId?: string; groupLabel?: string }

type Props = {
  id: string
  label: string
  type: string
  field?: CatalogField
  filters: ActiveColumnFilter[]
  sort: ViewSort | undefined
  displayValue: (value: string) => string
  referenceClass?: string
  canHide: boolean
  pinned: boolean
  /** Troca os filtros da coluna fora dos grupos pelos da condição aplicada. */
  onApply: (filters: ViewFilter[]) => void
  onClear: () => void
  onSort: (descending: boolean) => void
  onHide: () => void
  onTogglePin: () => void
  onBeforeOpen: () => void
  onClose: () => void
  /** Sem a metadata a ordenação e o filtro ainda não valem: só o rótulo. */
  disabled?: boolean
}

type Panel = { request: number; anchor: HTMLElement; field: FilterField; value: FilterCondition | undefined }

/** Título da coluna no padrão do DS (§10.9.2): menu Ordenar/Filtrar/Limpar/Fixar/Ocultar e o painel "Filtrar por". */
export function ColumnHeader({ id, label, type, field, filters, sort, displayValue, referenceClass = '', canHide, pinned, onApply, onClear, onSort, onHide, onTogglePin, onBeforeOpen, onClose, disabled = false }: Props) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const openRequest = useRef(0)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const filterType = field?.type ?? type
  const filterField = toFilterField(id, label, filterType)
  // Lookup busca por texto; opção (Picklist/State/Status) lista todas de uma vez, sem exigir 2 letras.
  const isChoice = Boolean(field) && filterField.kind === 'lookup' && field?.type !== 'Lookup'
  const search: LookupSearch | undefined = field && filterField.kind === 'lookup' && !isChoice ? (_, text) => searchFilterOptions(field, text) : undefined

  const openFilter = async () => {
    const anchor = rootRef.current?.querySelector<HTMLElement>('.bt-colhead')
    if (!anchor) return
    const request = ++openRequest.current
    const root = filters.filter((item) => !item.groupId).map((item) => item.filter)
    // Condição de grupo não cabe no filtro da coluna: o painel abre vazio e Aplicar só mexe nos filtros fora dos grupos.
    const grouped = filters.some((item) => item.groupId)
    const labels = new Map<string, string>()
    let panelField = filterField
    if (isChoice && field) {
      const options = await searchFilterOptions(field, '').catch(() => [])
      panelField = { ...filterField, kind: 'choice', options }
      options.forEach((option) => labels.set(option.value, option.label))
    } else if (!grouped && field && filterField.kind === 'lookup') {
      const values = [...new Set(root.flatMap((item) => item.values ?? [item.value]).filter(Boolean))]
      await Promise.all(values.map(async (value) => {
        const option = await resolveFilterOption(field, value).catch(() => undefined)
        labels.set(value, option?.label ?? 'Nome indisponível')
      }))
    }
    // Outro clique durante a busca dos nomes vence: este painel não abre mais.
    if (request !== openRequest.current) return
    const value = grouped ? undefined : toCondition(panelField, root, (item) => labels.get(item) ?? displayValue(item))
    setPanel({ request, anchor, field: panelField, value })
  }

  // Estável: o painel do DS refaz o efeito (e devolve o foco ao 1º campo) quando onClose muda de identidade.
  const closeFilter = useCallback(() => { setPanel(null); onCloseRef.current() }, [])
  const thenClose = <A extends unknown[]>(action: (...args: A) => void) => (...args: A) => { action(...args); onClose() }
  const sortLabel = sort ? `, ordem ${sort.descending ? 'decrescente' : 'crescente'}` : ''

  if (disabled) return <span className={`column-header${referenceClass}`} aria-label={label}>{label}</span>

  return (
    <span ref={rootRef} role="group" className={`column-header${referenceClass}`} aria-label={`${label}${filters.length ? ', filtrada' : ''}${sortLabel}`} onMouseDownCapture={onBeforeOpen}>
      <ColumnMenu
        label={label}
        columnKey={id}
        sortIcon={sort ? <span className={`bt-colhead__sort${sort.descending ? ' is-desc' : ''}`} aria-hidden="true"><ArrowUp size={14} /></span> : undefined}
        filterable={isFilterable(filterType)}
        filtered={filters.length > 0}
        canHide={canHide}
        pinned={pinned}
        onSort={thenClose(onSort)}
        onFilter={() => { void openFilter() }}
        onClearFilter={thenClose(onClear)}
        onHide={thenClose(onHide)}
        onTogglePin={thenClose(onTogglePin)}
      />
      {panel && createPortal(
        <ColumnFilter
          key={panel.request}
          anchor={panel.anchor}
          field={panel.field}
          value={panel.value}
          search={search}
          onChange={(condition) => {
            if (condition) onApply(toViewFilters(id, panel.field.kind, condition))
            else onClear()
          }}
          onClose={closeFilter}
        />,
        document.body,
      )}
    </span>
  )
}
