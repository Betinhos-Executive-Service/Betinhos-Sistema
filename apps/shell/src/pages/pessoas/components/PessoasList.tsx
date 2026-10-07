import { StatusBadge, Table, type TableColumn } from '@betinhos/ui'
import { Copy } from 'lucide-react'
import { openFromRow } from '../../pagantes/components/PagantesList'
import { STATUS, label } from '../domain/choices'
import type { DuplicateHit } from '../domain/duplicates'
import type { ChoiceSet, Pessoa } from '../domain/types'
import { ContatoActions } from './ContatoActions'

type Props = { list: Pessoa[]; choices: ChoiceSet; dups: Map<string, DuplicateHit[]>; onOpen: (id: string) => void; loading?: boolean }

const formatDay = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—')

function OpenName({ p, choices, onOpen }: { p: Pessoa; choices: ChoiceSet; onOpen: (id: string) => void }) {
  const cargo = label(choices.cargo, p.cargo)
  return (
    <button type="button" className="ps-open" onClick={() => onOpen(p.id)}>
      <strong>{p.nome || 'Sem nome'}</strong>
      <span>{[cargo, p.departamento].filter(Boolean).join(' · ') || label(choices.classificacao, p.classificacao, '—')}</span>
    </button>
  )
}

function Badges({ p, choices, dup }: { p: Pessoa; choices: ChoiceSet; dup: boolean }) {
  return (
    <span className="ps-badges">
      {p.status === STATUS.inativo ? <StatusBadge tone="neutral">{label(choices.status, p.status)}</StatusBadge> : null}
      {p.classificacao != null ? <StatusBadge tone="info">{label(choices.classificacao, p.classificacao)}</StatusBadge> : null}
      {dup ? <StatusBadge tone="warning" icon={<Copy size={12} />}>Possível duplicado</StatusBadge> : null}
    </span>
  )
}

export function PessoasTable({ list, choices, dups, onOpen, loading }: Props) {
  const columns: TableColumn<Pessoa>[] = [
    { key: 'nome', header: 'Pessoa', width: 'minmax(180px, 1.5fr)', cell: (p) => <OpenName p={p} choices={choices} onOpen={onOpen} /> },
    { key: 'cliente', header: 'Cliente', width: 'minmax(120px, 1fr)', cell: (p) => p.cliente || '—' },
    { key: 'contato', header: 'Contato', width: 'minmax(150px, 1.1fr)', hideBelow: 'compact', cell: (p) => <span className="ps-contato"><span>{p.telefone || '—'}</span><span>{p.email}</span></span> },
    { key: 'tags', header: 'Classificação', width: 'minmax(150px, 1fr)', cell: (p) => <Badges p={p} choices={choices} dup={dups.has(p.id)} /> },
    { key: 'ultimo', header: 'Último serviço', width: 'minmax(96px, .7fr)', hideBelow: 'compact', cell: (p) => formatDay(p.ultimoServico) },
    { key: 'acoes', header: <span className="ps-sr">Ações rápidas</span>, width: '84px', align: 'end', cell: (p) => <ContatoActions p={p} compact /> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.ps-open')}>
      <Table className="ps-table" columns={columns} rows={list} rowKey={(p) => p.id} loading={loading}
        severity={(p) => (dups.has(p.id) ? { tone: 'warning', label: 'Possível duplicado' } : null)} />
    </div>
  )
}

export function PessoasCards({ list, choices, dups, onOpen }: Props) {
  return (
    <ul className="ps-cards" aria-label="Pessoas" onClick={(event) => openFromRow(event, '.ps-card', '.ps-card__open')}>
      {list.map((p) => (
        <li key={p.id} className="ps-card">
          <button type="button" className="ps-card__open" onClick={() => onOpen(p.id)}>
            <strong className="ps-card__name">{p.nome || 'Sem nome'}</strong>
            <span className="ps-card__meta">{[p.cliente, p.telefone, p.email].filter(Boolean).join(' · ') || 'Sem contato'}</span>
          </button>
          <div className="ps-card__foot">
            <Badges p={p} choices={choices} dup={dups.has(p.id)} />
            <ContatoActions p={p} size="touch" compact />
          </div>
        </li>
      ))}
    </ul>
  )
}
