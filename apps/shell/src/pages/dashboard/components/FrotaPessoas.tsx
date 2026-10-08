import { AlertTriangle } from 'lucide-react'
import type { CardSecundario } from '../domain/types'
import { AnaliseCard } from './AnaliseCard'
import { AlertaCard, Faixa } from './AlertList'

/** Terceira faixa, no mesmo formato dos alertas: em atenção ganha tom de atenção; sem dado fica neutro. */
export function FrotaPessoas({ cards }: { cards: CardSecundario[] }) {
  return (
    <Faixa titulo="Frota e pessoas" itens={cards.length}>
      {cards.map((c) => <AlertaCard key={c.id} valor={c.valor} rotulo={c.rotulo} status={c.apoio} tom={c.atencao ? 'warning' : c.valor === '—' ? 'neutral' : 'brand'} />)}
    </Faixa>
  )
}

const DA_FROTA = new Set(['manutencoes', 'multas', 'frota'])

/**
 * Seção Frota, ao lado do custo de manutenção: manutenções, multas e frota ativa numa lista compacta
 * (rótulo e apoio à esquerda, número à direita). Atenção vem em ícone e texto, além da cor.
 */
export function FrotaSituacao({ cards, periodo }: { cards: CardSecundario[]; periodo: string }) {
  const itens = cards.filter((c) => DA_FROTA.has(c.id))
  return (
    <AnaliseCard
      titulo="Manutenções · Multas · Frota ativa"
      periodo={periodo}
      unidade="registros no período · frota ativa hoje"
      tabela={(
        <ul className="dash-lista">
          {itens.map((c) => (
            <li key={c.id} className={c.atencao ? 'dash-lista__item dash-lista__item--atencao' : 'dash-lista__item'}>
              <span className="dash-lista__texto">
                <span className="dash-lista__rotulo">{c.rotulo}</span>
                <span className="dash-lista__apoio">
                  {c.atencao ? <><AlertTriangle className="dash-apoio__icone" size={12} aria-hidden="true" /><span className="dash-sr">Atenção: </span></> : null}
                  {c.apoio}
                </span>
              </span>
              <strong className="dash-lista__valor">{c.valor}</strong>
            </li>
          ))}
        </ul>
      )}
    />
  )
}
