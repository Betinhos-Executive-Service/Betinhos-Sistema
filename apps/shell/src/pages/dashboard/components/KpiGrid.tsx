import { StatCard } from '@betinhos/ui'
import type { Kpi, KpiId } from '../domain/types'
import { extrasKpi } from './KpiExtras'
import { KpiLinha, tendencia, tomKpi } from './KpiLinha'

const ROTULO = 'Indicadores executivos'

/** Seis KPIs executivos do Resumo, com drill-down opcional por KPI (`abrir`). Tom neutro, menos o CP pendente com algum pendente (pede ação). */
export function KpiGrid({ kpis, abrir = {} }: { kpis: Kpi[]; abrir?: Partial<Record<KpiId, () => void>> }) {
  return (
    <KpiLinha rotulo={ROTULO} colunas={6}>
      {kpis.map((k) => (
        <StatCard
          key={k.id} label={k.rotulo} value={k.valor} {...tomKpi(k.id === 'cpPendente' && k.apoio.some((a) => a.atencao) ? 'warning' : 'info')}
          {...extrasKpi({ chips: k.chips, apoio: k.apoio })} trend={tendencia(k.serie)} onOpen={abrir[k.id]}
        />
      ))}
    </KpiLinha>
  )
}
