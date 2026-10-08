import { MetricCard } from '@betinhos/ui'
import type { CardSecundario } from '../domain/types'

export function FrotaPessoas({ cards }: { cards: CardSecundario[] }) {
  return (
    <section className="dash-frota" aria-label="Frota e pessoas">
      {cards.map((c) => (
        <div key={c.id} className="dash-kpi">
          <MetricCard className="dash-kpi__metric" label={c.rotulo} value={c.valor} tone={c.atencao ? 'warning' : 'info'} />
          <div className="dash-kpi__extras"><span className="dash-apoio">{c.apoio}</span></div>
        </div>
      ))}
    </section>
  )
}
