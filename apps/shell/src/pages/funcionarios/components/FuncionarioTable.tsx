import { Button, EmptyState } from '@betinhos/ui'
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { ASO_VALIDADE_MESES } from '../data/alerts'
import { addMonths, formatBR } from '../data/dates'
import type { Filters, SortKey } from '../data/filters'
import { FUNCAO, optionLabel } from '../data/schema'
import type { FuncionarioView } from '../data/types'
import { AlertBadge, Avatar, StatusBadge } from './Badges'

type Props = {
  rows: FuncionarioView[]
  filters: Filters
  selectedId: string | null
  onSort: (key: SortKey) => void
  onOpen: (id: string) => void
  onReset: () => void
}

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: 'nome', label: 'Colaborador' },
  { key: 'funcao', label: 'Função' },
  { key: 'status', label: 'Status' },
  { key: null, label: 'Contato' },
  { key: null, label: 'Veículo atual' },
  { key: 'cnh', label: 'CNH' },
  { key: 'aso', label: 'ASO vence' },
  { key: 'admissao', label: 'Admissão' },
]

function onRowKey(event: KeyboardEvent<HTMLTableRowElement>, id: string, onOpen: (id: string) => void) {
  const row = event.currentTarget
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen(id)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    ;(row.nextElementSibling as HTMLElement | null)?.focus()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    ;(row.previousElementSibling as HTMLElement | null)?.focus()
  }
}

export function FuncionarioTable({ rows, filters, selectedId, onSort, onOpen, onReset }: Props) {
  if (!rows.length) {
    return (
      <div className="table-wrap">
        <EmptyState icon={<SearchX />} title="Nenhum colaborador encontrado para estes filtros." action={<Button variant="secondary" onClick={onReset}>Limpar filtros</Button>}>
          Revise a busca ou limpe os filtros para ver a lista completa.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.label} scope="col" aria-sort={column.key && filters.sort === column.key ? (filters.desc ? 'descending' : 'ascending') : undefined}>
                {column.key ? (
                  <button type="button" className="th-sort" onClick={() => onSort(column.key!)}>
                    {column.label}
                    {filters.sort === column.key ? (filters.desc ? <ArrowDown size={14} aria-hidden /> : <ArrowUp size={14} aria-hidden />) : <ArrowUpDown size={14} aria-hidden className="th-sort-idle" />}
                  </button>
                ) : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const v = row.values
            const nome = String(v.cr40f_nomecompleto ?? '')
            const cnh = row.alertas.find((alerta) => alerta.kind === 'cnh')
            const aso = row.alertas.find((alerta) => alerta.kind === 'aso')
            const aniversario = row.alertas.find((alerta) => alerta.kind === 'aniversario')
            return (
              <tr key={row.id} tabIndex={0} aria-selected={row.id === selectedId} onClick={() => onOpen(row.id)} onKeyDown={(event) => onRowKey(event, row.id, onOpen)}>
                <td data-label="Colaborador">
                  <div className="person">
                    <Avatar name={nome} src={row.fotoThumb} />
                    <div>
                      <strong>{nome || 'Sem nome'}</strong>
                      <span className="muted">{String(v.new_apelido ?? '')}{aniversario && <> · <AlertBadge alerta={aniversario} /></>}</span>
                    </div>
                  </div>
                </td>
                <td data-label="Função">{optionLabel(FUNCAO, v.cr40f_funcao)}</td>
                <td data-label="Status"><StatusBadge value={v.cr40f_status} /></td>
                <td data-label="Contato" className="nowrap">{String(v.cr40f_telefonecorporativo ?? v.cr40f_telefonepessoal ?? '—')}</td>
                <td data-label="Veículo">{row.veiculo?.label ?? <span className="muted">—</span>}</td>
                <td data-label="CNH" className="nowrap">{cnh ? <AlertBadge alerta={cnh} /> : formatBR(v.cr40f_validadedacnh as string) || <span className="muted">—</span>}</td>
                <td data-label="ASO vence" className="nowrap">{aso ? <AlertBadge alerta={aso} /> : v.cr40f_datadoaso ? formatBR(addMonths(v.cr40f_datadoaso as string, ASO_VALIDADE_MESES)) : <span className="muted">—</span>}</td>
                <td data-label="Admissão" className="nowrap">{formatBR(v.cr40f_datadeadmissao as string) || <span className="muted">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Carregamento no formato final da tabela: cabeçalho e linhas de esqueleto. */
FuncionarioTable.Skeleton = function FuncionarioTableSkeleton() {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Carregando colaboradores">
      <table className="grid">
        <thead><tr>{COLUMNS.map((column) => <th key={column.label} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <tr key={n} className="grid-skeleton" aria-hidden>
              <td><div className="person"><span className="bt-skeleton bt-skeleton--circle" /><span className="bt-skeleton bt-skeleton--text" style={{ width: 160 }} /></div></td>
              {COLUMNS.slice(1).map((column) => <td key={column.label}><span className="bt-skeleton bt-skeleton--text" style={{ width: 72 }} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
