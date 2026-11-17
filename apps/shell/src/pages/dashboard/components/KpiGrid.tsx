import type { Kpi, KpiId } from '../domain/types'
import { KpiCard, KpiLinha } from './KpiCard'

const ROTULO = 'Indicadores executivos'

/** Seis KPIs executivos do Resumo, com drill-down opcional por KPI (`abrir`). Cor neutra, menos o CP pendente com algum pendente (pede ação). */
export function KpiGrid({ kpis, abrir = {} }: { kpis: Kpi[]; abrir?: Partial<Record<KpiId, () => void>> }) {
  return (
    <KpiLinha rotulo={ROTULO} colunas={6}>
      {kpis.map((k) => {
        const onAbrir = abrir[k.id]
        return <KpiCard key={k.id} rotulo={k.rotulo} valor={k.valor} tom={k.id === 'cpPendente' && k.apoio.some((a) => a.atencao) ? 'warning' : 'brand'} chips={k.chips} apoio={k.apoio} serie={k.serie} acao={onAbrir ? { onAbrir } : undefined} />
      })}
    </KpiLinha>
  )
}
