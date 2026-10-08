import { useMemo } from 'react'
import { Table, type TableColumn } from '@betinhos/ui'
import { BarraChart } from '../../charts/Charts'
import { calcularServicos, type LinhaParticipacao, type Servicos } from '../../domain/abas/servicos'
import { brl, brlS, int } from '../../domain/format'
import { useMedia } from '../../../operacional/useMedia'
import { AnaliseCard } from '../AnaliseCard'
import { StatusServicosCard } from '../Analises'
import { AbaCarregando } from '../Carregando'
import { Duplo, Nome, Participacao, pct } from '../Celulas'
import { Emergenciais } from '../Emergenciais'
import { KpiCard, KpiLinha } from '../KpiCard'
import { ChipAnt } from '../KpiChip'
import { COLUNA_LARGA, MEDIA_MOBILE, juntar } from '../Linhas'
import { ProducaoPropriaTerceira } from '../ProducaoPropriaTerceira'
import { SemDadoBloco, Vazio } from '../Estados'
import type { DadosAba, PropsAba } from './abas'
import './abas-servicos-financeiro.css'

const ROTULO_KPIS = 'Indicadores de serviços'
const ROTULOS_SERVICOS = ['Total de serviços', 'Concluídos', 'Cancelados', 'Emergenciais']

/** Serviços por mês: barras com a quantidade e os valores sob demanda. */
function PorMesCard({ dados, periodo }: { dados: Servicos; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  type Mes = Servicos['porMes'][number]
  const colunas: TableColumn<Mes>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (m) => m.rotulo }, { key: 'q', header: 'Serviços', width: COLUNA_LARGA, cell: (m) => `${int(m.qtd)} serviços` }]
    : [{ key: 'm', header: 'Mês', cell: (m) => <strong className="dash-forte">{m.rotulo}</strong> }, { key: 'q', header: 'Serviços', align: 'end', cell: (m) => int(m.qtd) }]
  return (
    <AnaliseCard
      titulo="Serviços por mês" periodo={periodo} unidade="serviços por mês" valor={int(dados.kpis.total)}
      sub={dados.porMes.length ? `${int(dados.porMes.length)} ${dados.porMes.length === 1 ? 'mês' : 'meses'} com serviços` : 'nenhum serviço no período'}
      grafico={dados.porMes.length
        ? <BarraChart descricao={`Serviços por mês, ${periodo}`} nome="Serviços" formatar={int} larguraEixo={36} dados={dados.porMes.map((m) => ({ rotulo: m.rotulo, valor: m.qtd }))} />
        : <Vazio titulo="Nenhum serviço no período" />}
      tabela={dados.porMes.length ? <Table columns={colunas} rows={dados.porMes} rowKey={(m) => m.mes} /> : undefined} tabelaSobDemanda
    />
  )
}

