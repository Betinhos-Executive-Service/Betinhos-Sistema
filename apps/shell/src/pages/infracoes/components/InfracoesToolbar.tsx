import { Button, Checkbox, PageToolbar, SearchBox, Select, type SelectOption } from '@betinhos/ui'
import { X } from 'lucide-react'
import { COMPETENCIA, GRAVIDADE, RESPONSABILIDADE } from '../domain/choices'
import { EMPTY_FILTERS, hasFilters, type Filters, type Situacao } from '../domain/filters'

type Props = { filters: Filters; onChange: (filters: Filters) => void }

const toOptions = (list: { value: number; label: string }[]): SelectOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))
const SITUACAO: SelectOption[] = [{ value: 'ativas', label: 'Ativas' }, { value: 'inativas', label: 'Inativas' }, { value: 'todas', label: 'Ativas e inativas' }]
const single = (v: number | null) => (v == null ? null : String(v))
const toNum = (v: string | null) => (v == null ? null : Number(v))

/** Busca e filtros do catálogo de infrações. */
export function InfracoesToolbar({ filters, onChange }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  return (
    <PageToolbar
      variant="filters"
      label="Filtros de infrações"
      start={<>
        <SearchBox className="if-filters__search" value={filters.query} onChange={(query) => set({ query })} placeholder="Buscar por código, descrição ou artigo" aria-label="Buscar infrações" />
        <Select className="if-filters__select" aria-label="Gravidade" placeholder="Gravidade" multiple searchable={false} clearable
          options={toOptions(GRAVIDADE)} value={filters.gravidade.map(String)} onChange={(values) => set({ gravidade: values.map(Number) })} />
        <Select className="if-filters__select" aria-label="Competência" placeholder="Competência" searchable={false} clearable
          options={toOptions(COMPETENCIA)} value={single(filters.competencia)} onChange={(v) => set({ competencia: toNum(v) })} />
        <Select className="if-filters__select" aria-label="Responsável" placeholder="Responsável" searchable={false} clearable
          options={toOptions(RESPONSABILIDADE)} value={single(filters.responsabilidade)} onChange={(v) => set({ responsabilidade: toNum(v) })} />
        <Select className="if-filters__select" aria-label="Situação" searchable={false} clearable={false}
          options={SITUACAO} value={filters.situacao} onChange={(v) => set({ situacao: (v ?? 'ativas') as Situacao })} />
        <Checkbox label="Só com multas" checked={filters.comMultas} onChange={(event) => set({ comMultas: event.currentTarget.checked })} />
      </>}
      end={hasFilters(filters) ? <Button variant="ghost" icon={<X size={16} />} onClick={() => onChange({ ...EMPTY_FILTERS })}>Limpar filtros</Button> : undefined}
    />
  )
}
