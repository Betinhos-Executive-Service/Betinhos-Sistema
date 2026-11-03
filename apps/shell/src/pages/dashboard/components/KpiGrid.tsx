import type { Kpi, KpiId } from '../domain/types'
import { KpiCard, KpiLinha, type TomKpi } from './KpiCard'

/** Cor de cada indicador executivo: borda superior e sparkline no mesmo papel. */
const TOM: Record<KpiId, TomKpi> = {
  faturamento: 'action', servicos: 'brand', ticket: 'action', aReceber: 'success', cpPendente: 'warning', recebimento: 'success',
}
const ROTULO = 'Indicadores executivos'

/** Seis KPIs executivos do Resumo: o card único (`KpiCard`) com chips sempre visíveis e sparkline na base. */
/** `abrir`: drill-down por KPI (CP pendente e A receber). */
export function KpiGrid({ kpis, abrir = {} }: { kpis: Kpi[]; abrir?: Partial<Record<KpiId, () => void>> }) {
  return (
    <KpiLinha rotulo={ROTULO} colunas={6}>
      {kpis.map((k) => {
        const onAbrir = abrir[k.id]
        return <KpiCard key={k.id} rotulo={k.rotulo} valor={k.valor} tom={TOM[k.id]} chips={k.chips} apoio={k.apoio} serie={k.serie} acao={onAbrir ? { texto: 'Ver serviços', onAbrir } : undefined} />
      })}
    </KpiLinha>
  )
}

/** Primeira carga do Resumo: os seis cards no formato final, com o espaço da sparkline reservado. */
