import { useMemo } from 'react'
import { detalheAReceber, detalheCnh, detalheCpPendente, detalheMultasPendentes, detalheQualidade } from '../../domain/detalhes'
import { calcularResumo } from '../../domain/resumo'
import { useDetalhe } from '../DetalheDrawer'
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
  const resumo = useMemo(() => calcularResumo(ctx, dados), [dados, ctx])
  // Drill-down: as listas saem do mesmo recorte dos números (sem consulta nova).
  const abrir = useDetalhe()
  const nowMs = ctx.now.getTime()
  const kpis = abrir ? { cpPendente: () => abrir(detalheCpPendente(ctx.rv)), aReceber: () => abrir(detalheAReceber(ctx.rv)) } : {}
  const operacao = abrir ? { cnh: () => abrir(detalheCnh(dados.funcionarios, ctx.now)), multas: () => abrir(detalheMultasPendentes(dados.multas, ctx.f)) } : {}
  const qualidade = abrir ? {
    semVeiculo: () => abrir(detalheQualidade('semVeiculo', ctx.rv, nowMs)),
    semMotorista: () => abrir(detalheQualidade('semMotorista', ctx.rv, nowMs)),
    semCliente: () => abrir(detalheQualidade('semCliente', ctx.rv, nowMs)),
  } : {}
  return <>
    <KpiGrid kpis={resumo.kpis} abrir={kpis} />
    <div className="dash-faixas">
      <AlertList titulo={FAIXAS_RESUMO[0]} itens={resumo.operacao} abrir={operacao} />
      <AlertList titulo={FAIXAS_RESUMO[1]} itens={resumo.qualidade} abrir={qualidade} />
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
