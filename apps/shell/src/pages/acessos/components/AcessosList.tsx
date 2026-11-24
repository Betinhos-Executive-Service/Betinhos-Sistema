import type { ReactNode } from 'react'
import { StatusBadge, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { ListTable } from '../../../app/ListTable'
import { openFromRow } from '../../pagantes/components/PagantesList'
import { rotulos } from '../domain/perfis'
import type { Pessoa } from '../domain/types'
import { fmtQuando } from './HistoricoLista'

type Props = { list: Pessoa[]; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

/** Chips dos perfis. Administrador do Sistema vale como todos; sem perfil nenhum, a pessoa só abre o app. */
export function Perfis({ p }: { p: Pessoa }) {
  if (p.admin) return <span className="ac-chips"><StatusBadge tone="info">Administrador do Sistema</StatusBadge></span>
  const lista = rotulos(p.perfis)
  if (!lista.length) return <span className="ac-vazio">Só o Base</span>
  return <span className="ac-chips">{lista.map((r) => <StatusBadge key={r} tone="neutral">{r}</StatusBadge>)}</span>
}

function OpenName({ p, onOpen }: { p: Pessoa; onOpen: (id: string) => void }) {
  return <button type="button" className="ac-open" onClick={() => onOpen(p.id)}><strong>{p.nome || 'Sem nome'}</strong></button>
}

export function AcessosTable({ list, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  const columns: TableColumn<Pessoa>[] = [
    { key: 'nome', header: 'Pessoa', label: 'Pessoa', sortable: true, defaultWidth: 260, width: 'minmax(180px, 1.2fr)', cell: (p) => <OpenName p={p} onOpen={onOpen} /> },
    { key: 'email', header: 'E-mail', label: 'E-mail', sortable: true, defaultWidth: 260, width: 'minmax(180px, 1.2fr)', hideBelow: 'compact', cell: (p) => p.email || '—' },
    { key: 'perfis', header: 'Perfis', label: 'Perfis', sortable: true, defaultWidth: 360, width: 'minmax(220px, 2fr)', cell: (p) => <Perfis p={p} /> },
    { key: 'alterado', header: 'Última alteração', label: 'Última alteração', sortable: true, defaultWidth: 170, width: 'minmax(140px, .8fr)', hideBelow: 'compact', cell: (p) => fmtQuando(p.alteradoEm) },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.ac-open')}>
      <ListTable className="ac-table" columns={columns} rows={list} rowKey={(p) => p.id} loading={loading} loadingLabel="Carregando pessoas" view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function AcessosCards({ list, onOpen }: Props) {
  return (
    <ul className="ac-cards" aria-label="Pessoas" onClick={(event) => openFromRow(event, '.ac-card', '.ac-card__open')}>
      {list.map((p) => (
        <li key={p.id} className="ac-card">
          <button type="button" className="ac-card__open" onClick={() => onOpen(p.id)}>
            <strong className="ac-card__name">{p.nome || 'Sem nome'}</strong>
            <span className="ac-card__meta">{p.email || 'Sem e-mail'}</span>
          </button>
          <Perfis p={p} />
        </li>
      ))}
    </ul>
  )
}
