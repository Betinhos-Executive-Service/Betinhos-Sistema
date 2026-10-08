import { useId, useMemo } from 'react'
import { Button, StatusBadge, Table, type TableColumn } from '@betinhos/ui'
import { calcularFinanceiro, type CicloFinanceiro, type Financeiro, type LinhaClienteFin, type LinhaForma, type LinhaStatusFat, type LinhaStatusPag } from '../../domain/abas/financeiro'
import type { Delta } from '../../domain/analises'
import { brl, brlS, dec, int, normL } from '../../domain/format'
import type { Dados } from '../../domain/types'
import { useMedia } from '../../../operacional/useMedia'
import { AnaliseCard } from '../AnaliseCard'
import { TicketMensalCard } from '../Analises'
import { AbaCarregando } from '../Carregando'
import { KpiCard, KpiLinha } from '../KpiCard'
import { SemDadoBloco, Vazio } from '../Estados'
import { Duplo, Nome, Participacao, Rolagem, Status, ValorDelta, col, larguraMinima, pct, tomStatus } from '../Celulas'
import { COLUNA_LARGA, Expansivel, MEDIA_MOBILE, VER_MESES, juntar, useLinhasAbertas } from '../Linhas'
import type { DadosAba, PropsAba } from './abas'
import './abas-servicos-financeiro.css'

const ROTULO_KPIS = 'Indicadores financeiros'
const ROTULOS_FINANCEIRO = ['Maior serviço', 'Clientes ativos', 'Total recebido', 'Cartão', 'Atrasados > 5 dias', 'Tempo médio de pagamento']
const SEM_PAGANTES = 'Os pagamentos não carregaram.'
/** Pagantes não têm janela de datas (como o legado): o que depende deles cobre todo o histórico, não o período (spec §6). */
const HISTORICO = 'todo o histórico'
const dias = (v: number, casas = 1) => `${dec(v, casas)} dias`
const dataBR = (raw: string) => new Date(raw).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const forte = (texto: string) => <strong className="dash-forte">{texto}</strong>

/** Ciclo financeiro (`renderFaturamentoCycle`): as cinco medidas em lista, com o apoio do legado; sem pagantes, s/dado. */
function CicloCard({ ciclo: c, indisponivel, periodo }: { ciclo: CicloFinanceiro; indisponivel: boolean; periodo: string }) {
  const emDias = (v: number | null) => (v == null ? null : dias(v))
  // Pagantes indisponíveis vêm antes de `dataPagamentoDisponivel`: sem a tabela, nada de "nenhuma CP pendente".
  const itens: { rotulo: string; valor: string | null; apoio: string }[] = [
    { rotulo: 'Prazo para faturar', valor: indisponivel ? null : emDias(c.prazoFaturar), apoio: indisponivel ? SEM_PAGANTES : `${int(c.cpsMedidas)} CPs: finalização até cobrança` },
    { rotulo: 'Prazo para pagar', valor: indisponivel ? null : emDias(c.prazoPagar), apoio: indisponivel ? SEM_PAGANTES : c.dataPagamentoDisponivel ? `${int(c.pagamentosMedidos)} pagamentos medidos · ${HISTORICO}` : 'campo ainda não publicado no ambiente' },
    { rotulo: 'Ciclo financeiro', valor: indisponivel ? null : emDias(c.ciclo), apoio: 'soma das médias acima' },
    {
      rotulo: 'CP pendente mais antiga',
      valor: indisponivel ? null : c.cpMaisAntiga == null ? '—' : dias(c.cpMaisAntiga, 0),
      apoio: indisponivel ? SEM_PAGANTES : c.cpMaisAntiga == null ? 'nenhuma CP pendente' : `${brl(c.cpMaisAntigaValor)} desde ${dataBR(c.cpMaisAntigaDesde)}`,
    },
    { rotulo: 'Rodoanel', valor: null, apoio: 'sem vínculo confirmado de repasse' },
  ]
  return (
    <AnaliseCard
      titulo="Ciclo financeiro" periodo={periodo} unidade="dias corridos" sub="Da finalização do serviço à cobrança e da cobrança ao pagamento."
      tabela={(
        <ul className="dash-lista" aria-label="Medidas do ciclo financeiro">
          {itens.map((i) => (
            <li key={i.rotulo} className="dash-lista__item">
              <span className="dash-lista__texto"><span className="dash-lista__rotulo">{i.rotulo}</span><span className="dash-lista__apoio">{i.apoio}</span></span>
              <strong className={i.valor == null ? 'dash-lista__valor dash-lista__valor--semdado' : 'dash-lista__valor'}>{i.valor ?? 's/dado'}</strong>
            </li>
          ))}
        </ul>
      )}
    />
  )
}

