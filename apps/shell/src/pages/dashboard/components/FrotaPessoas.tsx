import type { CardSecundario } from '../domain/types'
import { AlertaCard, Faixa } from './AlertList'

/** Terceira faixa, no mesmo formato dos alertas: em atenção ganha tom de atenção; sem dado fica neutro. */
export function FrotaPessoas({ cards }: { cards: CardSecundario[] }) {
  return (
    <Faixa titulo="Frota e pessoas" itens={cards.length}>
      {cards.map((c) => <AlertaCard key={c.id} valor={c.valor} rotulo={c.rotulo} status={c.apoio} tom={c.atencao ? 'warning' : c.valor === '—' ? 'neutral' : 'brand'} />)}
    </Faixa>
  )
}
