import { useMemo } from 'react'
import { Button, PageToolbar, Select, StatusBadge, Table, type StatusTone, type TableColumn } from '@betinhos/ui'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleCheck, X } from 'lucide-react'
import { LinhaChart } from '../../charts/Charts'
import {
  calcularDespesas, periodoAnteriorDespesa,
  type ChipAnterior, type Distribuicao, type KpiDespesa, type KpiDespesaId, type LinhaDistribuicao, type LinhaMes, type LinhaMotorista,
} from '../../domain/abas/despesas'
import { brl, brlS, dec, int } from '../../domain/format'
import type { Tom } from '../../domain/types'
import { useMedia } from '../../../operacional/useMedia'
import { AnaliseCard } from '../AnaliseCard'
import { AbaCarregando } from '../Carregando'
import { Duplo, Nome, Participacao, Rolagem, pct } from '../Celulas'
import { KpiCard, KpiLinha, type TomKpi } from '../KpiCard'
import { COLUNA_LARGA, Linhas, MEDIA_MOBILE, juntar } from '../Linhas'
import { SemDadoBloco, Vazio, naoRespondeu } from '../Estados'
import type { DadosAba, PropsAba } from './abas'
import './abas-despesas-frota.css'

/** Filtros próprios da aba (ids de categoria e forma, rótulo da empresa); motorista e período vêm do filtro global. */
export type FiltrosDespesaProprios = { categorias: string[]; formas: string[]; empresas: string[] }
export const FILTROS_DESPESA_VAZIOS: FiltrosDespesaProprios = { categorias: [], formas: [], empresas: [] }

const TOM_KPI: Record<KpiDespesaId, TomKpi> = { despesa: 'action', alimentacao: 'brand', aguardando: 'warning', ticket: 'brand', semComprovante: 'warning', hospedagem: 'brand' }
const TOM_FAIXA: Record<Tom, StatusTone> = { ok: 'success', warn: 'warning', danger: 'danger', neutral: 'neutral' }
const ROTULO_KPIS = 'Indicadores de despesas'
const ROTULOS_KPI = ['Despesa realizada', 'Alimentação', 'Aguardando pagamento', 'Ticket médio', 'Sem comprovante', 'Média hospedagem']
const BLOCOS = ['Despesas por mês', 'Por categoria', 'Por empresa', 'Grupos DRE', 'Por motorista']
const MOTIVO = naoRespondeu('A tabela de despesas')

/** Valor do KPI: s/dado (null) com as despesas fora do ar; "—" quando não há lançamento (média de hospedagem). */
const formatarKpi = (k: KpiDespesa, indisponivel: boolean) =>
  (indisponivel ? null : k.valor == null ? '—' : k.formato === 'brlS' ? brlS(k.valor) : k.formato === 'brl' ? brl(k.valor) : int(k.valor))
const forte = (texto: string) => <strong className="dash-forte">{texto}</strong>

/** Chip "ANT." contra o período anterior: subir é desfavorável; seta, sinal e "favorável/desfavorável" em texto, além da cor. */
export function ChipAnt({ chip }: { chip: ChipAnterior }) {
  const rotulo = <><span className="dash-chip__rotulo" aria-hidden="true">{chip.rotulo}</span><span className="dash-sr">Período anterior</span></>
  if (chip.tipo === 'sem-dado') return <span className="dash-chip dash-chip--neutro">{rotulo} <span className="dash-chip__texto">s/dado</span></span>
  if (chip.tipo === 'base-zero') return <span className="dash-chip dash-chip--neutro">{rotulo} <span className="dash-chip__texto">{chip.anterior} · base zero</span></span>
  const sobe = chip.variacao >= 0
  return (
    <span className={chip.favoravel ? 'dash-chip dash-chip--sobe' : 'dash-chip dash-chip--desce'}>
      {rotulo} <span className="dash-chip__texto">{chip.anterior}</span>{' '}
      <span className="dash-chip__delta">{sobe ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}{sobe ? '+' : '−'}{dec(Math.abs(chip.variacao), 1)}%</span>
      <span className="dash-sr">{chip.favoravel ? ', favorável' : ', desfavorável'}</span>
    </span>
  )
}

