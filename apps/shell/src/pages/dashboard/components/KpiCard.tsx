import type { ReactNode } from 'react'
import { Skeleton } from '@betinhos/ui'
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
}

export function KpiCard({ rotulo, valor, tom, chips = [], apoio = [], serie = [], children }: KpiCardProps) {
  const apoios = typeof apoio === 'string' ? [] : apoio
  const linha = typeof apoio === 'string' && apoio ? apoio : null
  const extras = chips.length > 0 || apoios.length > 0 || linha != null || children != null
  return (
    <article className={`dash-kpi dash-kpi--${tom}`} aria-label={rotulo}>
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
      {serie.length > 1 ? <Sparkline dados={serie} linha={SPARK[tom].linha} area={SPARK[tom].area} /> : null}
    </article>
  )
}

/** Linha de KPIs da aba: `colunas` é o número de cards na largura cheia (o CSS desce para 3, 2 e 1 conforme a largura). */
export function KpiLinha({ rotulo, colunas = 6, carregando = false, children }: { rotulo: string; colunas?: ColunasKpi; carregando?: boolean; children: ReactNode }) {
  return <section className={`dash-kpis dash-kpis--${colunas}`} aria-label={rotulo} aria-busy={carregando || undefined}>{children}</section>
}

/** Primeira carga: os cards no formato final, ocupados e sem números; `serie` reserva a sparkline (Resumo). */
export function KpisCarregando({ rotulo, rotulos, colunas = 6, serie = false }: { rotulo: string; rotulos: readonly string[]; colunas?: ColunasKpi; serie?: boolean }) {
  return (
    <KpiLinha rotulo={rotulo} colunas={colunas} carregando>
      {rotulos.map((r) => (
        <article key={r} className="dash-kpi" aria-label={r}>
          <span className="dash-kpi__rotulo">{r}</span>
          <Skeleton height={26} width="62%" />
          <Skeleton height={22} width="84%" />
          <span className="dash-sr">Carregando</span>
          {serie ? <Skeleton className="dash-spark" shape="rect" width="auto" /> : null}
        </article>
      ))}
    </KpiLinha>
  )
}
