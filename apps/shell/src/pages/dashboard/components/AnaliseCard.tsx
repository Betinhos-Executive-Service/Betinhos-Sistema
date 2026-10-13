import { useId, type ReactNode } from 'react'
import { Button, Surface } from '@betinhos/ui'
import { useQueryConjunto } from '../../../nav/queryState'
import type { Apoio, Chip } from '../domain/types'
import { BotaoCopiar, type TabelaCopiavel } from './Copiar'
import { Chips } from './KpiChip'

type Props = {
  titulo: string
  periodo: string
  unidade: string
  /** Valor de destaque; `null` é "s/dado" (conjunto que não carregou), em tom secundário. Ausente, o card não tem valor. */
  valor?: string | null
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
  /** Valores da tabela em texto: o rodapé ganha "Copiar tabela" (TSV para a planilha), mesmo com a tabela fechada. */
  copiar?: TabelaCopiavel
}

/**
 * Card de análise no formato do legado com o DS (§10.16): título em eyebrow, valor grande, apoio e chips à direita;
 * gráfico e tabela juntos; período e unidade no rodapé; valores do gráfico disponíveis em tabela.
 */
export function AnaliseCard({ titulo, periodo, unidade, valor, sub, chips = [], apoio = [], extra, grafico, tabela, tabelaSobDemanda = false, largo = false, natural = false, copiar }: Props) {
  const id = useId()
  // A tabela sob demanda vive na URL (`tabela=<título do card>`): reabrir o link mostra as mesmas tabelas abertas.
  const { valores, alternar } = useQueryConjunto('tabela')
  const aberta = valores.has(titulo)
  const temLado = chips.length > 0 || apoio.length > 0 || extra != null
  const mostrarTabela = tabela != null && (!tabelaSobDemanda || aberta)
  return (
    <Surface className={['dash-card', largo && 'dash-grade__largo', natural && 'dash-grade__natural'].filter(Boolean).join(' ')} aria-labelledby={`${id}-t`}>
      <header className="dash-card__head">
        <div className="dash-card__resumo">
          <h2 className="dash-card__titulo" id={`${id}-t`}>{titulo}</h2>
          {valor === null ? <strong className="dash-card__valor dash-card__valor--semdado">s/dado</strong> : valor != null ? <strong className="dash-card__valor">{valor}</strong> : null}
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
        {(tabelaSobDemanda && tabela != null) || (copiar && copiar.linhas.length) ? (
          <span className="dash-card__acoes">
            {copiar && copiar.linhas.length ? <BotaoCopiar tabela={copiar} nome={`de ${titulo}`} /> : null}
            {tabelaSobDemanda && tabela != null ? (
              <Button variant="ghost" size="compact" aria-expanded={aberta} aria-controls={aberta ? `${id}-v` : undefined} onClick={() => alternar(titulo)}>{aberta ? 'Ocultar valores' : 'Ver valores'}</Button>
            ) : null}
          </span>
        ) : null}
      </footer>
    </Surface>
  )
}