/** KPI de despesa: o card único com o chip ANT. e, na hospedagem, a faixa da política (com texto) como extras. */
function KpiDespesaCartao({ k, indisponivel }: { k: KpiDespesa; indisponivel: boolean }) {
  const icone = k.faixa?.tom === 'ok' ? <CircleCheck size={12} /> : k.faixa?.tom === 'warn' || k.faixa?.tom === 'danger' ? <AlertTriangle size={12} /> : undefined
  const extras = k.chip || k.faixa ? <>
    {k.chip ? <ChipAnt chip={k.chip} /> : null}
    {k.faixa ? <>
      <StatusBadge tone={TOM_FAIXA[k.faixa.tom]} icon={icone}>{k.faixa.texto}</StatusBadge>
      <span className="dash-apoio">{k.faixa.apoio}</span>
    </> : null}
  </> : undefined
  return <KpiCard rotulo={k.rotulo} valor={formatarKpi(k, indisponivel)} tom={TOM_KPI[k.id]} serie={k.serie}>{extras}</KpiCard>
}

type Proprios = { proprios: FiltrosDespesaProprios; onProprios: (f: FiltrosDespesaProprios) => void }

/**
 * Aba Despesas: filtros próprios (categoria, forma, empresa) acima dos seis KPIs com chip "ANT." e a faixa da hospedagem;
 * depois Despesas por mês | Por categoria, Por empresa | Grupos DRE e Por motorista na largura toda.
 */
export function DespesasTab({ ctx, dados, periodo, proprios, onProprios }: PropsAba & Proprios) {
  if (!ctx || !dados) return <DespesasCarregando />
  return <DespesasAba ctx={ctx} dados={dados} periodo={periodo} proprios={proprios} onProprios={onProprios} />
}

function DespesasAba({ ctx, dados, periodo, proprios, onProprios }: DadosAba & Proprios) {
  const { inicio, fim, motoristas } = ctx.f
  const mobile = useMedia(MEDIA_MOBILE)
  const indisponivel = dados.indisponiveis.includes('despesas')
  const d = useMemo(() => calcularDespesas(
    dados.despesas, dados.categoriasDespesa, dados.formasPagamento, { inicio, fim },
    { ...proprios, motoristas }, periodoAnteriorDespesa(inicio, fim), indisponivel,
  ), [dados, inicio, fim, motoristas, proprios, indisponivel])
  const ativos = proprios.categorias.length + proprios.formas.length + proprios.empresas.length
  const tamanho = mobile ? 'default' : 'compact'

  return <>
    <PageToolbar
      variant="filters" label="Filtros de despesas" className="dash-de-filtros"
      start={<>
        <Select multiple size={tamanho} aria-label="Categoria" placeholder="Categoria" options={d.opcoes.categorias} value={proprios.categorias} onChange={(v) => onProprios({ ...proprios, categorias: v })} />
        <Select multiple size={tamanho} aria-label="Forma de pagamento" placeholder="Forma de pagamento" searchable={false} options={d.opcoes.formas} value={proprios.formas} onChange={(v) => onProprios({ ...proprios, formas: v })} />
        <Select multiple size={tamanho} aria-label="Empresa" placeholder="Empresa" searchable={false} options={d.opcoes.empresas} value={proprios.empresas} onChange={(v) => onProprios({ ...proprios, empresas: v })} />
        <span className="dash-de-filtros__nota">Período e motorista seguem os filtros do dashboard.</span>
      </>}
      end={ativos ? <Button variant="ghost" size={tamanho} icon={<X size={16} />} onClick={() => onProprios(FILTROS_DESPESA_VAZIOS)}>Limpar filtros de despesas</Button> : undefined}
    />
    <KpiLinha rotulo={ROTULO_KPIS} colunas={6}>
      {d.kpis.map((k) => <KpiDespesaCartao key={k.id} k={k} indisponivel={indisponivel} />)}
    </KpiLinha>
    <div className="dash-grade">
      {indisponivel
        ? BLOCOS.map((titulo) => <SemDadoBloco key={titulo} titulo={titulo} periodo={periodo} unidade="R$ e lançamentos" motivo={MOTIVO} largo={titulo === 'Por motorista'} />)
        : <>
          <PorMesCard linhas={d.porMes} total={d.total} lancamentos={d.lancamentos} periodo={periodo} mobile={mobile} />
          <DistribuicaoCard titulo="Por categoria" coluna="Categoria" plural="categorias" dist={d.porCategoria} periodo={periodo} mobile={mobile} />
          <DistribuicaoCard titulo="Por empresa" coluna="Empresa" plural="empresas" dist={d.porEmpresa} periodo={periodo} mobile={mobile} />
          <DistribuicaoCard titulo="Grupos DRE" coluna="Grupo DRE" plural="grupos DRE" dist={d.gruposDre} periodo={periodo} mobile={mobile} />
          <PorMotoristaCard linhas={d.porMotorista} periodo={periodo} mobile={mobile} />
        </>}
    </div>
  </>
}

