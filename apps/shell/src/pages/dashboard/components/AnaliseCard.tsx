import { useId, type ReactNode } from 'react'
import { Button, Surface } from '@betinhos/ui'
import { Maximize2 } from 'lucide-react'
import { useQueryConjunto } from '../../../nav/queryState'
import type { Apoio, Chip } from '../domain/types'
import { BotaoCopiar, type TabelaCopiavel } from './Copiar'
import { Chips } from './KpiChip'
import { idDoCard, useAmpliavel, useDetalhe } from './DetalheProvider'

type Props = {
  titulo: string
  periodo: string
  unidade: string
  /** Valor de destaque; `null` é "s/dado" (conjunto que não carregou), em tom secundário. Ausente, o card não tem valor. */
  valor?: string | null
  sub?: string
  chips?: Chip[]
  /** Selo de variação no canto superior direito e a frase de apoio abaixo do subtítulo ("vs R$ X no ano anterior"). */
  delta?: ReactNode
  hint?: string
  apoio?: Apoio[]
  /** Bloco extra à direita do título (ex.: pódio 1º/2º/3º). */
  extra?: ReactNode
  grafico?: ReactNode
  tabela?: ReactNode
  /** Com gráfico, a tabela é a alternativa em valores e abre sob demanda. */
  tabelaSobDemanda?: boolean
  /** A tabela aberta troca o gráfico (em vez de ficar sob ele) e o botão vira "Ver tabela" / "Ver gráfico". */
  tabelaNoLugar?: boolean
  largo?: boolean
  /** Fica na altura do próprio conteúdo em vez de esticar até o card vizinho. */
  natural?: boolean
  /** Valores da tabela em texto: o rodapé ganha "Copiar tabela" (TSV para a planilha), mesmo com a tabela fechada. */
  copiar?: TabelaCopiavel
  /** Id de domínio do card ampliado (ex.: `total-produzido`, com top 5 e lista); sem ele, o card ampliado reaproveita o gráfico e a tabela daqui. */
  ampliarId?: string
}

/**
 * Card de análise no formato do legado com o DS (§10.16): título em eyebrow, valor grande, apoio e chips à direita;
 * gráfico e tabela juntos; período e unidade no rodapé; valores do gráfico disponíveis em tabela.
 */
export function AnaliseCard({ titulo, periodo, unidade, valor, sub, delta, hint, chips: todos = [], apoio = [], extra, grafico, tabela, tabelaSobDemanda = false, tabelaNoLugar = false, largo = false, natural = false, copiar, ampliarId }: Props) {
  const id = useId()
  const abrirId = useDetalhe()
  const generico = useAmpliavel(titulo, { titulo, periodo, unidade, valor, sub, hint, chips: todos.filter((c) => c.tipo !== 'sem-dado'), apoio, grafico, tabela })
  const idCard = ampliarId ?? idDoCard(titulo)
  const ampliar = abrirId && (ampliarId || generico) ? (el?: HTMLElement | null) => abrirId(idCard, el) : null
  // A tabela sob demanda vive na URL (`tabela=<título do card>`): reabrir o link mostra as mesmas tabelas abertas.
  const { valores, alternar } = useQueryConjunto('tabela')
  const aberta = valores.has(titulo)
  const chips = todos.filter((c) => c.tipo !== 'sem-dado')
  const temLado = delta != null || chips.length > 0 || apoio.length > 0 || extra != null
  const mostrarTabela = tabela != null && (!tabelaSobDemanda || aberta)
  return (
    <Surface data-origem={ampliar ? idCard : undefined} className={['dash-card', largo && 'dash-grade__largo', natural && 'dash-grade__natural'].filter(Boolean).join(' ')} aria-labelledby={`${id}-t`}>
      <header className="dash-card__head">
        <div className="dash-card__resumo">
          <h2 className="dash-card__titulo" id={`${id}-t`}>{titulo}</h2>
          {valor === null ? <strong className="dash-card__valor dash-card__valor--semdado">s/dado</strong> : valor != null ? <strong className="dash-card__valor">{valor}</strong> : null}
          {sub ? <p className="dash-card__sub">{sub}</p> : null}
          {hint ? <p className="dash-card__sub">{hint}</p> : null}
        </div>
        {temLado ? <div className="dash-card__lado">{extra}{delta}{chips.length || apoio.length ? <span className="dash-card__chips"><Chips chips={chips} apoio={apoio} /></span> : null}</div> : null}
      </header>
      <div className="dash-card__corpo">
        {tabelaNoLugar && aberta ? null : grafico && ampliar ? <div className="dash-card__ampliavel" role="button" tabIndex={0} aria-label={`Ampliar ${titulo}`} onClick={(e) => ampliar(e.currentTarget)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ampliar(e.currentTarget) } }}>{grafico}</div> : grafico}
        {mostrarTabela ? <div id={`${id}-v`} className="dash-card__tabela">{tabela}</div> : null}
      </div>
      <footer className="dash-card__nota">
        <span>{periodo} · {unidade}</span>
        {(tabelaSobDemanda && tabela != null) || (copiar && copiar.linhas.length) || ampliar ? (
          <span className="dash-card__acoes">
            {ampliar ? <Button variant="ghost" size="compact" icon={<Maximize2 size={14} />} onClick={(e) => ampliar(e.currentTarget.closest<HTMLElement>('[data-origem]') ?? e.currentTarget)}>Ampliar</Button> : null}
            {copiar && copiar.linhas.length ? <BotaoCopiar tabela={copiar} nome={`de ${titulo}`} /> : null}
            {tabelaSobDemanda && tabela != null ? (
              <Button variant="ghost" size="compact" aria-expanded={aberta} aria-controls={aberta ? `${id}-v` : undefined} onClick={() => alternar(titulo)}>{tabelaNoLugar ? (aberta ? 'Ver gráfico' : 'Ver tabela') : aberta ? 'Ocultar valores' : 'Ver valores'}</Button>
            ) : null}
          </span>
        ) : null}
      </footer>
    </Surface>
  )
}
