import { useMemo } from 'react'
import { EmptyState, Skeleton, Table, type TableColumn } from '@betinhos/ui'
import { Inbox } from 'lucide-react'
import { BarraChart, Sparkline } from '../../charts/Charts'
import type { CorToken } from '../../charts/tokens'
import { calcularServicos, type LinhaParticipacao, type Servicos } from '../../domain/abas/servicos'
import { filtrarServicos } from '../../domain/base'
import { brl, brlS, int } from '../../domain/format'
import type { Contexto } from '../../domain/kpis'
import type { Dados, Filtros, PontoSerie } from '../../domain/types'
import { useMedia } from '../../../operacional/useMedia'
import { AnaliseCard } from '../AnaliseCard'
import { StatusServicosCard } from '../Analises'
import { Duplo, Nome, Participacao, pct } from '../Celulas'
import { Emergenciais } from '../Emergenciais'
import { COLUNA_LARGA, MEDIA_MOBILE, juntar } from '../Linhas'
import { ProducaoPropriaTerceira } from '../ProducaoPropriaTerceira'
import './abas-servicos-financeiro.css'

/** Base das abas: serviços do período e dos segmentos (`rv`) sobre todas as reservas carregadas. */
export const contexto = (dados: Dados, f: Filtros, now: Date): Contexto => ({ todas: dados.reservas, rv: filtrarServicos(dados.reservas, f), f, now })

/** KPI das abas: `valor` null é o "s/dado" do legado (conjunto que não carregou). */
export type KpiAba = { id: string; rotulo: string; valor: string | null; tom: 'action' | 'brand' | 'success' | 'warning'; apoio?: string; serie?: PontoSerie[] }
const SERIE: Record<KpiAba['tom'], [CorToken, CorToken]> = { action: ['action', 'actionSoft'], brand: ['brand', 'border'], success: ['success', 'successSoft'], warning: ['warning', 'warningSoft'] }

/** Linha de KPIs no formato do Resumo (`.dash-kpi`): borda superior na cor do indicador, valor, apoio discreto e sparkline quando há série. */
export function KpiLinha({ rotulo, kpis, quatro = false }: { rotulo: string; kpis: KpiAba[]; quatro?: boolean }) {
  return (
    <section className={quatro ? 'dash-kpis dash-sv-kpis--4' : 'dash-kpis'} aria-label={rotulo}>
      {kpis.map((k) => (
        <article key={k.id} className={`dash-kpi dash-kpi--${k.tom}`} aria-label={k.rotulo}>
          <span className="dash-kpi__rotulo">{k.rotulo}</span>
          {k.valor == null ? <strong className="dash-kpi__valor dash-sv-semdado">s/dado</strong> : <strong className="dash-kpi__valor">{k.valor}</strong>}
          {k.apoio ? <span className="dash-apoio">{k.apoio}</span> : null}
          {k.serie && k.serie.length > 1 ? <Sparkline dados={k.serie} linha={SERIE[k.tom][0]} area={SERIE[k.tom][1]} /> : null}
        </article>
      ))}
    </section>
  )
}

/** Primeira carga: a linha de KPIs da aba no formato final, ocupada e sem números. */
export function KpisCarregando({ rotulo, rotulos, quatro = false }: { rotulo: string; rotulos: string[]; quatro?: boolean }) {
  return (
    <section className={quatro ? 'dash-kpis dash-sv-kpis--4' : 'dash-kpis'} aria-label={rotulo} aria-busy="true">
      {rotulos.map((r) => (
        <article key={r} className="dash-kpi" aria-label={r}>
          <span className="dash-kpi__rotulo">{r}</span>
          <Skeleton height={26} width="62%" />
          <Skeleton height={16} width="84%" />
          <span className="dash-sr">Carregando</span>
        </article>
      ))}
    </section>
  )
}

export const ROTULOS_SERVICOS = ['Total de serviços', 'Concluídos', 'Cancelados', 'Emergenciais']
const vazio = (titulo: string) => <EmptyState compact icon={<Inbox />} title={titulo} />

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
        : vazio('Nenhum serviço no período')}
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
      tabela={<Table columns={colunas} rows={linhas} rowKey={(l) => l.tipo} empty={vazio('Nenhum serviço no período')} />}
    />
  )
}

/** Card no lugar de um bloco cujo conjunto não carregou: título, "s/dado" e o motivo. */
export function SemDadoCard({ titulo, periodo, unidade, motivo, largo = false }: { titulo: string; periodo: string; unidade: string; motivo: string; largo?: boolean }) {
  return <AnaliseCard titulo={titulo} periodo={periodo} unidade={unidade} valor="s/dado" sub={motivo} largo={largo} natural />
}

/**
 * Aba Serviços: quatro KPIs; Serviços por mês | Status; Por tipo de serviço | Por tipo de veículo;
 * Produção própria × terceirizada | Emergenciais por mês. Duas colunas na largura cheia, uma no estreito.
 */
export function ServicosTab({ dados, filtros, now, periodo }: { dados: Dados; filtros: Filtros; now: Date; periodo: string }) {
  const sv = useMemo(() => calcularServicos(contexto(dados, filtros, now), dados.veiculos, dados.indisponiveis.includes('veiculos')), [dados, filtros, now])
  const { kpis } = sv
  const indicadores: KpiAba[] = [
    { id: 'total', rotulo: ROTULOS_SERVICOS[0], valor: int(kpis.total), tom: 'brand', serie: sv.porMes.map((m) => ({ mes: m.mes, rotulo: m.rotulo, valor: m.qtd })) },
    { id: 'concluidos', rotulo: ROTULOS_SERVICOS[1], valor: int(kpis.concluidos.valor), tom: 'success', apoio: `${pct(kpis.concluidos.pct)} do total` },
    { id: 'cancelados', rotulo: ROTULOS_SERVICOS[2], valor: int(kpis.cancelados.valor), tom: 'warning', apoio: `${pct(kpis.cancelados.pct)} do total` },
    { id: 'emergenciais', rotulo: ROTULOS_SERVICOS[3], valor: int(kpis.emergenciais.valor), tom: 'action', apoio: `${pct(kpis.emergenciais.pct)} do total` },
  ]
  return <>
    <KpiLinha rotulo="Indicadores de serviços" kpis={indicadores} quatro />
    <div className="dash-grade">
      <PorMesCard dados={sv} periodo={periodo} />
      <StatusServicosCard dados={sv.status} periodo={periodo} />
      <ParticipacaoCard titulo="Por tipo de serviço" coluna="Tipo de serviço" linhas={sv.porTipoServico} periodo={periodo} />
      <ParticipacaoCard titulo="Por tipo de veículo" coluna="Tipo de veículo" linhas={sv.porTipoVeiculo} periodo={periodo} />
      {sv.producao
        ? <ProducaoPropriaTerceira dados={sv.producao} periodo={periodo} />
        : <SemDadoCard titulo="Produção própria × terceirizada" periodo={periodo} unidade="serviços por mês" motivo="Os veículos não carregaram: sem a categoria do veículo não há como separar própria e terceirizada." />}
      <Emergenciais dados={sv.emergenciais} periodo={periodo} />
    </div>
  </>
}

/** Primeira carga da aba Serviços: os quatro KPIs ocupados; os blocos entram com os dados. */
export const ServicosCarregando = () => <KpisCarregando rotulo="Indicadores de serviços" rotulos={ROTULOS_SERVICOS} quatro />
