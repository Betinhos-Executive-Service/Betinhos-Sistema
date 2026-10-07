import { Button, Checkbox, Menu, PageToolbar, SearchBox, Select, type SelectOption } from '@betinhos/ui'
import { Bookmark, BookmarkPlus, Trash2, X } from 'lucide-react'
import { EMPTY_FILTERS, PERIODOS, hasFilters, viewFilters, type Filters, type Periodo, type ReciboFiltro, type View } from '../domain/filters'
import type { ChoiceSet } from '../domain/types'

type Props = {
  filters: Filters
  onChange: (filters: Filters) => void
  choices: ChoiceSet
  views: View[]
  activeView: View | null
  onSaveView: () => void
  onDeleteView: (view: View) => void
}

const RECIBOS: SelectOption[] = [{ value: 'nao-enviado', label: 'Recibo não enviado' }, { value: 'enviado', label: 'Recibo enviado' }]

/** Visões (prontas e salvas), busca e filtros; o período recarrega a lista. */
export function PagantesToolbar({ filters, onChange, choices, views, activeView, onSaveView, onDeleteView }: Props) {
  const viewOptions: SelectOption[] = views.map((v) => ({ value: v.id, label: v.nome, group: v.builtin ? 'Visões prontas' : 'Minhas visões' }))
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  return (
    <PageToolbar
      variant="filters"
      label="Filtros de pagantes"
      start={<>
        <Select className="pg-filters__view" aria-label="Visão" placeholder="Filtros avulsos" searchable={false} clearable={false} options={viewOptions} value={activeView?.id ?? null}
          onChange={(id) => { const view = views.find((v) => v.id === id); if (view) onChange(viewFilters(view, filters.query)) }} />
        <SearchBox className="pg-filters__search" value={filters.query} onChange={(query) => set({ query })} placeholder="Buscar por pagante, PAG, OP, telefone ou e-mail" aria-label="Buscar pagantes" />
        <Select className="pg-filters__select" aria-label="Período de criação" searchable={false} clearable={false} options={PERIODOS} value={filters.periodo} onChange={(periodo) => set({ periodo: (periodo ?? EMPTY_FILTERS.periodo) as Periodo })} />
        <Select className="pg-filters__select" aria-label="Status do pagamento" placeholder="Pagamento" multiple searchable={false} clearable
          options={choices.status.map((o) => ({ value: String(o.value), label: o.label }))} value={filters.status.map(String)} onChange={(values) => set({ status: values.map(Number) })} />
        <Select className="pg-filters__select" aria-label="Forma de pagamento" placeholder="Forma" searchable={false} clearable
          options={choices.forma.map((o) => ({ value: String(o.value), label: o.label }))} value={filters.forma == null ? null : String(filters.forma)} onChange={(value) => set({ forma: value == null ? null : Number(value) })} />
        <Select className="pg-filters__select" aria-label="Recibo" placeholder="Recibo" searchable={false} clearable options={RECIBOS} value={filters.recibo} onChange={(value) => set({ recibo: value as ReciboFiltro | null })} />
        <Checkbox label="Só com falha de envio" checked={filters.falhas} onChange={(event) => set({ falhas: event.currentTarget.checked })} />
      </>}
      end={<>
        {hasFilters(filters) ? <Button variant="ghost" icon={<X size={16} />} onClick={() => onChange({ ...EMPTY_FILTERS })}>Limpar filtros</Button> : null}
        <Menu
          trigger={(props) => <Button {...props} variant="secondary" icon={<Bookmark size={16} />}>Visões</Button>}
          actions={[
            { id: 'salvar', label: 'Salvar filtros como visão', icon: <BookmarkPlus size={16} />, onSelect: onSaveView },
            ...(activeView && !activeView.builtin ? [{ id: 'excluir', label: `Excluir visão “${activeView.nome}”`, icon: <Trash2 size={16} />, tone: 'danger' as const, onSelect: () => onDeleteView(activeView) }] : []),
          ]}
        />
      </>}
    />
  )
}
