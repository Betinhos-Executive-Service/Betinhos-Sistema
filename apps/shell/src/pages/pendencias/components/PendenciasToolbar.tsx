import { Button, Menu, PageToolbar, SearchBox, Select, type SelectOption } from '@betinhos/ui'
import { Bookmark, BookmarkPlus, Trash2, X } from 'lucide-react'
import { EMPTY_FILTERS, PERIODOS, TIPOS, hasFilters, viewFilters, type Filters, type Periodo, type View } from '../domain/filters'
import { TIPO_LABEL, type TipoPendencia } from '../domain/types'

type Props = {
  filters: Filters
  onChange: (filters: Filters, viewId?: string) => void
  views: View[]
  activeView: View | null
  onSaveView: () => void
  onDeleteView: (view: View) => void
}

const TIPO_OPTIONS: SelectOption[] = TIPOS.map((t) => ({ value: t, label: TIPO_LABEL[t] }))

/** Visões (prontas e salvas), busca, período e tipos; o período recarrega a lista. */
export function PendenciasToolbar({ filters, onChange, views, activeView, onSaveView, onDeleteView }: Props) {
  const viewOptions: SelectOption[] = views.map((v) => ({ value: v.id, label: v.nome, group: v.builtin ? 'Visões prontas' : 'Minhas visões' }))
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  return (
    <PageToolbar
      variant="filters"
      label="Filtros de pendências"
      start={<>
        <Select className="pg-filters__view" aria-label="Visão" placeholder="Filtros avulsos" searchable={false} clearable={false} options={viewOptions} value={activeView?.id ?? null}
          onChange={(id) => { const view = views.find((v) => v.id === id); if (view) onChange(viewFilters(view, filters.q), view.id) }} />
        <SearchBox className="pg-filters__search" value={filters.q} onChange={(q) => set({ q })} placeholder="Buscar por OP, serviço ou cliente" aria-label="Buscar pendências" />
        <Select className="pg-filters__select" aria-label="Período do serviço" searchable={false} clearable={false} options={PERIODOS} value={filters.periodo} onChange={(periodo) => set({ periodo: (periodo ?? EMPTY_FILTERS.periodo) as Periodo })} />
        <Select className="pg-filters__select" aria-label="Tipo de pendência" placeholder="Tipos" multiple searchable={false} clearable
          options={TIPO_OPTIONS} value={filters.tipos} onChange={(values) => set({ tipos: values as TipoPendencia[] })} />
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
