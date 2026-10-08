import { useMemo } from 'react'
import { calcularResumo } from '../../domain/resumo'
import { AlertList, AlertasCarregando, FAIXAS_RESUMO } from '../AlertList'
import { MetaRealizadoCard, TotalProduzidoCard } from '../Analises'
import { BlocosCarregando } from '../Carregando'
import { KpiGrid, KpiGridCarregando } from '../KpiGrid'
import type { DadosAba, PropsAba } from './abas'

/**
 * Aba Resumo: a linha dos seis KPIs executivos; abaixo, Alertas de operação | Qualidade dos dados; depois
 * Total produzido | Meta × realizado. Duas colunas na largura cheia, uma no estreito.
 */
export function ResumoTab({ ctx, dados, periodo }: PropsAba) {
  if (!ctx || !dados) return <ResumoCarregando />
  return <Resumo ctx={ctx} dados={dados} periodo={periodo} />
}

function Resumo({ ctx, dados, periodo }: DadosAba) {
  const resumo = useMemo(() => calcularResumo(dados, ctx.f, ctx.now), [dados, ctx])
  return <>
    <KpiGrid kpis={resumo.kpis} />
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

/** Primeira carga: KPIs, alertas e blocos no formato final, ocupados e sem números. */
export function ResumoCarregando() {
  return <>
    <KpiGridCarregando />
    <AlertasCarregando />
    <BlocosCarregando titulos={['Total produzido', 'Meta × realizado']} />
  </>
}
