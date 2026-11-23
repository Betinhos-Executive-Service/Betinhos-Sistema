import { useMemo, type ReactNode } from 'react'
import { StatusBadge, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { BellOff, BellRing, CalendarClock, FlaskConical, TriangleAlert } from 'lucide-react'
import { ListTable } from '../../../app/ListTable'
import { dataCurta } from '../domain/formato'
import { excecoesVigentes, perfilDe, ROTULO_PERFIL, rotuloChave, semVinculo } from '../domain/regras'
import type { Motorista } from '../domain/types'

type Props = {
  list: Motorista[]
  hoje: string
  onOpen: (id: string) => void
  view?: TableView
  quickFilters?: TableQuickFilters
  footer?: ReactNode
  empty?: ReactNode
}

export function PerfilCelula({ m }: { m: Motorista }) {
  return (
    <span className="am-perfil">
      <StatusBadge tone={perfilDe(m) === 'terceiro' ? 'info' : 'neutral'}>{ROTULO_PERFIL[perfilDe(m)]}</StatusBadge>
      {semVinculo(m) ? <span className="am-alerta" title="Sem vínculo cadastrado: vale como Próprio. Corrija o cadastro do funcionário."><TriangleAlert size={14} aria-hidden="true" /> sem vínculo</span> : null}
    </span>
  )
}

function ChipsExcecao({ m, hoje }: { m: Motorista; hoje: string }) {
  const vigentes = excecoesVigentes(m, hoje)
  if (!vigentes.length) return <span className="am-muted">—</span>
  return (
    <span className="am-chips">
      {vigentes.map((r) => (
        <span key={r.id} className={`am-chip am-chip--${r.ligado ? 'liga' : 'desliga'}`} title={`${r.ligado ? 'Liga' : 'Desliga'} ${rotuloChave(r.chave)}: ${r.motivo}`}>
          {rotuloChave(r.chave)} {r.ligado ? 'ligado' : 'desligado'}
          {r.validade ? <span className="am-chip__validade"><CalendarClock size={11} aria-hidden="true" /> até {dataCurta(r.validade)}</span> : null}
        </span>
      ))}
    </span>
  )
}

export function MotoristasTable({ list, hoje, onOpen, view, quickFilters, footer, empty }: Props) {
  const columns = useMemo<TableColumn<Motorista>[]>(() => [
    { key: 'nome', header: 'Motorista', label: 'Motorista', sortable: true, defaultWidth: 240, width: 'minmax(180px, 2fr)', cell: (m) => <strong className="am-corte" title={m.nome}>{m.nome}</strong> },
    { key: 'perfil', header: 'Perfil', label: 'Perfil', sortable: true, defaultWidth: 190, width: 'minmax(150px, 1.2fr)', cell: (m) => <PerfilCelula m={m} /> },
    { key: 'piloto', header: 'Piloto', label: 'Piloto', sortable: true, defaultWidth: 100, width: 'minmax(90px, .6fr)', hideBelow: 'compact', cell: (m) => (m.piloto ? <StatusBadge tone="success"><FlaskConical size={12} aria-hidden="true" /> Piloto</StatusBadge> : <span className="am-muted">—</span>) },
    { key: 'excecoes', header: 'Exceções', label: 'Exceções', sortable: true, defaultWidth: 320, width: 'minmax(240px, 2.4fr)', cell: (m) => <ChipsExcecao m={m} hoje={hoje} /> },
    { key: 'push', header: 'Push', label: 'Push', sortable: true, defaultWidth: 110, width: 'minmax(100px, .6fr)', hideBelow: 'compact', cell: (m) => (m.push ? <span className="am-push"><BellRing size={14} aria-hidden="true" /> Ativo</span> : <span className="am-push am-muted"><BellOff size={14} aria-hidden="true" /> Sem push</span>) },
  ], [hoje])
  return <ListTable className="am-table" columns={columns} rows={list} rowKey={(m) => m.id} audit={{ entity: 'cr40f_funcionarios' }} onRowClick={(m) => onOpen(m.id)} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
}

export function MotoristasCards({ list, hoje, onOpen }: Pick<Props, 'list' | 'hoje' | 'onOpen'>) {
  return (
    <ul className="am-cards" aria-label="Motoristas">
      {list.map((m) => (
        <li key={m.id} className="am-card">
          <button type="button" className="am-open" onClick={() => onOpen(m.id)}>
            <span className="am-card__top"><strong>{m.nome}</strong><PerfilCelula m={m} /></span>
            <ChipsExcecao m={m} hoje={hoje} />
            <span className="am-card__foot">{m.piloto ? <StatusBadge tone="success">Piloto</StatusBadge> : null}<span className={m.push ? 'am-push' : 'am-push am-muted'}>{m.push ? 'Push ativo' : 'Sem push'}</span></span>
          </button>
        </li>
      ))}
    </ul>
  )
}
