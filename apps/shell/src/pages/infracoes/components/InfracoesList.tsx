import { StatusBadge, Table, type TableColumn } from '@betinhos/ui'
import { openFromRow } from '../../pagantes/components/PagantesList'
import { COMPETENCIA, GRAVIDADE, RESPONSABILIDADE, gravidadeTone, label, labels } from '../domain/choices'
import type { Infracao, MultaUso } from '../domain/types'

type Props = { list: Infracao[]; uso: Map<string, MultaUso[]>; onOpen: (id: string) => void; loading?: boolean }

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtValor = (v: number | null) => (v == null ? '—' : money.format(v))
const fmtPontos = (v: number) => `${v} ${v === 1 ? 'ponto' : 'pontos'}`

function OpenName({ i, onOpen }: { i: Infracao; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="if-open" onClick={() => onOpen(i.id)}>
      <strong className="if-num">{i.codigo || 'Sem código'}</strong>
      <span>{i.descricao || 'Sem descrição'}</span>
    </button>
  )
}

export function Badges({ i }: { i: Infracao }) {
  return (
    <span className="if-badges">
      <StatusBadge tone={gravidadeTone(i.gravidade)}>{label(GRAVIDADE, i.gravidade, 'Sem gravidade')}</StatusBadge>
      {i.ativo ? null : <StatusBadge tone="neutral">Inativa</StatusBadge>}
    </span>
  )
}

const usoCount = (uso: Map<string, MultaUso[]>, id: string) => uso.get(id)?.length ?? 0

export function InfracoesTable({ list, uso, onOpen, loading }: Props) {
  const columns: TableColumn<Infracao>[] = [
    { key: 'infracao', header: 'Infração', width: 'minmax(220px, 2.6fr)', cell: (i) => <OpenName i={i} onOpen={onOpen} /> },
    { key: 'gravidade', header: 'Gravidade', width: 'minmax(120px, .8fr)', cell: (i) => <Badges i={i} /> },
    { key: 'pontos', header: 'Pontos', width: '76px', align: 'end', cell: (i) => <span className="if-num">{i.pontos ?? '—'}</span> },
    { key: 'valor', header: 'Valor', width: 'minmax(96px, .7fr)', align: 'end', cell: (i) => <span className="if-num">{fmtValor(i.valor)}</span> },
    { key: 'competencia', header: 'Competência', width: 'minmax(120px, .9fr)', hideBelow: 'compact', cell: (i) => labels(COMPETENCIA, i.competencia) || '—' },
    { key: 'responsavel', header: 'Responsável', width: 'minmax(100px, .7fr)', hideBelow: 'compact', cell: (i) => label(RESPONSABILIDADE, i.responsabilidade, '—') },
    { key: 'multas', header: 'Multas', width: '72px', align: 'end', cell: (i) => <span className="if-num">{usoCount(uso, i.id) || '—'}</span> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.if-open')}>
      <Table className="if-table" columns={columns} rows={list} rowKey={(i) => i.id} loading={loading} />
    </div>
  )
}

export function InfracoesCards({ list, uso, onOpen }: Props) {
  return (
    <ul className="if-cards" aria-label="Infrações" onClick={(event) => openFromRow(event, '.if-card', '.if-card__open')}>
      {list.map((i) => {
        const n = usoCount(uso, i.id)
        return (
          <li key={i.id} className="if-card">
            <button type="button" className="if-card__open" onClick={() => onOpen(i.id)}>
              <strong className="if-card__name if-num">{i.codigo || 'Sem código'}</strong>
              <span className="if-card__desc">{i.descricao || 'Sem descrição'}</span>
              <span className="if-card__meta if-num">{[i.pontos == null ? '' : fmtPontos(i.pontos), i.valor == null ? '' : fmtValor(i.valor), n ? `${n} ${n === 1 ? 'multa' : 'multas'}` : 'Sem multas'].filter(Boolean).join(' · ')}</span>
            </button>
            <div className="if-card__foot"><Badges i={i} /></div>
          </li>
        )
      })}
    </ul>
  )
}
