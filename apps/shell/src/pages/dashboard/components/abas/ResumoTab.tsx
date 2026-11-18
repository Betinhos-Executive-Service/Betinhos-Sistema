import { useMemo } from 'react'
import { calcularResumo } from '../../domain/resumo'
import { useDetalhe } from '../DetalheDrawer'
import { MetaRealizadoCard, TotalProduzidoCard } from '../Analises'
import { AbaCarregando } from '../Carregando'
import { KpiGrid } from '../KpiGrid'
import { PainelAtencao } from '../PainelAtencao'
import type { DadosAba, PropsAba } from './abas'

/**
 * Aba Resumo: os seis KPIs executivos em bento; abaixo, o painel "Precisa de atenção" (operação e qualidade dos dados);
 * depois Total produzido | Meta × realizado. Duas colunas na largura cheia, uma no estreito.
 */
export function ResumoTab({ ctx, dados, periodo }: PropsAba) {
  if (!ctx || !dados) return <ResumoCarregando />
  return <Resumo ctx={ctx} dados={dados} periodo={periodo} />
}

function Resumo({ ctx, dados, periodo }: DadosAba) {
  const resumo = useMemo(() => calcularResumo(ctx, dados), [dados, ctx])
  // Drill-down: as listas saem do mesmo recorte dos números (sem consulta nova).
  const abrir = useDetalhe()
  const kpis = abrir ? { cpPendente: () => abrir('cp-pendente'), aReceber: () => abrir('a-receber') } : {}
  const alertas = abrir ? {
    cnh: () => abrir('cnh'), multas: () => abrir('multas'),
    semVeiculo: () => abrir('sem-veiculo'), semMotorista: () => abrir('sem-motorista'), semCliente: () => abrir('sem-cliente'),
  } : {}
  return <>
    <KpiGrid kpis={resumo.kpis} abrir={kpis} />
    <PainelAtencao operacao={resumo.operacao} qualidade={resumo.qualidade} abrir={alertas} />
    <div className="dash-grade">
      <TotalProduzidoCard dados={resumo.totalProduzido} periodo={periodo} />
      <MetaRealizadoCard dados={resumo.metaRealizado} periodo={periodo} />
    </div>
  </>
}

/** Primeira carga: spinner e barra de progresso real. */
export const ResumoCarregando = () => <AbaCarregando />
