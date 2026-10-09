import { Button, Menu, PageToolbar, SearchBox, Select, type SelectOption } from '@betinhos/ui'
import { Bookmark, BookmarkPlus, Trash2, X } from 'lucide-react'
import { ALERTAS, EMPTY_FILTERS, PERIODOS, hasFilters, viewFilters, type Alerta, type Filters, type Periodo, type View } from '../domain/filters'
import type { DespesaChoices } from '../domain/types'

type Props = {
  filters: Filters
  onChange: (filters: Filters, viewId?: string) => void
  choices: DespesaChoices
  categorias: SelectOption[]
  motoristas: SelectOption[]
  views: View[]
  activeView: View | null
  onSaveView: () => void
  onDeleteView: (view: View) => void
}

const choiceOptions = (list: { value: number; label: string }[]) => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Visões (prontas e salvas), busca, período, status, categoria, motorista e alertas; o período recarrega a lista. */
export function DespesasToolbar({ filters, onChange, choices, categorias, motoristas, views, activeView, onSaveView, onDeleteView }: Props) {
  const viewOptions: SelectOption[] = views.map((v) => ({ value: v.id, label: v.nome, group: v.builtin ? 'Visões prontas' : 'Minhas visões' }))
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  return (
    <PageToolbar
      variant="filters"
      label="Filtros de despesas"
      start={<>
        <Select className="pg-filters__view" aria-label="Visão" placeholder="Filtros avulsos" searchable={false} clearable={false} options={viewOptions} value={activeView?.id ?? null}
          onChange={(id) => { const view = views.find((v) => v.id === id); if (view) onChange(viewFilters(view, filters.query), view.id) }} />
        <SearchBox className="pg-filters__search" value={filters.query} onChange={(query) => set({ query })} placeholder="Buscar por despesa, local, motorista, reserva ou protocolo" aria-label="Buscar despesas" />
        <Select className="pg-filters__select" aria-label="Período do gasto" searchable={false} clearable={false} options={PERIODOS} value={filters.periodo} onChange={(periodo) => set({ periodo: (periodo ?? EMPTY_FILTERS.periodo) as Periodo })} />
        <Select className="pg-filters__select" aria-label="Status operacional" placeholder="Operacional" multiple searchable={false} clearable
          options={choiceOptions(choices.operacional)} value={filters.operacional.map(String)} onChange={(values) => set({ operacional: values.map(Number) })} />
        <Select className="pg-filters__select" aria-label="Status financeiro" placeholder="Financeiro" multiple searchable={false} clearable
          options={choiceOptions(choices.financeiro)} value={filters.financeiro.map(String)} onChange={(values) => set({ financeiro: values.map(Number) })} />
        <Select className="pg-filters__select" aria-label="Categoria" placeholder="Categoria" multiple clearable options={categorias} value={filters.categoria} onChange={(categoria) => set({ categoria })} />
        <Select className="pg-filters__select" aria-label="Motorista" placeholder="Motorista" multiple clearable options={motoristas} value={filters.motorista} onChange={(motorista) => set({ motorista })} />
        <Select className="pg-filters__select" aria-label="Alertas" placeholder="Alertas" multiple searchable={false} clearable options={ALERTAS} value={filters.alertas} onChange={(alertas) => set({ alertas: alertas as Alerta[] })} />
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
