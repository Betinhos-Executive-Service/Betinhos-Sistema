import { Table, type TableColumn } from '@betinhos/ui'
import { formatDate, formatMoney } from '../domain/messages'
import { hasFalha, label, statusTone } from '../domain/status'
import type { ChoiceSet, Contato, Pagante } from '../domain/types'
import { QuickActions } from './QuickActions'
import { FalhaBadge, PagamentoBadge, ReciboBadge } from './StatusBadges'

type Props = { list: Pagante[]; choices: ChoiceSet; contatos: Map<string, Contato>; onOpen: (id: string) => void; loading?: boolean }

/** Nome como botão real: a linha tem ações próprias e não pode ser um `button` inteiro. */
function OpenName({ p, onOpen }: { p: Pagante; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="pg-open" onClick={() => onOpen(p.id)}>
      <strong>{p.pessoa || 'Pagante sem pessoa'}</strong>
      <span>{p.codigo}</span>
    </button>
  )
}

const severity = (p: Pagante) => {
  if (hasFalha(p)) return { tone: 'danger' as const, label: 'Falha de envio' }
  const tone = statusTone(p.status)
  return tone === 'danger' || tone === 'warning' ? { tone, label: tone === 'danger' ? 'Pagamento recusado ou expirado' : 'Aguardando pagamento' } : null
}

export function PagantesTable({ list, choices, contatos, onOpen, loading }: Props) {
  const columns: TableColumn<Pagante>[] = [
    { key: 'pessoa', header: 'Pagante', width: 'minmax(180px, 1.6fr)', cell: (p) => <OpenName p={p} onOpen={onOpen} /> },
    { key: 'op', header: 'OP', width: 'minmax(80px, .7fr)', hideBelow: 'compact', cell: (p) => p.op || '—' },
    { key: 'valor', header: 'Valor', width: 'minmax(96px, .8fr)', align: 'end', cell: (p) => <span className="pg-num">{formatMoney(p.valor)}</span> },
    { key: 'forma', header: 'Forma', width: 'minmax(96px, .8fr)', hideBelow: 'compact', cell: (p) => label(choices.forma, p.forma) },
    { key: 'status', header: 'Pagamento', width: 'minmax(140px, 1fr)', cell: (p) => <span className="pg-badges"><PagamentoBadge p={p} choices={choices} /><FalhaBadge p={p} /></span> },
    { key: 'recibo', header: 'Recibo', width: 'minmax(120px, .9fr)', hideBelow: 'compact', cell: (p) => <ReciboBadge p={p} choices={choices} /> },
    { key: 'criado', header: 'Criado em', width: 'minmax(88px, .7fr)', hideBelow: 'compact', cell: (p) => formatDate(p.criadoEm) },
    { key: 'acoes', header: <span className="pg-sr">Ações rápidas</span>, width: '84px', align: 'end', cell: (p) => <QuickActions p={p} contato={contatos.get(p.pessoaId)} /> },
  ]
  return <Table className="pg-table" columns={columns} rows={list} rowKey={(p) => p.id} severity={severity} loading={loading} />
}

/** Celular: cartão com o essencial e as mesmas ações rápidas. */
export function PagantesCards({ list, choices, contatos, onOpen }: Props) {
  return (
    <ul className="pg-cards" aria-label="Pagantes">
      {list.map((p) => (
        <li key={p.id} className="pg-card">
          <button type="button" className="pg-card__open" onClick={() => onOpen(p.id)}>
            <span className="pg-card__top">
              <strong className="pg-card__name">{p.pessoa || 'Pagante sem pessoa'}</strong>
              <span className="pg-num pg-card__value">{formatMoney(p.valor)}</span>
            </span>
            <span className="pg-card__meta">{[p.codigo, p.op, label(choices.forma, p.forma, '')].filter(Boolean).join(' · ')}</span>
          </button>
          <div className="pg-card__foot">
            <span className="pg-badges"><PagamentoBadge p={p} choices={choices} /><FalhaBadge p={p} /></span>
            <QuickActions p={p} contato={contatos.get(p.pessoaId)} size="touch" />
          </div>
        </li>
      ))}
    </ul>
  )
}
