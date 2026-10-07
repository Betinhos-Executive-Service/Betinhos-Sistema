import { Button, Checkbox, Menu, PageToolbar, SearchBox, Select, type SelectOption } from '@betinhos/ui'
import { Bookmark, BookmarkPlus, Trash2, X } from 'lucide-react'
import { EMPTY_FILTERS, hasFilters, viewFilters, type Filters, type View } from '../domain/filters'
import type { ChoiceSet } from '../domain/types'

type Props = {
  filters: Filters
  onChange: (filters: Filters, viewId?: string) => void
  choices: ChoiceSet
  clientes: SelectOption[]
  views: View[]
  activeView: View | null
  onSaveView: () => void
  onDeleteView: (view: View) => void
}

const toOptions = (list: { value: number; label: string }[]): SelectOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Visões (prontas e salvas), busca e filtros da lista de pessoas. */
export function PessoasToolbar({ filters, onChange, choices, clientes, views, activeView, onSaveView, onDeleteView }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const viewOptions: SelectOption[] = views.map((v) => ({ value: v.id, label: v.nome, group: v.builtin ? 'Visões prontas' : 'Minhas visões' }))
  return (
    <PageToolbar
      variant="filters"
      label="Filtros de pessoas"
      start={<>
        <Select className="ps-filters__view" aria-label="Visão" placeholder="Filtros avulsos" searchable={false} clearable={false} options={viewOptions} value={activeView?.id ?? null}
          onChange={(id) => { const view = views.find((v) => v.id === id); if (view) onChange(viewFilters(view, filters.query), view.id) }} />
        <SearchBox className="ps-filters__search" value={filters.query} onChange={(query) => set({ query })} placeholder="Buscar por nome, cliente, celular ou e-mail" aria-label="Buscar pessoas" />
        <Select className="ps-filters__select" aria-label="Cliente" placeholder="Cliente" clearable options={clientes} value={filters.clienteId} onChange={(clienteId) => set({ clienteId })} />
        <Select className="ps-filters__select" aria-label="Classificação" placeholder="Classificação" multiple searchable={false} clearable
          options={toOptions(choices.classificacao)} value={filters.classificacao.map(String)} onChange={(values) => set({ classificacao: values.map(Number) })} />
        <Select className="ps-filters__select" aria-label="Idioma" placeholder="Idioma" searchable={false} clearable options={toOptions(choices.idioma)}
          value={filters.idioma == null ? null : String(filters.idioma)} onChange={(v) => set({ idioma: v == null ? null : Number(v) })} />
        <Select className="ps-filters__select" aria-label="Status" placeholder="Status" searchable={false} clearable options={toOptions(choices.status)}
          value={filters.status == null ? null : String(filters.status)} onChange={(v) => set({ status: v == null ? null : Number(v) })} />
        <Checkbox label="Só possíveis duplicados" checked={filters.duplicados} onChange={(event) => set({ duplicados: event.currentTarget.checked })} />
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
