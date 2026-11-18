import { memo, type MouseEvent, type ReactNode } from 'react'
import { StatusBadge, todaySaoPaulo, type TableColumn } from '@betinhos/ui'
import { VirtualTable } from '../../../../app/VirtualTable'
import { fmtData } from '../../../equipamentos/components/EquipamentosList'
import { openFromRow, openRowActions, selectionRowActions, type SelectionProps } from '../../../pagantes/components/PagantesList'
import { formatMoney } from '../../../pagantes/domain/messages'
import { abaDe, canalLabel, diasDesde, DIAS_ATRASO, idadeTexto, situacaoLabel, situacaoTone } from '../domain/regras'
import type { Transacao } from '../domain/types'

type Props = { list: Transacao[]; onOpen: (id: string) => void; loading?: boolean; empty?: ReactNode; footer?: ReactNode }
type TableProps = Props & Partial<SelectionProps<Transacao>>

export const cartaoTexto = (t: Transacao) => t.cartaoNome || (t.final ? `Final ${t.final}` : 'Conta sem final')

export function Situacao({ t }: { t: Transacao }) {
  return <StatusBadge tone={situacaoTone(t.situacao)}>{situacaoLabel(t.situacao)}</StatusBadge>
}

/** `motivo`: no cartão do celular a segunda linha fica; na tabela o motivo é uma coluna própria. */
function Abrir({ t, onOpen, className, motivo = true }: { t: Transacao; onOpen: (id: string) => void; className: string; motivo?: boolean }) {
  const titulo = t.estabelecimento || t.descricao || 'Sem descrição'
  return (
    <button type="button" className={className} title={motivo ? undefined : titulo} onClick={() => onOpen(t.id)}>
      <strong>{titulo}</strong>
      {motivo && t.motivo ? <span>{t.motivo}</span> : null}
    </button>
  )
}

/** Há quantos dias a compra está na fila; em "Para revisar", passado o prazo da escalada, fica em destaque. */
export function Idade({ t, hoje }: { t: Transacao; hoje: string }) {
  const dias = diasDesde(t.dataCompra, hoje)
  const atrasada = abaDe(t.situacao) === 'revisar' && dias >= DIAS_ATRASO
  return <span className={atrasada ? 'cc-idade cc-idade--atrasada' : 'cc-idade'}>{idadeTexto(dias)}</span>
}

export const Canal = ({ t }: { t: Transacao }) => <StatusBadge tone="neutral">{canalLabel(t.canal)}</StatusBadge>

/** `memo`: abrir ou fechar um drawer re-renderiza a página, não a lista (props estáveis). */
export const TransacoesTabela = memo(function TransacoesTabela({ list, onOpen, loading, empty, footer, selection, bulkActions }: TableProps) {
  const hoje = todaySaoPaulo()
  const columns: TableColumn<Transacao>[] = [
    { key: 'data', header: 'Compra', width: '150px', cell: (t) => <span className="cc-data"><span className="cc-num">{fmtData(t.dataCompra)}</span><Idade t={t} hoje={hoje} /></span> },
    { key: 'descricao', header: 'Lançamento', width: 'minmax(220px, 2.4fr)', cell: (t) => <Abrir t={t} onOpen={onOpen} className="cc-open" motivo={false} /> },
    { key: 'motivo', header: 'Motivo', width: 'minmax(160px, 1.4fr)', cell: (t) => <span className="cc-motivo" title={t.motivo || undefined}>{t.motivo || '—'}</span> },
    { key: 'canal', header: 'Canal', width: '120px', cell: (t) => <Canal t={t} /> },
    { key: 'cartao', header: 'Cartão', width: 'minmax(130px, 1fr)', hideBelow: 'compact', cell: cartaoTexto },
    { key: 'motorista', header: 'Motorista', width: 'minmax(130px, 1fr)', cell: (t) => t.motoristaNome || <span className="cc-muted">Sem motorista</span> },
    { key: 'valor', header: 'Valor', width: '110px', cell: (t) => <span className="cc-num">{formatMoney(t.valor)}</span> },
    { key: 'situacao', header: 'Situação', width: 'minmax(150px, .9fr)', cell: (t) => <Situacao t={t} /> },
  ]
  const abrirLinha = (event: MouseEvent<HTMLElement>) => openFromRow(event, '.bt-table__row', '.cc-open')
  return (
    // Com seleção, um clique marca a linha e o duplo clique abre (como em Pagantes).
    <div {...(selection ? { onDoubleClick: abrirLinha } : { onClick: abrirLinha })}>
      <VirtualTable className="cc-table" columns={columns} rows={list} rowKey={(t) => t.id} selection={selection} rowActions={bulkActions ? selectionRowActions(onOpen, bulkActions) : openRowActions(onOpen)} loading={loading} loadingLabel="Carregando transações" empty={empty} footer={footer} />
    </div>
  )
})

export const TransacoesCards = memo(function TransacoesCards({ list, onOpen }: Props) {
  const hoje = todaySaoPaulo()
  return (
    <ul className="cc-cards" aria-label="Transações" onClick={(event) => openFromRow(event, '.cc-card', '.cc-card__open')}>
      {list.map((t) => (
        <li key={t.id} className="cc-card">
          <Abrir t={t} onOpen={onOpen} className="cc-card__open" />
          <div className="cc-card__foot">
            <span className="cc-muted">{[fmtData(t.dataCompra), t.motoristaNome || 'Sem motorista', cartaoTexto(t)].join(' · ')} · <Idade t={t} hoje={hoje} /></span>
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