/** Tabela de participação (`renderShareTable`): quantidade com % dos serviços, faturamento e % do faturamento em barra. */
function ParticipacaoCard({ titulo, coluna, linhas, periodo }: { titulo: string; coluna: string; linhas: LinhaParticipacao[]; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const topo = linhas[0]
  const colunas: TableColumn<LinhaParticipacao>[] = mobile
    ? [
      { key: 't', header: coluna, cell: (l) => l.tipo },
      { key: 'resto', header: 'Serviços e faturamento', width: COLUNA_LARGA, cell: (l) => juntar(`${int(l.qtd)} serviços (${pct(l.pctQtd)})`, `Faturamento ${brlS(l.fat)}`, `${pct(l.pctFat)} do faturamento`) },
    ]
    : [
      { key: 't', header: coluna, width: 'minmax(0, 1.3fr)', cell: (l) => <Nome texto={l.tipo} /> },
      { key: 'q', header: 'Serviços', align: 'end', width: 'minmax(64px, .7fr)', cell: (l) => <Duplo valor={int(l.qtd)} apoio={pct(l.pctQtd)} /> },
      { key: 'f', header: 'Faturamento', align: 'end', cell: (l) => brl(l.fat) },
      { key: 'p', header: <span className="dash-col-part">% do faturamento</span>, width: 'minmax(0, 1.3fr)', cell: (l) => <span className="dash-col-part"><Participacao valor={l.pctFat} rotulo={`Faturamento de ${l.tipo}`} /></span> },
    ]
  return (
    <AnaliseCard
      titulo={titulo} periodo={periodo} unidade="serviços e R$" valor={!topo ? '—' : topo.tipo === '—' ? 'Sem tipo informado' : topo.tipo}
      sub={topo ? `${pct(topo.pctFat)} do faturamento · ${int(topo.qtd)} serviços` : 'nenhum serviço no período'}
      tabela={<Table columns={colunas} rows={linhas} rowKey={(l) => l.tipo} empty={<Vazio titulo="Nenhum serviço no período" />} />}
    />
  )
}

/**
 * Aba Serviços: quatro KPIs; Serviços por mês | Status; Por tipo de serviço | Por tipo de veículo;
 * Produção própria × terceirizada | Emergenciais por mês. Duas colunas na largura cheia, uma no estreito.
 */
export function ServicosTab({ ctx, dados, periodo }: PropsAba) {
  if (!ctx || !dados) return <ServicosCarregando />
  return <ServicosAba ctx={ctx} dados={dados} periodo={periodo} />
}

function ServicosAba({ ctx, dados, periodo }: DadosAba) {
  const sv = useMemo(() => calcularServicos(ctx, dados.veiculos, dados.indisponiveis.includes('veiculos')), [ctx, dados])
  const { kpis } = sv
  return <>
    <KpiLinha rotulo={ROTULO_KPIS} colunas={4}>
      <KpiCard rotulo={ROTULOS_SERVICOS[0]} valor={int(kpis.total)} tom="brand" serie={sv.porMes.map((m) => ({ mes: m.mes, rotulo: m.rotulo, valor: m.qtd }))}><ChipAnt chip={sv.ant.total} /></KpiCard>
      <KpiCard rotulo={ROTULOS_SERVICOS[1]} valor={int(kpis.concluidos.valor)} tom="success" apoio={`${pct(kpis.concluidos.pct)} do total`}><ChipAnt chip={sv.ant.concluidos} /></KpiCard>
      <KpiCard rotulo={ROTULOS_SERVICOS[2]} valor={int(kpis.cancelados.valor)} tom="warning" apoio={`${pct(kpis.cancelados.pct)} do total`}><ChipAnt chip={sv.ant.cancelados} /></KpiCard>
      <KpiCard rotulo={ROTULOS_SERVICOS[3]} valor={int(kpis.emergenciais.valor)} tom="action" apoio={`${pct(kpis.emergenciais.pct)} do total`}><ChipAnt chip={sv.ant.emergenciais} /></KpiCard>
    </KpiLinha>
    <div className="dash-grade">
      <PorMesCard dados={sv} periodo={periodo} />
      <StatusServicosCard dados={sv.status} periodo={periodo} />
      <ParticipacaoCard titulo="Por tipo de serviço" coluna="Tipo de serviço" linhas={sv.porTipoServico} periodo={periodo} />
      <ParticipacaoCard titulo="Por tipo de veículo" coluna="Tipo de veículo" linhas={sv.porTipoVeiculo} periodo={periodo} />
      {sv.producao
        ? <ProducaoPropriaTerceira dados={sv.producao} periodo={periodo} />
        : <SemDadoBloco titulo="Produção própria × terceirizada" periodo={periodo} unidade="serviços por mês" motivo="Os veículos não carregaram: sem a categoria do veículo não há como separar própria e terceirizada." />}
      <Emergenciais dados={sv.emergenciais} periodo={periodo} />
    </div>
  </>
}

/** Primeira carga da aba Serviços: os quatro KPIs e os seis blocos ocupados. */
export const ServicosCarregando = () => (
  <AbaCarregando
    rotulo={ROTULO_KPIS} kpis={ROTULOS_SERVICOS} colunas={4}
    blocos={['Serviços por mês', 'Status dos serviços', 'Por tipo de serviço', 'Por tipo de veículo', 'Produção própria × terceirizada', 'Serviços emergenciais']}
  />
)
