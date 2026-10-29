import type { ReactNode } from 'react'
import { StatusBadge, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { VirtualTable } from '../../../app/VirtualTable'
import { openFromRow, openRowActions } from '../../pagantes/components/PagantesList'
import { formatDate, formatMoney } from '../../pagantes/domain/messages'
import { label } from '../../pagantes/domain/status'
import { opTone } from '../domain/status'
import { valorOp, type Op, type OpChoices } from '../domain/types'

type Props = { list: Op[]; choices: OpChoices; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

/** "Fulano - telefone" por linha (texto do flow): na lista basta o nome. */
export function passageirosCurto(texto: string) {
  const nomes = texto.split(/\r?\n|;/).map((l) => l.split(/\s+-\s+/)[0].trim()).filter(Boolean)
  if (nomes.length <= 2) return nomes.join(', ')
  return `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}`
}

export function periodo(op: Pick<Op, 'primeiroServico' | 'ultimoServico'>) {
  const a = formatDate(op.primeiroServico)
  const b = formatDate(op.ultimoServico)
  if (!op.primeiroServico && !op.ultimoServico) return 'Sem data de serviço'
  return a === b || !op.ultimoServico ? a : `${a} a ${b}`
}

export function OpBadge({ op, choices }: { op: Op; choices: OpChoices }) {
  return <StatusBadge tone={opTone(op.status)} dot>{label(choices.status, op.status, 'Sem status')}</StatusBadge>
}

function OpenName({ op, onOpen }: { op: Op; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="pg-open" onClick={() => onOpen(op.id)}>
      <strong>{op.codigo || 'OP sem código'}</strong>
      <span>{op.cliente || 'Sem cliente'}</span>
    </button>
  )
}

export function OpsTable({ list, choices, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  const columns: TableColumn<Op>[] = [
    { key: 'op', header: 'OP', label: 'OP', sortable: true, defaultWidth: 220, width: 'minmax(160px, 1.3fr)', cell: (op) => <OpenName op={op} onOpen={onOpen} /> },
    { key: 'servicos', header: 'Serviços', label: 'Serviços', sortable: true, defaultWidth: 200, width: 'minmax(130px, 1fr)', cell: (op) => <span className="pg-num">{periodo(op)}</span> },
    { key: 'passageiros', header: 'Passageiros', label: 'Passageiros', sortable: true, defaultWidth: 240, width: 'minmax(160px, 1.4fr)', hideBelow: 'compact', cell: (op) => passageirosCurto(op.passageiros) || '—' },
    { key: 'valor', header: 'Valor', label: 'Valor', sortable: true, defaultWidth: 130, width: 'minmax(104px, .8fr)', align: 'end', cell: (op) => <span className="pg-num" title={op.valor == null && op.valorServicos != null ? 'Soma dos serviços' : undefined}>{formatMoney(valorOp(op))}</span> },
    { key: 'status', header: 'Status', label: 'Status', sortable: true, defaultWidth: 180, width: 'minmax(150px, 1fr)', cell: (op) => <OpBadge op={op} choices={choices} /> },
    { key: 'criada', header: 'Criada em', label: 'Criada em', sortable: true, defaultWidth: 130, width: 'minmax(88px, .7fr)', hideBelow: 'compact', cell: (op) => formatDate(op.criadoEm) },
  ]
  return (
    <div className="pg-table-wrap" onClick={(event) => openFromRow(event, '.bt-table__row', '.pg-open')}>
      <VirtualTable className="pg-table" columns={columns} rows={list} rowKey={(op) => op.id} rowActions={openRowActions(onOpen)} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

/** Celular: cartão com OP, cliente, valor, status e período. */
export function OpsCards({ list, choices, onOpen }: Props) {
  return (
    <ul className="pg-cards" aria-label="Ordens de pagamento" onClick={(event) => openFromRow(event, '.pg-card', '.pg-card__open')}>
      {list.map((op) => (
        <li key={op.id} className="pg-card">
          <button type="button" className="pg-card__open" onClick={() => onOpen(op.id)}>
            <span className="pg-card__top">
              <strong className="pg-card__name">{op.codigo || 'OP sem código'}</strong>
              <span className="pg-num pg-card__value">{formatMoney(valorOp(op))}</span>
            </span>
            <span className="pg-card__meta">{[op.cliente, periodo(op)].filter(Boolean).join(' · ')}</span>
          </button>
          <div className="pg-card__foot"><OpBadge op={op} choices={choices} /></div>
        </li>
      ))}
    </ul>
  )
}
