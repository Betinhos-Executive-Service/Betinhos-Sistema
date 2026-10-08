import { useRef } from 'react'
import type { Resumo } from '../domain/resumo'
import { AlertList, AlertasCarregando } from './AlertList'
import { useAnalises } from './Analises'
import { Emergenciais } from './Emergenciais'
import { FrotaPessoas, FrotaSituacao } from './FrotaPessoas'
import { KPI_PLACEHOLDER, KpiGrid } from './KpiGrid'
import { ProducaoPropriaTerceira, TopMotoristas } from './ProducaoPropriaTerceira'
import { Secao, SecaoNav, useSecaoAtiva } from './Secoes'

/**
 * Aba Resumo em sete seções numeradas, com a barra de atalhos fixa no topo da rolagem.
 * Grades: duas colunas por seção (uma no estreito); tabelas largas ocupam a linha toda.
 */
export function ResumoSecoes({ resumo, periodo }: { resumo: Resumo; periodo: string }) {
  const barra = useRef<HTMLElement>(null)
  const { ativa, irPara } = useSecaoAtiva(barra)
  const c = useAnalises(resumo, periodo)
  return <>
    <SecaoNav barra={barra} ativa={ativa} onIr={irPara} />
    <Secao id="indicadores">
      <KpiGrid kpis={resumo.kpis} carregando={false} />
    </Secao>
    <Secao id="alertas">
      <div className="dash-faixas">
        <AlertList titulo="Operação" itens={resumo.operacao} />
        <AlertList titulo="Qualidade dos dados" itens={resumo.qualidade} />
        <FrotaPessoas cards={resumo.frota} />
      </div>
    </Secao>
    <Secao id="producao">
      <div className="dash-grade">
        <ProducaoPropriaTerceira dados={resumo.producao} periodo={periodo} />
        <Emergenciais dados={resumo.emergenciais} periodo={periodo} />
        <TopMotoristas titulo="Top 5 motoristas próprios" rows={resumo.producao.topPropria} periodo={periodo} />
        <TopMotoristas titulo="Top 5 motoristas terceirizados" rows={resumo.producao.topTerceirizada} periodo={periodo} />
      </div>
    </Secao>
    <Secao id="faturamento">
      <div className="dash-grade">
        {c.totalProduzido}
        {c.metaRealizado}
        {c.ticket}
        {c.status}
      </div>
    </Secao>
    <Secao id="clientes">
      <div className="dash-grade">
        {c.clientes}
        {c.topVolume}
        {c.topFaturamento}
      </div>
    </Secao>
    <Secao id="frota">
      <div className="dash-grade">
        {c.custoFrota}
        <FrotaSituacao cards={resumo.frota} periodo={periodo} />
      </div>
    </Secao>
    <Secao id="motoristas">
      {c.motoristas}
    </Secao>
  </>
}

/** Primeira carga: Indicadores e Alertas no formato final, ocupados e sem números; o resto entra com os dados. */
export function ResumoCarregando() {
  return <>
    <Secao id="indicadores" carregando>
      <KpiGrid kpis={KPI_PLACEHOLDER} carregando />
    </Secao>
    <Secao id="alertas" carregando>
      <AlertasCarregando />
    </Secao>
  </>
}
