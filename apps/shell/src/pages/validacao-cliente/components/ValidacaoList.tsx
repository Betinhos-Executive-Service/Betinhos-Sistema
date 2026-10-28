import type { ReactNode } from 'react'
import { Checkbox, StatusBadge, Table, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { openFromRow, openRowActions } from '../../pagantes/components/PagantesList'
import { fechamentoSugerido, podeMarcarFechamento, prazoVencido, situacaoLabel, situacaoTone } from '../domain/regras'
import type { Linha } from '../domain/types'

type Props = { list: Linha[]; hoje: string; selecionados: Set<string>; onToggle: (id: string) => void; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode; extraCell?: (id: string, key: string) => string }

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const fmtData = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const fmtValor = (v: number | null) => (v == null ? '—' : money.format(v))

export function Situacao({ l }: { l: Linha }) {
  return <StatusBadge tone={situacaoTone(l.situacao)}>{situacaoLabel(l.situacao)}</StatusBadge>
}

export function Fechamento({ l }: { l: Linha }) {
  if (!podeMarcarFechamento(l.situacao)) return <span className="vc-muted">—</span>
  if (l.fechamento === 'sim') return <StatusBadge tone="success">Entra</StatusBadge>
  if (l.fechamento === 'nao') return <StatusBadge tone="neutral">Próximo mês</StatusBadge>
  return fechamentoSugerido(l) ? <StatusBadge tone="info">Sugerido</StatusBadge> : <span className="vc-muted">A decidir</span>
}

function Prazo({ l, hoje }: { l: Linha; hoje: string }) {
  if (!l.prazoTacita || !(l.situacao === 'liberado' || l.situacao === 'respondido')) return <span className="vc-muted">—</span>
  return prazoVencido(l, hoje)
    ? <span className="vc-badges"><span className="vc-num">{fmtData(l.prazoTacita)}</span><StatusBadge tone="danger">Vencido</StatusBadge></span>
    : <span className="vc-num">{fmtData(l.prazoTacita)}</span>
}

function UltimaMensagem({ l }: { l: Linha }) {
  const m = l.ultimaMensagem
  if (!m) return <span className="vc-muted">—</span>
  return <span className="vc-msg" title={m.texto}><strong>{m.lado === 'cliente' ? 'Cliente' : 'Betinhos'}:</strong> {m.texto}</span>
}

function Selecao({ l, selecionados, onToggle }: Pick<Props, 'selecionados' | 'onToggle'> & { l: Linha }) {
  return <Checkbox className="vc-check" label={<span className="vc-sr">Selecionar serviço {l.codigo}</span>} checked={selecionados.has(l.id)} onChange={() => onToggle(l.id)} />
}

function Servico({ l, onOpen, selecionados, onToggle }: Pick<Props, 'onOpen' | 'selecionados' | 'onToggle'> & { l: Linha }) {
  return (
    <span className="vc-name">
      <Selecao l={l} selecionados={selecionados} onToggle={onToggle} />
      <button type="button" className="vc-open" onClick={() => onOpen(l.id)}>
        <strong>{l.codigo || 'Sem código'}</strong>
        {l.pedido ? <span>{l.pedido}</span> : null}
      </button>
    </span>
  )
}

export function ValidacaoTable({ list, hoje, selecionados, onToggle, onOpen, loading, view, quickFilters, footer, empty, extraCell }: TableProps) {
  const columns: TableColumn<Linha>[] = [
    { key: 'servico', header: 'Serviço', label: 'Serviço', sortable: true, defaultWidth: 150, width: 'minmax(140px, 1fr)', cell: (l) => <Servico l={l} onOpen={onOpen} selecionados={selecionados} onToggle={onToggle} /> },
    { key: 'data', header: 'Data', label: 'Data', sortable: true, defaultWidth: 100, width: 'minmax(96px, .6fr)', cell: (l) => <span className="vc-num">{fmtData(l.data) || '—'}</span> },
    { key: 'situacao', header: 'Situação', label: 'Situação', sortable: true, defaultWidth: 170, width: 'minmax(150px, 1fr)', cell: (l) => <Situacao l={l} /> },
    { key: 'trajeto', header: 'Trajeto', label: 'Trajeto', sortable: true, defaultWidth: 240, width: 'minmax(180px, 2fr)', cell: (l) => <span className="vc-clip" title={l.trajeto}>{l.trajeto || '—'}</span> },
    { key: 'cliente', header: 'Cliente', label: 'Cliente', sortable: true, defaultWidth: 110, width: 'minmax(100px, .7fr)', cell: (l) => l.cliente.nome },
    { key: 'valor', header: 'Valor liberado', label: 'Valor liberado', sortable: true, defaultWidth: 120, width: 'minmax(110px, .8fr)', cell: (l) => <span className="vc-num">{fmtValor(l.valorLiberado)}</span> },
    { key: 'prazo', header: 'Prazo da tácita', label: 'Prazo da tácita', sortable: true, defaultWidth: 150, width: 'minmax(120px, .9fr)', hideBelow: 'compact', cell: (l) => <Prazo l={l} hoje={hoje} /> },
    { key: 'ultimaMensagem', header: 'Última mensagem', label: 'Última mensagem', sortable: true, defaultWidth: 240, width: 'minmax(180px, 2fr)', hideBelow: 'compact', cell: (l) => <UltimaMensagem l={l} /> },
    { key: 'fechamento', header: 'Fechamento', label: 'Fechamento', sortable: true, defaultWidth: 120, width: 'minmax(110px, .8fr)', cell: (l) => <Fechamento l={l} /> },
    { key: 'cr', header: 'CR', label: 'CR', sortable: true, defaultWidth: 100, width: 'minmax(90px, .6fr)', defaultHidden: true, cell: (l) => l.cr || '—' },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.vc-open')}>
      <Table className="vc-table" columns={columns} rows={list} rowKey={(l) => l.id} rowActions={openRowActions(onOpen)} loading={loading} view={view ? { ...view, extraCell } : undefined} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function ValidacaoCards({ list, hoje, selecionados, onToggle, onOpen }: Props) {
  return (
    <ul className="vc-cards" aria-label="Serviços" onClick={(event) => openFromRow(event, '.vc-card', '.vc-card__open')}>
      {list.map((l) => (
        <li key={l.id} className="vc-card">
          <div className="vc-card__head">
            <Selecao l={l} selecionados={selecionados} onToggle={onToggle} />
            <button type="button" className="vc-card__open" onClick={() => onOpen(l.id)}>
              <strong className="vc-card__name">{l.codigo} · {fmtData(l.data)}</strong>
              <span className="vc-card__meta">{[l.cliente.nome, l.trajeto].filter(Boolean).join(' · ')}</span>
            </button>
          </div>
          <div className="vc-card__foot">
            <Situacao l={l} />
            <span className="vc-num">{fmtValor(l.valorLiberado ?? l.valorComposicao)}</span>
            <Prazo l={l} hoje={hoje} />
            <Fechamento l={l} />
          </div>
        </li>
      ))}
    </ul>
  )
}
