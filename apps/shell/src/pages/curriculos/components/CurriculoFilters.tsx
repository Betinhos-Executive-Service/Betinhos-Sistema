import { Button, PageToolbar, SearchBox, Select, type SelectOption } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import { X } from 'lucide-react'
import type { ChoiceSet } from '../domain/types'
import { EMPTY_FILTERS, hasFilters, type Filters } from '../domain/funnel'

type Props = { filters: Filters; onChange: (filters: Filters) => void; cargos: string[]; choices: ChoiceSet }

const NOTAS: SelectOption[] = Array.from({ length: 11 }, (_, n) => ({ value: String(n), label: `Nota ${n} ou mais` }))
const toOptions = (list: ChoiceOption[]): SelectOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))
const toNumber = (value: string | null) => (value == null ? null : Number(value))
const toText = (value: number | null) => (value == null ? null : String(value))

/** Busca e filtros do funil; cada um pode ser limpo, e "Limpar filtros" zera tudo. */
export function CurriculoFilters({ filters, onChange, cargos, choices }: Props) {
  return (
    <PageToolbar
      variant="filters"
      label="Filtros de currículos"
      start={<>
        <SearchBox className="cv-filters__search" value={filters.query} onChange={(query) => onChange({ ...filters, query })} placeholder="Buscar por nome, telefone ou cidade" aria-label="Buscar currículos" />
        <Select className="cv-filters__select" aria-label="Cargo" placeholder="Cargo" clearable options={cargos.map((cargo) => ({ value: cargo, label: cargo }))} value={filters.cargo} onChange={(cargo) => onChange({ ...filters, cargo })} />
        <Select className="cv-filters__select" aria-label="Categoria da CNH" placeholder="CNH" searchable={false} clearable options={toOptions(choices.cnh)} value={toText(filters.cnh)} onChange={(value) => onChange({ ...filters, cnh: toNumber(value) })} />
        <Select className="cv-filters__select" aria-label="Origem do currículo" placeholder="Origem" searchable={false} clearable options={toOptions(choices.origem)} value={toText(filters.origem)} onChange={(value) => onChange({ ...filters, origem: toNumber(value) })} />
        <Select className="cv-filters__select" aria-label="Nota mínima" placeholder="Nota mínima" searchable={false} clearable options={NOTAS} value={toText(filters.notaMin)} onChange={(value) => onChange({ ...filters, notaMin: toNumber(value) })} />
      </>}
      end={hasFilters(filters) ? <Button variant="ghost" icon={<X size={16} />} onClick={() => onChange(EMPTY_FILTERS)}>Limpar filtros</Button> : undefined}
    />
  )
}
