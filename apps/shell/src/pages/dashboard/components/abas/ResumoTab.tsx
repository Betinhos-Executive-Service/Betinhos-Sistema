import type { Resumo } from '../../domain/resumo'
import { AlertList, AlertasCarregando, FAIXAS_RESUMO } from '../AlertList'
import { MetaRealizadoCard, TotalProduzidoCard } from '../Analises'
import { KPI_PLACEHOLDER, KpiGrid } from '../KpiGrid'

/**
 * Aba Resumo: a linha dos seis KPIs executivos; abaixo, Alertas de operação | Qualidade dos dados; depois
 * Total produzido | Meta × realizado. Duas colunas na largura cheia, uma no estreito.
 */
export function ResumoTab({ resumo, periodo }: { resumo: Resumo; periodo: string }) {
  return <>
    <KpiGrid kpis={resumo.kpis} carregando={false} />
    <div className="dash-faixas">
      <AlertList titulo={FAIXAS_RESUMO[0]} itens={resumo.operacao} />
      <AlertList titulo={FAIXAS_RESUMO[1]} itens={resumo.qualidade} />
    </div>
    <div className="dash-grade">
      <TotalProduzidoCard dados={resumo.totalProduzido} periodo={periodo} />
      <MetaRealizadoCard dados={resumo.metaRealizado} periodo={periodo} />
    </div>
  </>
}

/** Primeira carga: KPIs e alertas no formato final, ocupados e sem números; as análises entram com os dados. */
export function ResumoCarregando() {
  return <>
    <KpiGrid kpis={KPI_PLACEHOLDER} carregando />
    <AlertasCarregando />
  </>
}
