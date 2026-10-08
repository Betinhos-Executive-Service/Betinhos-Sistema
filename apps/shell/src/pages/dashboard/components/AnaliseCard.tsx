import { useId, useState, type ReactNode } from 'react'
import { Button, Surface } from '@betinhos/ui'
import type { Apoio, Chip } from '../domain/types'
import { Chips } from './KpiChip'

type Props = {
  titulo: string
  periodo: string
  unidade: string
  valor?: string
  sub?: string
  chips?: Chip[]
  apoio?: Apoio[]
  /** Bloco extra à direita do título (ex.: pódio 1º/2º/3º). */
  extra?: ReactNode
  grafico?: ReactNode
  tabela?: ReactNode
  /** Com gráfico, a tabela é a alternativa em valores e abre sob demanda. */
  tabelaSobDemanda?: boolean
  largo?: boolean
  /** Fica na altura do próprio conteúdo em vez de esticar até o card vizinho. */
  natural?: boolean
}

/**
 * Card de análise no formato do legado com o DS (§10.16): título em eyebrow, valor grande, apoio e chips à direita;
 * gráfico e tabela juntos; período e unidade no rodapé; valores do gráfico disponíveis em tabela.
 */
export function AnaliseCard({ titulo, periodo, unidade, valor, sub, chips = [], apoio = [], extra, grafico, tabela, tabelaSobDemanda = false, largo = false, natural = false }: Props) {
  const id = useId()
  const [aberta, setAberta] = useState(false)
  const temLado = chips.length > 0 || apoio.length > 0 || extra != null
  const mostrarTabela = tabela != null && (!tabelaSobDemanda || aberta)
  return (
    <Surface className={['dash-card', largo && 'dash-grade__largo', natural && 'dash-grade__natural'].filter(Boolean).join(' ')} aria-labelledby={`${id}-t`}>
      <header className="dash-card__head">
        <div className="dash-card__resumo">
          <h3 className="dash-card__titulo" id={`${id}-t`}>{titulo}</h3>
          {valor != null ? <strong className="dash-card__valor">{valor}</strong> : null}
          {sub ? <p className="dash-card__sub">{sub}</p> : null}
        </div>
        {temLado ? <div className="dash-card__lado">{extra}{chips.length || apoio.length ? <span className="dash-card__chips"><Chips chips={chips} apoio={apoio} /></span> : null}</div> : null}
      </header>
      <div className="dash-card__corpo">
        {grafico}
        {mostrarTabela ? <div id={`${id}-v`} className="dash-card__tabela">{tabela}</div> : null}
      </div>
      <footer className="dash-card__nota">
        <span>{periodo} · {unidade}</span>
        {tabelaSobDemanda && tabela != null ? (
          <Button variant="ghost" size="compact" aria-expanded={aberta} aria-controls={aberta ? `${id}-v` : undefined} onClick={() => setAberta(!aberta)}>{aberta ? 'Ocultar valores' : 'Ver valores'}</Button>
        ) : null}
      </footer>
    </Surface>
  )
}
