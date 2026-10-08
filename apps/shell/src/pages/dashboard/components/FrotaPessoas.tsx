import { MetricCard } from '@betinhos/ui'
import type { CardSecundario } from '../domain/types'

export function FrotaPessoas({ cards }: { cards: CardSecundario[] }) {
  return (
    <section className="dash-frota" aria-label="Frota e pessoas">
      {cards.map((c) => <MetricCard key={c.id} label={c.rotulo} value={c.valor} tone={c.atencao ? 'warning' : 'info'} hint={c.apoio} />)}
    </section>
  )
}
