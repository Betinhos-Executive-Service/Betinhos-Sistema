import type { ReactNode } from 'react'
import { StatusBadge, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { formatDay } from '../../../app/format'
import { ListTable } from '../../../app/ListTable'
import { openFromRow, openRowActions } from '../../pagantes/components/PagantesList'
import { statusLabel, statusTone } from '../domain/choices'
import { atrasado, hojeIso } from '../domain/regras'
import type { ProjetoLinha } from '../domain/types'

type Props = { list: ProjetoLinha[]; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

export const StatusSelo = ({ p }: { p: ProjetoLinha }) => <StatusBadge tone={statusTone(p.status)}>{statusLabel(p.status)}</StatusBadge>

/** Barra de andamento com o percentual escrito ao lado (a cor sozinha não informa). */
export function Andamento({ valor }: { valor: number }) {
  return (
    <span className="pj-prog">
      <span className="pj-prog__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor} aria-label="Andamento"><span style={{ width: `${valor}%` }} /></span>
      <span className="pj-num">{valor}%</span>
    </span>
  )
}

export function Prazo({ p }: { p: ProjetoLinha }) {
  if (!p.prazo) return <span className="pj-muted">Sem prazo</span>
  return <span className="pj-badges"><span className="pj-num">{formatDay(p.prazo)}</span>{atrasado(p, hojeIso()) ? <StatusBadge tone="danger">Atrasado</StatusBadge> : null}</span>
}

export function ProjetosTable({ list, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  const columns: TableColumn<ProjetoLinha>[] = [
    { key: 'projeto', header: 'Projeto', label: 'Projeto', sortable: true, defaultWidth: 220, width: 'minmax(180px, 2fr)', cell: (p) => <button type="button" className="pj-open" onClick={() => onOpen(p.id)}><strong>{p.nome || 'Sem nome'}</strong></button> },
    { key: 'status', header: 'Status', label: 'Status', sortable: true, defaultWidth: 140, width: 'minmax(120px, .9fr)', cell: (p) => <StatusSelo p={p} /> },
    { key: 'andamento', header: 'Andamento', label: 'Andamento', sortable: true, defaultWidth: 150, width: 'minmax(130px, 1fr)', cell: (p) => <Andamento valor={p.andamento} /> },
    { key: 'prazo', header: 'Prazo', label: 'Prazo', sortable: true, defaultWidth: 160, width: 'minmax(140px, 1fr)', cell: (p) => <Prazo p={p} /> },
    { key: 'area', header: 'Área', label: 'Área', sortable: true, defaultWidth: 120, width: 'minmax(100px, .8fr)', hideBelow: 'compact', cell: (p) => p.area || '—' },
    { key: 'responsavel', header: 'Responsável', label: 'Responsável', sortable: true, defaultWidth: 140, width: 'minmax(120px, 1fr)', hideBelow: 'compact', cell: (p) => p.responsavel || '—' },
    { key: 'ultima', header: 'Última atualização', label: 'Última atualização', sortable: true, defaultWidth: 140, width: 'minmax(130px, 1fr)', hideBelow: 'compact', cell: (p) => <span className="pj-num">{formatDay(p.ultimaEm) || '—'}</span> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.pj-open')}>
      <ListTable className="pj-table" columns={columns} rows={list} rowKey={(p) => p.id} rowActions={openRowActions(onOpen)} loading={loading} loadingLabel="Carregando projetos" view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function ProjetosCards({ list, onOpen }: Props) {
  return (
    <ul className="pj-cards" aria-label="Projetos" onClick={(event) => openFromRow(event, '.pj-card', '.pj-card__open')}>
      {list.map((p) => (
        <li key={p.id} className="pj-card">
          <button type="button" className="pj-card__open" onClick={() => onOpen(p.id)}>
            <strong className="pj-card__name">{p.nome || 'Sem nome'}</strong>
            <span className="pj-card__meta">{[p.area, p.responsavel].filter(Boolean).join(' · ')}</span>
          </button>
          <div className="pj-card__foot"><StatusSelo p={p} /><Andamento valor={p.andamento} /><Prazo p={p} /></div>
        </li>
      ))}
    </ul>
  )
}
