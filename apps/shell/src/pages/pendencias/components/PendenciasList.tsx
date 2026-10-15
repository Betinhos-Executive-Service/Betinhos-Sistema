import { Button, StatusBadge, Table, type StatusTone, type TableColumn } from '@betinhos/ui'
import { ExternalLink, Split, Wrench } from 'lucide-react'
import { openFromRow } from '../../pagantes/components/PagantesList'
import { formatDate, formatMoney } from '../../pagantes/domain/messages'
import { TIPO_LABEL, type Pendencia, type TipoPendencia } from '../domain/types'

export type Acoes = {
  onCorrigir: (p: Pendencia) => void
  onAbrirOp: (opId: string) => void
  onVerServico: (reservaId: string) => void
  onRateio: (p: Pendencia) => void
}
type Props = Acoes & { list: Pendencia[]; onOpen: (id: string) => void; loading?: boolean }

const TONE: Record<TipoPendencia, StatusTone> = {
  'op-paga-desalinhada': 'warning',
  'pago-sem-op-paga': 'info',
  'op-sem-pagamento-reserva-paga': 'warning',
  'rateio-nao-fecha': 'danger',
}

export function TipoBadge({ p }: { p: Pendencia }) {
  return <StatusBadge tone={TONE[p.tipo]} dot>{TIPO_LABEL[p.tipo]}</StatusBadge>
}

export const titulo = (p: Pendencia) => p.opCodigo || p.reservaCodigos[0] || 'Sem código'
export const servicosTexto = (n: number) => (n === 1 ? '1 serviço' : `${n} serviços`)

/** Ação conforme o tipo: Corrigir (1 e 3), Rateio (5), Abrir OP ou Ver serviço (2). */
export function AcaoPendencia({ p, onCorrigir, onAbrirOp, onVerServico, onRateio }: Acoes & { p: Pendencia }) {
  if (p.corrigivel) return <Button size="compact" variant="secondary" icon={<Wrench size={14} />} onClick={() => onCorrigir(p)}>Corrigir</Button>
  if (p.tipo === 'rateio-nao-fecha' && p.opId) return <Button size="compact" variant="secondary" icon={<Split size={14} />} onClick={() => onRateio(p)}>Rateio</Button>
  const opId = p.opId
  if (opId) return <Button size="compact" variant="secondary" icon={<ExternalLink size={14} />} onClick={() => onAbrirOp(opId)}>Abrir OP</Button>
  const reservaId = p.reservaIds[0]
  if (reservaId) return <Button size="compact" variant="secondary" icon={<ExternalLink size={14} />} onClick={() => onVerServico(reservaId)}>Ver serviço</Button>
  return null
}

function OpenName({ p, onOpen }: { p: Pendencia; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="pg-open" onClick={() => onOpen(p.id)}>
      <strong>{titulo(p)}</strong>
      <span>{p.detalhe}</span>
    </button>
  )
}

export function PendenciasTable({ list, onOpen, loading, ...acoes }: Props) {
  const columns: TableColumn<Pendencia>[] = [
    { key: 'tipo', header: 'Tipo', width: 'minmax(180px, 1.1fr)', cell: (p) => <TipoBadge p={p} /> },
    { key: 'op', header: 'OP', width: 'minmax(170px, 1.4fr)', cell: (p) => <OpenName p={p} onOpen={onOpen} /> },
    { key: 'cliente', header: 'Cliente', width: 'minmax(130px, 1fr)', hideBelow: 'compact', cell: (p) => p.cliente || '—' },
    { key: 'servicos', header: 'Serviços', width: 'minmax(80px, .5fr)', align: 'end', cell: (p) => <span className="pg-num">{p.reservaIds.length}</span> },
    { key: 'data', header: 'Data', width: 'minmax(88px, .7fr)', cell: (p) => <span className="pg-num">{formatDate(p.data)}</span> },
    { key: 'valor', header: 'Valor', width: 'minmax(104px, .8fr)', align: 'end', cell: (p) => <span className="pg-num">{formatMoney(p.valor)}</span> },
    { key: 'acao', header: 'Ação', width: 'minmax(124px, .8fr)', cell: (p) => <AcaoPendencia p={p} {...acoes} /> },
  ]
  return (
    <div className="pg-table-wrap" onClick={(event) => openFromRow(event, '.bt-table__row', '.pg-open')}>
      <Table className="pg-table" columns={columns} rows={list} rowKey={(p) => p.id} loading={loading} />
    </div>
  )
}

/** Celular: cartão com código, valor, tipo e ação. */
export function PendenciasCards({ list, onOpen, loading: _loading, ...acoes }: Props) {
  return (
    <ul className="pg-cards" aria-label="Pendências" onClick={(event) => openFromRow(event, '.pg-card', '.pg-card__open')}>
      {list.map((p) => (
        <li key={p.id} className="pg-card">
          <button type="button" className="pg-card__open" onClick={() => onOpen(p.id)}>
            <span className="pg-card__top">
              <strong className="pg-card__name">{titulo(p)}</strong>
              <span className="pg-num pg-card__value">{formatMoney(p.valor)}</span>
            </span>
            <span className="pg-card__meta">{[p.cliente, formatDate(p.data), servicosTexto(p.reservaIds.length)].filter(Boolean).join(' · ')}</span>
          </button>
          <div className="pg-card__foot"><TipoBadge p={p} /><AcaoPendencia p={p} {...acoes} /></div>
        </li>
      ))}
    </ul>
  )
}