/** Primeira carga da aba: os seis KPIs e os cinco blocos ocupados. */
export const DespesasCarregando = () => <AbaCarregando rotulo={ROTULO_KPIS} kpis={ROTULOS_KPI} colunas={6} blocos={BLOCOS} />

type Bloco = { periodo: string; mobile: boolean }

function PorMesCard({ linhas, total, lancamentos, periodo, mobile }: Bloco & { linhas: LinhaMes[]; total: number; lancamentos: number }) {
  const colunas: TableColumn<LinhaMes>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (l) => l.rotulo }, { key: 'resto', header: 'Valores', width: COLUNA_LARGA, cell: (l) => juntar(`${int(l.lancamentos)} lançamentos`, `Despesa ${brl(l.valor)}`, `Alimentação ${brl(l.alimentacao)}`) }]
    : [
      { key: 'm', header: 'Mês', cell: (l) => forte(l.rotulo) },
      { key: 'q', header: 'Lançamentos', align: 'end', cell: (l) => int(l.lancamentos) },
      { key: 'v', header: 'Despesa', align: 'end', cell: (l) => forte(brl(l.valor)) },
      { key: 'a', header: 'Alimentação', align: 'end', cell: (l) => brl(l.alimentacao) },
    ]
  return (
    <AnaliseCard
      titulo="Despesas por mês" periodo={periodo} unidade="R$ por mês" valor={brl(total)} sub={`${int(lancamentos)} lançamentos`}
      grafico={linhas.length ? (
        <LinhaChart
          descricao={`Despesa total e alimentação por mês, ${periodo}`} formatar={brlS}
          dados={linhas.map((l) => ({ rotulo: l.rotulo, valor: l.valor, alimentacao: l.alimentacao }))}
          series={[{ chave: 'valor', nome: 'Despesa total', cor: 'action' }, { chave: 'alimentacao', nome: 'Alimentação', cor: 'brand', tracejada: true }]}
        />
      ) : <Vazio titulo="Nenhuma despesa no período" />}
      tabela={linhas.length ? <Table columns={colunas} rows={linhas} rowKey={(l) => l.mes} /> : undefined}
      tabelaSobDemanda
    />
  )
}

