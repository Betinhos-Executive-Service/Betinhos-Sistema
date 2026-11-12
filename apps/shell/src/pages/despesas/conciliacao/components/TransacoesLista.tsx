import { memo, type ReactNode } from 'react'
import { StatusBadge, type TableColumn } from '@betinhos/ui'
import { VirtualTable } from '../../../../app/VirtualTable'
import { fmtData } from '../../../equipamentos/components/EquipamentosList'
import { openFromRow, openRowActions } from '../../../pagantes/components/PagantesList'
import { formatMoney } from '../../../pagantes/domain/messages'
import { canalLabel, situacaoLabel, situacaoTone } from '../domain/regras'
import type { Transacao } from '../domain/types'

type Props = { list: Transacao[]; onOpen: (id: string) => void; loading?: boolean; empty?: ReactNode; footer?: ReactNode }

export const cartaoTexto = (t: Transacao) => t.cartaoNome || (t.final ? `Final ${t.final}` : 'Conta sem final')

export function Situacao({ t }: { t: Transacao }) {
  return <StatusBadge tone={situacaoTone(t.situacao)}>{situacaoLabel(t.situacao)}</StatusBadge>
}

function Abrir({ t, onOpen, className }: { t: Transacao; onOpen: (id: string) => void; className: string }) {
  return (
    <button type="button" className={className} onClick={() => onOpen(t.id)}>
      <strong>{t.estabelecimento || t.descricao || 'Sem descrição'}</strong>
      {t.motivo ? <span>{t.motivo}</span> : null}
    </button>
  )
}

export const Canal = ({ t }: { t: Transacao }) => <StatusBadge tone="neutral">{canalLabel(t.canal)}</StatusBadge>

/** `memo`: abrir ou fechar um drawer re-renderiza a página, não a lista (props estáveis). */
export const TransacoesTabela = memo(function TransacoesTabela({ list, onOpen, loading, empty, footer }: Props) {
  const columns: TableColumn<Transacao>[] = [
    { key: 'data', header: 'Compra', width: '96px', cell: (t) => <span className="cc-num">{fmtData(t.dataCompra)}</span> },
    { key: 'descricao', header: 'Lançamento', width: 'minmax(220px, 2.4fr)', cell: (t) => <Abrir t={t} onOpen={onOpen} className="cc-open" /> },
    { key: 'canal', header: 'Canal', width: '120px', cell: (t) => <Canal t={t} /> },
    { key: 'cartao', header: 'Cartão', width: 'minmax(130px, 1fr)', hideBelow: 'compact', cell: cartaoTexto },
    { key: 'motorista', header: 'Motorista', width: 'minmax(130px, 1fr)', cell: (t) => t.motoristaNome || <span className="cc-muted">Sem motorista</span> },
    { key: 'valor', header: 'Valor', width: '110px', cell: (t) => <span className="cc-num">{formatMoney(t.valor)}</span> },
    { key: 'situacao', header: 'Situação', width: 'minmax(150px, .9fr)', cell: (t) => <Situacao t={t} /> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.cc-open')}>
      <VirtualTable className="cc-table" columns={columns} rows={list} rowKey={(t) => t.id} rowActions={openRowActions(onOpen)} loading={loading} empty={empty} footer={footer} />
    </div>
  )
})

export const TransacoesCards = memo(function TransacoesCards({ list, onOpen }: Props) {
  return (
    <ul className="cc-cards" aria-label="Transações" onClick={(event) => openFromRow(event, '.cc-card', '.cc-card__open')}>
      {list.map((t) => (
        <li key={t.id} className="cc-card">
          <Abrir t={t} onOpen={onOpen} className="cc-card__open" />
          <div className="cc-card__foot">
            <span className="cc-muted">{[fmtData(t.dataCompra), t.motoristaNome || 'Sem motorista', cartaoTexto(t)].join(' · ')}</span>
            <span className="cc-card__valor">
              <strong className="cc-num">{formatMoney(t.valor)}</strong>
              <Canal t={t} />
              <Situacao t={t} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
})
