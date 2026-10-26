import type { ReactNode } from 'react'
import { Table, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { openFromRow } from '../../pagantes/components/PagantesList'
import type { Cliente } from '../domain/types'

type Props = { list: Cliente[]; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

const day = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
export const fmtDay = (d: Date | null) => (d ? day.format(d) : '—')

function OpenName({ c, onOpen }: { c: Cliente; onOpen: (id: string) => void }) {
  return <button type="button" className="cl-open" onClick={() => onOpen(c.id)}><strong>{c.nome || 'Sem nome'}</strong></button>
}

export function ClientesTable({ list, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  const columns: TableColumn<Cliente>[] = [
    { key: 'nome', header: 'Cliente', label: 'Cliente', sortable: true, defaultWidth: 280, width: 'minmax(180px, 1.4fr)', cell: (c) => <OpenName c={c} onOpen={onOpen} /> },
    { key: 'registro', header: 'Registro', label: 'Registro', sortable: true, defaultWidth: 160, width: 'minmax(110px, .7fr)', cell: (c) => c.registro || '—' },
    { key: 'endereco', header: 'Endereço', label: 'Endereço', sortable: true, defaultWidth: 360, width: 'minmax(180px, 2fr)', hideBelow: 'compact', cell: (c) => <span className="cl-ellipsis" title={c.endereco}>{c.endereco || '—'}</span> },
    { key: 'criado', header: 'Cadastro', label: 'Cadastro', sortable: true, defaultWidth: 120, width: 'minmax(96px, .6fr)', hideBelow: 'compact', cell: (c) => <span className="cl-num">{fmtDay(c.criadoEm)}</span> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.cl-open')}>
      <Table className="cl-table" columns={columns} rows={list} rowKey={(c) => c.id} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function ClientesCards({ list, onOpen }: Props) {
  return (
    <ul className="cl-cards" aria-label="Clientes" onClick={(event) => openFromRow(event, '.cl-card', '.cl-card__open')}>
      {list.map((c) => (
        <li key={c.id} className="cl-card">
          <button type="button" className="cl-card__open" onClick={() => onOpen(c.id)}>
            <strong className="cl-card__name">{c.nome || 'Sem nome'}</strong>
            <span className="cl-card__meta">{[c.registro, c.endereco].filter(Boolean).join(' · ') || 'Sem endereço'}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
