import type { ReactNode } from 'react'
import { Button } from '@betinhos/ui'
import { ChevronRight } from 'lucide-react'
import { Sparkline } from '../charts/Charts'
import type { CorToken } from '../charts/tokens'
import type { Apoio, Chip, PontoSerie } from '../domain/types'
import { Chips } from './KpiChip'

/* Card de KPI único de todas as abas: borda superior na cor do indicador, valor, extras (chips, apoio, faixas) e sparkline na base. */

export type TomKpi = 'action' | 'brand' | 'success' | 'warning'
export type ColunasKpi = 3 | 4 | 5 | 6

/** Sparkline de cada tom: linha na cor do indicador e área no tom suave do mesmo papel. */
const SPARK: Record<TomKpi, { linha: CorToken; area: CorToken }> = {
  action: { linha: 'action', area: 'actionSoft' },
  brand: { linha: 'brand', area: 'border' },
  success: { linha: 'success', area: 'successSoft' },
  warning: { linha: 'warning', area: 'warningSoft' },
}

type KpiCardProps = {
  rotulo: string
  /** null = s/dado: o conjunto da tabela não respondeu. Nunca número provisório. */
  valor: string | null
  tom: TomKpi
  chips?: Chip[]
  /** Apoios rotulados (chip ou linha) ou uma linha de texto simples. */
  apoio?: Apoio[] | string
  serie?: PontoSerie[]
  /** Extras próprios da aba (chip ANT., faixa da hospedagem), depois dos chips e apoios. */
  children?: ReactNode
  /** Drill-down: o card inteiro abre a lista por trás do número (botão com o texto, ex.: "Ver serviços"). */
  acao?: { texto: string; onAbrir: () => void }
}

export function KpiCard({ rotulo, valor, tom, chips = [], apoio = [], serie = [], children, acao }: KpiCardProps) {
  const apoios = typeof apoio === 'string' ? [] : apoio
  const linha = typeof apoio === 'string' && apoio ? apoio : null
  const extras = chips.length > 0 || apoios.length > 0 || linha != null || children != null
  return (
    <article className={`dash-kpi dash-kpi--${tom}${acao ? ' dash-kpi--abre' : ''}`} aria-label={rotulo}>
      <span className="dash-kpi__rotulo">{rotulo}</span>
      {valor == null
        ? <strong className="dash-kpi__valor dash-kpi__valor--semdado">s/dado</strong>
        : <strong className="dash-kpi__valor">{valor}</strong>}
      {extras ? (
        <div className="dash-kpi__extras">
          <Chips chips={chips} apoio={apoios} />
          {linha != null ? <span className="dash-apoio">{linha}</span> : null}
          {children}
        </div>
      ) : null}
      {acao ? (
        <Button className="dash-abre" variant="ghost" size="compact" iconEnd={<ChevronRight size={14} aria-hidden="true" />} onClick={acao.onAbrir}>
          {acao.texto}{' '}<span className="dash-sr">de {rotulo}</span>
        </Button>
      ) : null}
      {serie.length > 1 ? <Sparkline dados={serie} linha={SPARK[tom].linha} area={SPARK[tom].area} /> : null}
    </article>
  )
}

/** Linha de KPIs da aba: `colunas` é o número de cards na largura cheia (o CSS desce para 3, 2 e 1 conforme a largura). */
export function KpiLinha({ rotulo, colunas = 6, children }: { rotulo: string; colunas?: ColunasKpi; children: ReactNode }) {
  return <section className={`dash-kpis dash-kpis--${colunas}`} aria-label={rotulo}>{children}</section>
}

