import type { ReactNode } from 'react'
import { StatusBadge, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { VirtualTable } from '../../../app/VirtualTable'
import { Copy, Paperclip, Sparkles } from 'lucide-react'
import { openFromRow, openRowActions } from '../../pagantes/components/PagantesList'
import { formatDate, formatMoney } from '../../pagantes/domain/messages'
import { label } from '../../pagantes/domain/status'
import { suspeitaIA } from '../domain/ia'
import { financeiroTone, operacionalTone, semComprovante } from '../domain/status'
import type { Despesa, DespesaChoices } from '../domain/types'

type Props = { list: Despesa[]; choices: DespesaChoices; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

export const titulo = (d: Despesa) => d.estabelecimento || d.nome || 'Despesa sem nome'

export function OperacionalBadge({ d, choices }: { d: Despesa; choices: DespesaChoices }) {
  return <StatusBadge tone={operacionalTone(d.statusOperacional)} dot>{label(choices.operacional, d.statusOperacional, 'Sem status')}</StatusBadge>
}

export function FinanceiroBadge({ d, choices }: { d: Despesa; choices: DespesaChoices }) {
  return <StatusBadge tone={financeiroTone(d.statusFinanceiro)}>{label(choices.financeiro, d.statusFinanceiro, 'Sem status')}</StatusBadge>
}

/** Sinais que pedem atenção, sempre com texto (DS §3.6). */
export function Alertas({ d }: { d: Despesa }) {
  if (!d.possivelDuplicidade && !semComprovante(d)) return null
  return (
    <span className="dp-alertas">
      {d.possivelDuplicidade ? <StatusBadge tone="warning" icon={<Copy size={12} />}>Possível duplicidade</StatusBadge> : null}
      {semComprovante(d) ? <StatusBadge tone="neutral" icon={<Paperclip size={12} />}>Sem comprovante</StatusBadge> : null}
    </span>
  )
}

function OpenName({ d, onOpen }: { d: Despesa; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="pg-open" onClick={() => onOpen(d.id)}>
      <strong>{titulo(d)}</strong>
      <span>{[d.categoria || 'Sem categoria', d.forma].filter(Boolean).join(' · ')}</span>
    </button>
  )
}

export function DespesasTable({ list, choices, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  const columns: TableColumn<Despesa>[] = [
    { key: 'despesa', header: 'Despesa', label: 'Despesa', sortable: true, defaultWidth: 280, width: 'minmax(190px, 1.6fr)', cell: (d) => <OpenName d={d} onOpen={onOpen} /> },
    { key: 'data', header: 'Data', label: 'Data', sortable: true, defaultWidth: 130, width: 'minmax(92px, .7fr)', cell: (d) => <span className="pg-num">{formatDate(d.data)}</span> },
    { key: 'motorista', header: 'Motorista', label: 'Motorista', sortable: true, defaultWidth: 190, width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (d) => d.motorista || '—' },
    { key: 'valor', header: 'Valor', label: 'Valor', sortable: true, defaultWidth: 130, width: 'minmax(100px, .8fr)', align: 'end', cell: (d) => <span className="pg-num">{formatMoney(d.valor)}</span> },
    { key: 'operacional', header: 'Operacional', label: 'Operacional', sortable: true, defaultWidth: 170, width: 'minmax(140px, 1fr)', cell: (d) => <OperacionalBadge d={d} choices={choices} /> },
    { key: 'financeiro', header: 'Financeiro', label: 'Financeiro', sortable: true, defaultWidth: 190, width: 'minmax(150px, 1fr)', hideBelow: 'compact', cell: (d) => <FinanceiroBadge d={d} choices={choices} /> },
    { key: 'alertas', header: 'Alertas', label: 'Alertas', defaultWidth: 220, width: 'minmax(150px, 1fr)', hideBelow: 'compact', cell: (d) => <Alertas d={d} /> },
  ]
  return (
    <div className="pg-table-wrap" onClick={(event) => openFromRow(event, '.bt-table__row', '.pg-open')}>
      <VirtualTable className="pg-table" columns={columns} rows={list} rowKey={(d) => d.id} rowActions={openRowActions(onOpen)} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

/** Celular: cartão com local, valor, data, motorista e status. */
export function DespesasCards({ list, choices, onOpen }: Props) {
  return (
    <ul className="pg-cards" aria-label="Despesas" onClick={(event) => openFromRow(event, '.pg-card', '.pg-card__open')}>
      {list.map((d) => (
        <li key={d.id} className="pg-card">
          <button type="button" className="pg-card__open" onClick={() => onOpen(d.id)}>
            <span className="pg-card__top">
              <strong className="pg-card__name">{titulo(d)}</strong>
              <span className="pg-num pg-card__value">{formatMoney(d.valor)}</span>
            </span>
            <span className="pg-card__meta">{[formatDate(d.data), d.motorista, d.categoria].filter(Boolean).join(' · ')}</span>
          </button>
          <div className="pg-card__foot"><OperacionalBadge d={d} choices={choices} /><FinanceiroBadge d={d} choices={choices} /><Alertas d={d} /></div>
        </li>
      ))}
    </ul>
  )
}
