import { ChevronDown } from 'lucide-react'
import { useQueryBandeira } from '../../../nav/queryState'
import { EmptyState, Skeleton, StatusBadge } from '@betinhos/ui'
import type { HourGroup } from '../domain/bands'
import type { Reserva } from '../domain/types'
import { serviceState, statusTone } from '../domain/serviceState'
import { formatHour } from '../domain/time'

function ServiceRow({ reserva, now, selected, changed, onSelect }: { reserva: Reserva; now: Date; selected: boolean; changed: boolean; onSelect: (id: string) => void }) {
  const state = serviceState(reserva, now)
  const edge = state.kind === 'delayed' ? 'danger' : state.kind === 'upcoming' && state.tone === 'warning' ? 'warning' : undefined
  return (
    <li>
      <button type="button" className="op-row op-press" data-edge={edge} data-changed={changed || undefined} aria-current={selected || undefined} onClick={() => onSelect(reserva.id)}>
        <span className="op-row__time">{reserva.saida ? formatHour(reserva.saida) : '--:--'}</span>
        <span className="op-row__main">
          <span className="op-row__line"><strong>#{reserva.codigo}</strong> {reserva.motorista || <em>Sem motorista</em>} · {reserva.tipoServico}</span>
          <span className="op-row__line op-row__muted">{reserva.trajeto || reserva.destino || 'Trajeto não informado'}</span>
          {edge ? <span className={`op-row__state op-row__state--${edge}`}>{state.label}</span> : null}
        </span>
        <StatusBadge className="op-row__badge" tone={statusTone(reserva.status)} dot>{reserva.status || 'Sem status'}</StatusBadge>
      </button>
    </li>
  )
}

export function AgendaSkeleton() {
  return (
    <ul className="op-agenda__list" aria-busy="true" aria-label="Carregando serviços">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="op-row op-row--skeleton"><Skeleton width={42} /><span className="op-row__main"><Skeleton width="70%" /><Skeleton width="45%" /></span><Skeleton width={72} height={22} /></li>
      ))}
    </ul>
  )
}

type Props = {
  groups: HourGroup[]; concluded: Reserva[]; showConcluded: boolean; now: Date
  selectedId: string | null; changed: Set<string>; onSelect: (id: string) => void
}

/** Agenda do dia por hora cheia; cabeçalhos de hora fixos ao rolar; concluídos recolhidos. */
export function Agenda({ groups, concluded, showConcluded, now, selectedId, changed, onSelect }: Props) {
  // A seção de concluídos aberta vive na URL (`encerrados=1`).
  const [concludedOpen, setConcludedOpen] = useQueryBandeira('encerrados')
  const row = (r: Reserva) => <ServiceRow key={r.id} reserva={r} now={now} selected={r.id === selectedId} changed={changed.has(r.id)} onSelect={onSelect} />
  return (
    <section className="op-agenda" aria-label="Agenda do dia">
      {groups.map((group) => (
        <div key={group.key} className="op-agenda__group">
          <h3 className="op-agenda__hour">{group.label}</h3>
          <ul className="op-agenda__list">{group.items.map(row)}</ul>
        </div>
      ))}
      {showConcluded && concluded.length ? (
        <div className="op-agenda__group">
          <button type="button" className="op-agenda__toggle" aria-expanded={concludedOpen} onClick={() => setConcludedOpen(!concludedOpen)}>
            <ChevronDown size={16} aria-hidden="true" data-open={concludedOpen || undefined} /> Concluídos e cancelados ({concluded.length})
          </button>
          {concludedOpen ? <ul className="op-agenda__list">{concluded.map(row)}</ul> : null}
        </div>
      ) : null}
      {!groups.length && !(showConcluded && concluded.length) ? (
        <EmptyState align="start" title="Nada pendente na agenda">Todos os serviços deste filtro já foram concluídos ou cancelados.</EmptyState>
      ) : null}
    </section>
  )
}
