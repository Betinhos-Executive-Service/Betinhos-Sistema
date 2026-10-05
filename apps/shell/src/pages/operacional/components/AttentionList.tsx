import { Eye, Phone, UserPlus } from 'lucide-react'
import type { AttentionItem } from '../domain/alerts'
import type { Reserva } from '../domain/types'
import { formatHour } from '../domain/time'

const ACTION = { atribuir: { label: 'Atribuir', icon: UserPlus }, ligar: { label: 'Ligar', icon: Phone }, ver: { label: 'Ver', icon: Eye } } as const

/** "Precisa de você": só o que exige intervenção, com a ação direta ao lado. Some quando vazia. */
export function AttentionList({ items, byId, onOpen, onAction }: {
  items: AttentionItem[]; byId: Map<string, Reserva>
  onOpen: (reservaId: string) => void; onAction: (item: AttentionItem) => void
}) {
  if (!items.length) return null
  return (
    <section className="op-attention" aria-labelledby="op-attention-title">
      <h2 className="op-section-title" id="op-attention-title">Precisa de você <span className="op-count">{items.length}</span></h2>
      <ul className="op-attention__list">
        {items.map((item) => {
          const r = byId.get(item.reservaId)
          if (!r) return null
          const { label, icon: Icon } = ACTION[item.action]
          return (
            <li key={item.reservaId} className="op-attention__item" data-priority={item.priority}>
              <button type="button" className="op-attention__main op-press" onClick={() => onOpen(r.id)}>
                <span className="op-attention__time">{r.saida ? formatHour(r.saida) : '--:--'}</span>
                <span className="op-attention__text">
                  <strong>#{r.codigo} · {item.reason}</strong>
                  <span>{r.motorista || 'Sem motorista'} · {r.trajeto || r.destino || r.tipoServico}</span>
                </span>
              </button>
              <button type="button" className="op-attention__action op-press" onClick={() => onAction(item)}><Icon size={16} aria-hidden="true" />{label}</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
