import type { ReactNode } from 'react'
import { type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { VirtualTable } from '../../../app/VirtualTable'
import { openFromRow } from '../../pagantes/components/PagantesList'
import { COMPOSICAO_COLUMNS } from '../domain/lista'
import { VALOR_KEYS, type Composicao, type Opcao, type ValorKey } from '../domain/types'

type Props = { list: Composicao[]; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtMoney = (v: number | null) => (v == null ? '—' : money.format(v))
export const fmtDateTime = (d: Date | null) => (d ? dateTime.format(d).replace(',', '') : '—')
const fmtOpt = (o: Opcao | null) => o?.label || '—'

const labelOf = new Map(COMPOSICAO_COLUMNS.map((c) => [c.key, c.label ?? c.key]))
type Col = TableColumn<Composicao>
const text = (key: string, read: (c: Composicao) => string, width = 160, ellipsis = false): Col => ({
  key, header: labelOf.get(key), label: labelOf.get(key), sortable: true, defaultWidth: width, width: `minmax(${Math.min(width, 110)}px, ${width / 160}fr)`,
  cell: (c) => (ellipsis ? <span className="cp-ellipsis" title={read(c)}>{read(c) || '—'}</span> : read(c) || '—'),
})
const dt = (key: string, read: (c: Composicao) => Date | null): Col => ({
  key, header: labelOf.get(key), label: labelOf.get(key), sortable: true, defaultWidth: 150, width: 'minmax(120px, 1fr)', cell: (c) => <span className="cp-num">{fmtDateTime(read(c))}</span>,
})
const moneyCol = (key: string, read: (c: Composicao) => number | null): Col => ({
  key, header: labelOf.get(key), label: labelOf.get(key), sortable: true, align: 'end', defaultWidth: 140, width: 'minmax(110px, .8fr)', cell: (c) => <span className="cp-num">{fmtMoney(read(c))}</span>,
})

function OpenId({ c, onOpen }: { c: Composicao; onOpen: (id: string) => void }) {
  return <button type="button" className="cp-open" title="Abrir composição" onClick={() => onOpen(c.id)}><strong>{c.codigo || 'Sem ID'}</strong></button>
}

export function composicaoColumns(onOpen: (id: string) => void): Col[] {
  const byKey: Record<string, Col> = {
    codigo: { key: 'codigo', header: 'ID', label: 'ID', sortable: true, defaultWidth: 130, width: 'minmax(100px, .7fr)', cell: (c) => <OpenId c={c} onOpen={onOpen} /> },
    faturamento: text('faturamento', (c) => c.faturamento?.label ?? '', 180),
    status: text('status', (c) => c.status?.label ?? '', 130),
    statusOperacao: text('statusOperacao', (c) => c.statusOperacao?.label ?? '', 150),
    saida: dt('saida', (c) => c.saida),
    motorista: text('motorista', (c) => c.motorista, 180),
    tipoVeiculo: text('tipoVeiculo', (c) => c.tipoVeiculo?.label ?? '', 140),
    servicoId: text('servicoId', (c) => c.servicoId, 120),
    pax: text('pax', (c) => c.pax, 220, true),
    cliente: text('cliente', (c) => c.cliente, 180),
    trajeto: text('trajeto', (c) => c.trajeto, 280, true),
    observacao: text('observacao', (c) => c.observacao, 260, true),
    cotacao: moneyCol('cotacao', (c) => c.cotacao),
    formaPagamento: text('formaPagamento', (c) => c.formaPagamento?.label ?? '', 160),
    criadoEm: dt('criadoEm', (c) => c.criadoEm),
    modificadoEm: dt('modificadoEm', (c) => c.modificadoEm),
    finalizacao: dt('finalizacao', (c) => c.finalizacao),
    ...Object.fromEntries(VALOR_KEYS.map((k: ValorKey) => [k, moneyCol(k, (c) => c.valores[k])])),
  }
  return COMPOSICAO_COLUMNS.map((c) => byKey[c.key])
}

export function ComposicaoTable({ list, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.cp-open')}>
      <VirtualTable className="cp-table" columns={composicaoColumns(onOpen)} rows={list} rowKey={(c) => c.id} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function ComposicaoCards({ list, onOpen }: Props) {
  return (
    <ul className="cp-cards" aria-label="Composições de preço" onClick={(event) => openFromRow(event, '.cp-card', '.cp-card__open')}>
      {list.map((c) => (
        <li key={c.id} className="cp-card">
          <button type="button" className="cp-card__open" onClick={() => onOpen(c.id)}>
            <span className="cp-card__head"><strong className="cp-card__name">{c.codigo || 'Sem ID'} · {c.cliente || 'Sem cliente'}</strong><span className="cp-num">{fmtMoney(c.valores.valorTotal)}</span></span>
            <span className="cp-card__meta">{[fmtDateTime(c.saida), c.trajeto].filter((x) => x && x !== '—').join(' · ') || 'Sem saída'}</span>
            <span className="cp-card__meta">{[fmtOpt(c.status), fmtOpt(c.faturamento)].join(' · ')}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