/** Distribuição por categoria, empresa ou grupo DRE: lançamentos, valor e participação por valor (barra com texto). */
function DistribuicaoCard({ titulo, coluna, plural, dist, periodo, mobile }: Bloco & { titulo: string; coluna: string; plural: string; dist: Distribuicao }) {
  const topo = dist.linhas[0]
  const colunas: TableColumn<LinhaDistribuicao>[] = mobile
    ? [{ key: 'r', header: coluna, cell: (l) => l.rotulo }, { key: 'resto', header: 'Valores', width: COLUNA_LARGA, cell: (l) => juntar(`${int(l.lancamentos)} lançamentos`, brl(l.valor), `Participação ${pct(l.participacao)}`) }]
    : [
      { key: 'r', header: coluna, width: 'minmax(0, 1.2fr)', cell: (l) => <Nome texto={l.rotulo} /> },
      { key: 'q', header: 'Lançamentos', align: 'end', width: 'minmax(0, .8fr)', cell: (l) => <Duplo valor={int(l.lancamentos)} apoio={pct(l.pctLancamentos)} /> },
      { key: 'v', header: 'Valor', align: 'end', cell: (l) => forte(brl(l.valor)) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: 'minmax(0, 1.3fr)', cell: (l) => <span className="dash-col-part"><Participacao valor={l.participacao} rotulo={`Participação de ${l.rotulo}`} /></span> },
    ]
  const resumo = dist.grupos > dist.linhas.length ? `${int(dist.linhas.length)} de ${int(dist.grupos)} ${plural}` : undefined
  return (
    <AnaliseCard
      titulo={titulo} periodo={periodo} unidade="R$ e lançamentos" natural
      valor={topo ? topo.rotulo : '—'}
      sub={topo ? `Maior participação: ${pct(topo.participacao)} · ${brl(topo.valor)}` : `Nenhuma despesa no período`}
      apoio={resumo ? [{ rotulo: 'Mostrando', texto: resumo }] : []}
      tabela={<Table columns={colunas} rows={dist.linhas} rowKey={(l) => l.rotulo} empty={<Vazio titulo="Nenhuma despesa no período" />} />}
    />
  )
}

/** Por motorista: hospedagem (total e média por lançamento), alimentação (total e média por dia) e total; largura toda. */
function PorMotoristaCard({ linhas, periodo, mobile }: Bloco & { linhas: LinhaMotorista[] }) {
  const colunas: TableColumn<LinhaMotorista>[] = mobile
    ? [
      { key: 'm', header: 'Motorista', cell: (l) => l.motorista },
      {
        key: 'resto', header: 'Valores', width: COLUNA_LARGA, cell: (l) => <Linhas itens={[
          `Total ${brl(l.total)} · ${int(l.lancamentos)} lançamentos`,
          `Hospedagem ${brl(l.hospedagem)}${l.hospedagemMedia != null ? ` · média ${brl(l.hospedagemMedia)}` : ''}`,
          `Alimentação ${brl(l.alimentacao)} · ${brl(l.alimentacaoMediaDia)}/dia`,
        ]} />,
      },
    ]
    : [
      { key: 'm', header: 'Motorista', width: 'minmax(0, 1.4fr)', cell: (l) => <Nome texto={l.motorista} /> },
      { key: 'q', header: 'Lançamentos', align: 'end', width: 'minmax(0, .7fr)', cell: (l) => int(l.lancamentos) },
      { key: 'h', header: 'Hospedagem', align: 'end', cell: (l) => <Duplo valor={brl(l.hospedagem)} apoio={l.hospedagemMedia != null ? `média ${brl(l.hospedagemMedia)}` : 'sem hospedagem'} /> },
      { key: 'a', header: 'Alimentação', align: 'end', cell: (l) => <Duplo valor={brl(l.alimentacao)} apoio={`${brl(l.alimentacaoMediaDia)}/dia`} /> },
      { key: 't', header: 'Total', align: 'end', cell: (l) => forte(brl(l.total)) },
    ]
  const tabela = <Table columns={colunas} rows={linhas} rowKey={(l) => l.key} empty={<Vazio titulo="Nenhuma despesa com motorista no período" />} />
  return (
    <AnaliseCard
      titulo="Por motorista" periodo={periodo} unidade="R$ por motorista" largo
      valor={int(linhas.length)} sub="motoristas com despesa · hospedagem, alimentação e total"
      tabela={!mobile && linhas.length > 10 ? <Rolagem rotulo="Despesas por motorista" alturaMax={560}>{tabela}</Rolagem> : tabela}
    />
  )
}