/** Status de faturamento (`tblFatStatus`): serviços com saída a partir de 01/04/2026, participação por quantidade. */
function StatusFaturamentoCard({ linhas, periodo }: { linhas: LinhaStatusFat[]; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const topo = linhas[0]
  const colunas: TableColumn<LinhaStatusFat>[] = mobile
    ? [
      { key: 's', header: 'Status', cell: (l) => <Status texto={l.status} /> },
      { key: 'resto', header: 'Serviços e faturamento', width: COLUNA_LARGA, cell: (l) => juntar(`${int(l.qtd)} serviços`, `Faturamento ${brlS(l.valor)}`, `Participação ${pct(l.pct)}`) },
    ]
    : [
      { key: 's', header: 'Status', width: 'minmax(0, 1.2fr)', cell: (l) => <Status texto={l.status} /> },
      { key: 'q', header: 'Serviços', align: 'end', width: 'minmax(56px, .6fr)', cell: (l) => int(l.qtd) },
      { key: 'v', header: 'Faturamento', align: 'end', cell: (l) => brl(l.valor) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: 'minmax(0, 1.2fr)', cell: (l) => <span className="dash-col-part"><Participacao valor={l.pct} rotulo={`Participação de ${l.status}`} /></span> },
    ]
  return (
    <AnaliseCard
      titulo="Status de faturamento" periodo={periodo} unidade="serviços e R$" valor={topo?.status ?? '—'}
      sub={topo ? `${pct(topo.pct)} dos serviços com saída a partir de 01/04/2026` : 'serviços com saída a partir de 01/04/2026'}
      tabela={<Table columns={colunas} rows={linhas} rowKey={(l) => l.status} empty={<Vazio titulo="Nenhum serviço com saída a partir de 01/04/2026" />} />}
    />
  )
}

/** Pago/paga em sucesso; os demais como o legado classifica (`badge`). */
const StatusPagamento = ({ texto }: { texto: string }) => {
  const k = normL(texto)
  return <StatusBadge tone={k === 'pago' || k === 'paga' ? 'success' : tomStatus(texto)} dot>{texto}</StatusBadge>
}

type LinhaDist = { rotulo: string; qtd: number; valor: number; pct: number }
function TabelaDistribuicao({ coluna, linhas, badge, mobile }: { coluna: string; linhas: LinhaDist[]; badge: boolean; mobile: boolean }) {
  const nome = (l: LinhaDist) => (badge ? <StatusPagamento texto={l.rotulo} /> : mobile ? l.rotulo : <Nome texto={l.rotulo} />)
  const colunas: TableColumn<LinhaDist>[] = mobile
    ? [
      { key: 'n', header: coluna, cell: nome },
      { key: 'resto', header: 'Registros e valor', width: COLUNA_LARGA, cell: (l) => juntar(`${int(l.qtd)} registros`, `Valor ${brlS(l.valor)}`, `Participação ${pct(l.pct)}`) },
    ]
    : [
      { key: 'n', header: coluna, width: 'minmax(0, 1.2fr)', cell: nome },
      { key: 'q', header: 'Registros', align: 'end', width: 'minmax(56px, .6fr)', cell: (l) => int(l.qtd) },
      { key: 'v', header: 'Valor', align: 'end', cell: (l) => brl(l.valor) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: 'minmax(0, 1.2fr)', cell: (l) => <span className="dash-col-part"><Participacao valor={l.pct} rotulo={`Participação de ${l.rotulo}`} /></span> },
    ]
  return <Table columns={colunas} rows={linhas} rowKey={(l) => l.rotulo} empty={<Vazio titulo="Nenhum pagamento registrado" />} />
}

/**
 * Recebimentos por forma e por status (`tblFormaPag` + `tblStatusPag`): todos os pagantes, participação pelo valor. Os pagantes não têm
 * janela de datas, então o rodapé diz "todo o histórico" no lugar do período do filtro (spec §6).
 */
function RecebimentosCard({ porForma, porStatus, pagantes }: { porForma: LinhaForma[]; porStatus: LinhaStatusPag[]; pagantes: Dados['pagantes'] }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const total = pagantes.reduce((s, p) => s + (p.valor || 0), 0)
  return (
    <AnaliseCard
      titulo="Recebimentos" periodo="Todo o histórico" unidade="R$ por registro de pagamento" valor={brlS(total)}
      sub={`${int(pagantes.length)} ${pagantes.length === 1 ? 'registro' : 'registros'} de pagamento · participação pelo valor`}
      tabela={(
        <div className="dash-fi-recebimentos">
          <section aria-label="Recebimentos por forma"><h3 className="dash-fi-subtitulo">Por forma</h3><TabelaDistribuicao coluna="Forma" linhas={porForma.map((l) => ({ ...l, rotulo: l.forma }))} badge={false} mobile={mobile} /></section>
          <section aria-label="Recebimentos por status"><h3 className="dash-fi-subtitulo">Por status</h3><TabelaDistribuicao coluna="Status" linhas={porStatus.map((l) => ({ ...l, rotulo: l.status }))} badge mobile={mobile} /></section>
        </div>
      )}
    />
  )
}

const deltaTexto = (d: Delta) => (d.tipo === 'novo' ? ' (novo)' : d.tipo === 'pct' ? ` (${d.valor >= 0 ? '+' : '−'}${dec(Math.abs(d.valor), 1)}%)` : '')
/** Trilhas do desktop: cliente, serviços, faturamento, ticket, participação, botão e a trilha de 0 px do detalhe. */
const TRILHAS = [col(160, 1.6), col(72, 0.6), col(104, 0.8), col(96, 0.8), col(140, 1.2), { min: 120, width: '120px' }, { min: 0, width: '0px' }]
const VAO = 12

/** Clientes (tabela única no lugar de `tbFat` e dos tops): todos por faturamento, "Sem cliente" no fim; "Ver meses" abre o faturamento mensal. */
function ClientesCard({ fi, periodo }: { fi: Financeiro; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const base = useId()
  const abertas = useLinhasAbertas(fi.clientes.map((l) => l.cliente))
  const indice = new Map(fi.clientes.map((l, i) => [l.cliente, i]))
  const detalheId = (l: LinhaClienteFin) => `${base}-meses-${indice.get(l.cliente)}`
  const rotuloMes = (i: number) => fi.meses[i]?.rotulo ?? ''
  const colunas: TableColumn<LinhaClienteFin>[] = mobile
    ? [
      { key: 'c', header: 'Cliente', cell: (l) => l.cliente },
      {
        key: 'resto', header: 'Faturamento', width: COLUNA_LARGA,
        cell: (l) => (
          <Expansivel
            resumo={juntar(`${int(l.servicos)} serviços`, `Faturamento ${brlS(l.faturamento)}`, `Ticket ${brlS(l.ticket)}`, `Participação ${pct(l.pct)}`)}
            itens={l.meses.map((m, i) => `${rotuloMes(i)}: ${brlS(m.valor)}${deltaTexto(m.delta)}`)} rotulos={VER_MESES}
            aberta={abertas.aberta(l.cliente)} onAlternar={() => abertas.alternar(l.cliente)}
          />
        ),
      },
    ]
    : [
      { key: 'c', header: 'Cliente', width: TRILHAS[0].width, cell: (l) => <Nome texto={l.cliente} /> },
      { key: 's', header: 'Serviços', align: 'end', width: TRILHAS[1].width, cell: (l) => <Duplo valor={int(l.servicos)} apoio={pct(l.pctServicos)} /> },
      { key: 'f', header: 'Faturamento', align: 'end', width: TRILHAS[2].width, cell: (l) => forte(brl(l.faturamento)) },
      { key: 't', header: 'Ticket médio', align: 'end', width: TRILHAS[3].width, cell: (l) => brl(l.ticket) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: TRILHAS[4].width, cell: (l) => <span className="dash-col-part"><Participacao valor={l.pct} rotulo={`Participação de ${l.cliente} no faturamento`} /></span> },
      {
        key: 'b', header: 'Meses', align: 'end', width: TRILHAS[5].width,
        cell: (l) => {
          const aberta = abertas.aberta(l.cliente)
          return (
            <Button variant="ghost" size="compact" aria-expanded={aberta} aria-controls={aberta ? detalheId(l) : undefined} onClick={() => abertas.alternar(l.cliente)}>
              {aberta ? VER_MESES[1] : VER_MESES[0]}{' '}<span className="dash-sr">de {l.cliente}</span>
            </Button>
          )
        },
      },
      {
        key: 'd', header: <span className="dash-sr">Faturamento por mês</span>, width: TRILHAS[6].width,
        cell: (l) => (abertas.aberta(l.cliente) ? (
          <ul id={detalheId(l)} className="dash-fi-meses" aria-label={`Faturamento de ${l.cliente} por mês`}>
            {l.meses.map((m, i) => <li key={m.mes} className="dash-fi-meses__item"><span className="dash-fi-meses__rotulo">{rotuloMes(i)}</span><ValorDelta valor={brlS(m.valor)} delta={m.delta} /></li>)}
          </ul>
        ) : null),
      },
    ]
  const tabela = <Table className="dash-fi-clientes" columns={colunas} rows={fi.clientes} rowKey={(l) => l.cliente} empty={<Vazio titulo="Nenhum cliente no período" />} style={mobile ? undefined : { minWidth: larguraMinima(TRILHAS, VAO) }} />
  return (
    <AnaliseCard
      titulo="Clientes" periodo={periodo} unidade="R$ e serviços por cliente" valor={int(fi.kpis.clientesAtivos)}
      sub={`${fi.kpis.clientesAtivos === 1 ? 'cliente ativo' : 'clientes ativos'} · ordenados por faturamento`} largo
      tabela={mobile ? tabela : <Rolagem rotulo="Faturamento por cliente" alturaMax={560}>{tabela}</Rolagem>}
    />
  )
}

/**
 * Aba Financeiro (= Faturamento + Pagamentos): seis KPIs; Ciclo financeiro | Status de faturamento; Ticket médio mensal |
 * Recebimentos por forma e status; Clientes na largura toda. Sem pagantes, os cards que dependem deles mostram s/dado.
 */
export function FinanceiroTab({ ctx, dados, periodo }: PropsAba) {
  if (!ctx || !dados) return <FinanceiroCarregando />
  return <FinanceiroAba ctx={ctx} dados={dados} periodo={periodo} />
}

function FinanceiroAba({ ctx, dados, periodo }: DadosAba) {
  const indisponivel = dados.indisponiveis.includes('pagantes')
  const fi = useMemo(() => calcularFinanceiro(ctx, dados.pagantes, indisponivel), [ctx, dados.pagantes, indisponivel])
  const k = fi.kpis
  const tempoApoio = indisponivel ? SEM_PAGANTES
    : !fi.ciclo.dataPagamentoDisponivel ? 'campo ainda não publicado no ambiente'
      : `${int(k.pagamentosMedidos)} de ${int(k.pagamentosRecebidos)} pagamentos com data confiável · ${HISTORICO}`
  return <>
    <KpiLinha rotulo={ROTULO_KPIS} colunas={6}>
      <KpiCard rotulo={ROTULOS_FINANCEIRO[0]} valor={brlS(k.maiorServico)} tom="action" />
      <KpiCard rotulo={ROTULOS_FINANCEIRO[1]} valor={int(k.clientesAtivos)} tom="brand" />
      <KpiCard rotulo={ROTULOS_FINANCEIRO[2]} valor={brlS(k.totalRecebido)} tom="success" apoio="serviços com faturamento pago" />
      <KpiCard rotulo={ROTULOS_FINANCEIRO[3]} valor={k.cartao == null ? null : brlS(k.cartao)} tom="action" apoio={indisponivel ? SEM_PAGANTES : `recebido em cartão, crédito, link ou máquina · ${HISTORICO}`} />
      <KpiCard rotulo={ROTULOS_FINANCEIRO[4]} valor={k.atrasados == null ? null : int(k.atrasados)} tom="warning" apoio={indisponivel ? SEM_PAGANTES : `pagamentos pendentes · ${HISTORICO}`} />
      <KpiCard rotulo={ROTULOS_FINANCEIRO[5]} valor={k.tempoMedioPagamento == null ? null : dias(k.tempoMedioPagamento)} tom="brand" apoio={tempoApoio} />
    </KpiLinha>
    <div className="dash-grade">
      <CicloCard ciclo={fi.ciclo} indisponivel={indisponivel} periodo={periodo} />
      <StatusFaturamentoCard linhas={fi.statusFaturamento} periodo={periodo} />
      <TicketMensalCard dados={fi.ticketMensal} periodo={periodo} />
      {indisponivel
        ? <SemDadoBloco titulo="Recebimentos" periodo="Todo o histórico" unidade="R$ por registro de pagamento" motivo="Os pagamentos não carregaram: por forma e por status ficam sem dado até a próxima atualização." />
        : <RecebimentosCard porForma={fi.porForma} porStatus={fi.porStatus} pagantes={dados.pagantes} />}
      <ClientesCard fi={fi} periodo={periodo} />
    </div>
  </>
}

/** Primeira carga da aba Financeiro: os seis KPIs e os cinco blocos ocupados. */
export const FinanceiroCarregando = () => (
  <AbaCarregando rotulo={ROTULO_KPIS} kpis={ROTULOS_FINANCEIRO} colunas={6} blocos={['Ciclo financeiro', 'Status de faturamento', 'Ticket médio — mensal', 'Recebimentos', 'Clientes']} />
)
