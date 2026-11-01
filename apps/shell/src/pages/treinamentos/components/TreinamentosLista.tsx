import type { ReactNode } from 'react'
import { StatusBadge, Table, todaySaoPaulo, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { openFromRow, openRowActions } from '../../pagantes/components/PagantesList'
import type { Linha } from '../domain/lista'
import { fmtDia, formatDate, isPublicado, isVencido, publicoLabel } from '../domain/treinamentos'

type Props = { list: Linha[]; onOpen: (id: string) => void; loading?: boolean; view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

const exigencias = (t: Linha) => [t.exigeAssinatura && 'Assinatura', t.exigeQuiz && 'Quiz'].filter(Boolean).join(' · ') || 'Leitura'

function Situacao({ t }: { t: Linha }) {
  const publicado = isPublicado(t)
  return <StatusBadge tone={publicado ? 'success' : 'neutral'}>{publicado ? 'Publicado' : 'Rascunho'}</StatusBadge>
}

function Validade({ t, hoje }: { t: Linha; hoje: string }) {
  if (!t.validade) return <span className="tr-muted">—</span>
  return <span className="tr-badges">{fmtDia(t.validade)}{isVencido(t, hoje) ? <StatusBadge tone="danger">Vencido</StatusBadge> : null}</span>
}

export function TreinamentosTable({ list, onOpen, loading, view, quickFilters, footer, empty }: Props) {
  const hoje = todaySaoPaulo()
  const columns: TableColumn<Linha>[] = [
    { key: 'titulo', header: 'Treinamento', label: 'Treinamento', sortable: true, defaultWidth: 240, width: 'minmax(200px, 2fr)', cell: (t) => <button type="button" className="tr-open" onClick={() => onOpen(t.id)}><strong>{t.titulo || 'Sem título'}</strong>{t.descricao ? <small>{t.descricao}</small> : null}</button> },
    { key: 'estado', header: 'Situação', label: 'Situação', sortable: true, defaultWidth: 120, width: 'minmax(110px, .7fr)', cell: (t) => <Situacao t={t} /> },
    { key: 'publico', header: 'Público-alvo', label: 'Público-alvo', sortable: true, defaultWidth: 150, width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: publicoLabel },
    { key: 'exigencias', header: 'Exige', label: 'Exige', sortable: true, defaultWidth: 130, width: 'minmax(120px, .9fr)', hideBelow: 'compact', cell: exigencias },
    { key: 'validade', header: 'Validade', label: 'Validade', sortable: true, defaultWidth: 150, width: 'minmax(140px, .9fr)', cell: (t) => <Validade t={t} hoje={hoje} /> },
    { key: 'publicadoEm', header: 'Publicado em', label: 'Publicado em', sortable: true, defaultWidth: 150, width: 'minmax(140px, .9fr)', hideBelow: 'compact', cell: (t) => <span className="tr-num">{formatDate(t.publicadoEm) || '—'}</span> },
    { key: 'criado', header: 'Criado em', label: 'Criado em', sortable: true, defaultWidth: 150, width: 'minmax(140px, .9fr)', hideBelow: 'compact', cell: (t) => <span className="tr-num">{formatDate(t.criadoEm) || '—'}</span> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.tr-open')}>
      <Table className="tr-table" columns={columns} rows={list} rowKey={(t) => t.id} rowActions={openRowActions(onOpen)} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function TreinamentosCards({ list, onOpen }: Pick<Props, 'list' | 'onOpen'>) {
  const hoje = todaySaoPaulo()
  return (
    <ul className="tr-cards" aria-label="Treinamentos" onClick={(event) => openFromRow(event, '.tr-card', '.tr-open')}>
      {list.map((t) => (
        <li key={t.id} className="tr-card">
          <button type="button" className="tr-open" onClick={() => onOpen(t.id)}><strong>{t.titulo || 'Sem título'}</strong><small>{[publicoLabel(t), exigencias(t)].join(' · ')}</small></button>
          <div className="tr-card__foot"><Validade t={t} hoje={hoje} /><Situacao t={t} /></div>
        </li>
      ))}
    </ul>
  )
}
