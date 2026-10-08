import { Button, Menu, PageToolbar, SearchBox, Select, type SelectOption } from '@betinhos/ui'
import { Bookmark, BookmarkPlus, Trash2, X } from 'lucide-react'
import { EMPTY_FILTERS, PERIODOS, hasFilters, viewFilters, type Filters, type Periodo, type View } from '../domain/filters'
import type { OpChoices } from '../domain/types'

type Props = {
  filters: Filters
  onChange: (filters: Filters, viewId?: string) => void
  choices: OpChoices
  views: View[]
  activeView: View | null
  onSaveView: () => void
  onDeleteView: (view: View) => void
}

/** Visões (prontas e salvas), busca, período e status; o período recarrega a lista. */
export function OpsToolbar({ filters, onChange, choices, views, activeView, onSaveView, onDeleteView }: Props) {
  const viewOptions: SelectOption[] = views.map((v) => ({ value: v.id, label: v.nome, group: v.builtin ? 'Visões prontas' : 'Minhas visões' }))
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  return (
    <PageToolbar
      variant="filters"
      label="Filtros de ordens de pagamento"
      start={<>
        <Select className="pg-filters__view" aria-label="Visão" placeholder="Filtros avulsos" searchable={false} clearable={false} options={viewOptions} value={activeView?.id ?? null}
          onChange={(id) => { const view = views.find((v) => v.id === id); if (view) onChange(viewFilters(view, filters.query), view.id) }} />
        <SearchBox className="pg-filters__search" value={filters.query} onChange={(query) => set({ query })} placeholder="Buscar por OP, cliente, passageiro ou trajeto" aria-label="Buscar ordens de pagamento" />
        <Select className="pg-filters__select" aria-label="Período de criação" searchable={false} clearable={false} options={PERIODOS} value={filters.periodo} onChange={(periodo) => set({ periodo: (periodo ?? EMPTY_FILTERS.periodo) as Periodo })} />
        <Select className="pg-filters__select" aria-label="Status da OP" placeholder="Status" multiple searchable={false} clearable
          options={choices.status.map((o) => ({ value: String(o.value), label: o.label }))} value={filters.status.map(String)} onChange={(values) => set({ status: values.map(Number) })} />
      </>}
      end={<>
        {hasFilters(filters) ? <Button variant="ghost" icon={<X size={16} />} onClick={() => onChange({ ...EMPTY_FILTERS })}>Limpar filtros</Button> : null}
        <Menu
          trigger={(props) => <Button {...props} variant="secondary" icon={<Bookmark size={16} />}>Visões</Button>}
          actions={[
            { id: 'salvar', label: 'Salvar filtros como visão', icon: <BookmarkPlus size={16} />, onSelect: onSaveView },
            ...views.filter((v) => !v.builtin).map((v) => ({ id: `excluir-${v.id}`, label: `Excluir visão “${v.nome}”`, icon: <Trash2 size={16} />, tone: 'danger' as const, onSelect: () => onDeleteView(v) })),
          ]}
        />
      </>}
    />
  )
}
