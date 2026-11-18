import type { ReactNode } from 'react'
import type { StatTone } from '@betinhos/ui'
import { AlertTriangle, CircleCheck } from 'lucide-react'
import type { PontoSerie } from '../domain/types'

/* Grade dos KPIs de cada aba. Os cards são o `StatCard` do DS, que ocupa 4 linhas desta grade (subgrid): rótulo, valor, extras e sparkline alinham na fileira. */

type ColunasKpi = 3 | 4 | 5 | 6

/** Linha de KPIs da aba: `colunas` é o número de cards na largura cheia (o CSS desce para 3, 2 e 1 conforme a largura). */
export function KpiLinha({ rotulo, colunas = 6, children }: { rotulo: string; colunas?: ColunasKpi; children: ReactNode }) {
  return <section className={`dash-kpis dash-kpis--${colunas}`} aria-label={rotulo}>{children}</section>
}

/**
 * Tom do KPI: info por padrão; warning quando o número pede ação; success só para estado bom verificável (ex.: nenhuma preventiva vencida).
 * No DS o número é sempre navy e o tom vai no ícone e na sparkline: warning e success ganham ícone, para o estado não depender só da cor.
 */
export function tomKpi(tone: StatTone): { tone: StatTone; icon?: ReactNode } {
  if (tone === 'warning') return { tone, icon: <AlertTriangle /> }
  if (tone === 'success') return { tone, icon: <CircleCheck /> }
  return { tone }
}

/** Contagem que pede ação: warning com algum, info com zero ou sem dado. */
export const tomAtencao = (n: number | null | undefined) => tomKpi(n ? 'warning' : 'info')

/** Série da sparkline: só os valores, na ordem do tempo; com menos de dois pontos não há tendência. */
export const tendencia = (serie: PontoSerie[] | undefined): number[] | undefined => (serie && serie.length > 1 ? serie.map((p) => p.valor) : undefined)
