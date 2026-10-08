import { useId, useMemo, useState } from 'react'
import { Button, SegmentedControl, StatusBadge, Table, type TableColumn } from '@betinhos/ui'
import { useMedia } from '../../../operacional/useMedia'
import { LinhaChart } from '../../charts/Charts'
import { calcularMotoristas, type CnhVencendo, type LinhaRankingMotorista, type LinhaScoreMotorista, type Motoristas } from '../../domain/abas/motoristas'
import { brl, brlS, dec, int } from '../../domain/format'
import type { NotaMes, RankingMes } from '../../domain/score'
import { AnaliseCard } from '../AnaliseCard'
import { Duplo, Nome, Participacao, Rolagem, col, larguraMinima, pct } from '../Celulas'
import { Expansivel, Linhas, MEDIA_MOBILE, VER_MESES, VER_RANKING, juntar, useLinhasAbertas } from '../Linhas'
import { KpisAba, KpisCarregando, dataBR, forte, resto, semDadoBloco, useContexto, vazio, type KpiAba, type PropsAba } from './MoMaMuComum'
import './abas-motoristas-manutencoes-multas.css'

const ROTULO_KPIS = 'Indicadores de motoristas'
const KPIS = ['Motoristas ativos', 'CNH em atenção', 'Score médio']
type Frota = 'todos' | 'proprios' | 'terceiros'
const FROTAS: { value: Frota; label: string }[] = [{ value: 'todos', label: 'Todos' }, { value: 'proprios', label: 'Próprios' }, { value: 'terceiros', label: 'Terceiros' }]
const frotaDe = (propria: boolean | null) => (propria === true ? 'Frota própria' : propria === false ? 'Terceirizado' : null)
const dias = (n: number) => `${int(n)} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`
const nota = (v: number | null) => (v == null ? '—' : int(Math.round(v)))
const taxa = (v: number | null) => (v == null ? '—' : dec(v, 1))

/**
 * Aba Motoristas: KPIs (ativos, CNH em atenção, score médio); Ranking na largura total com o filtro Todos | Próprios | Terceiros
 * e os meses de cada motorista sob demanda; CNH vencendo | Nota de condução por mês; Score por motorista e mês | Ranking mensal.
 */
export function MotoristasTab({ dados, filtros, now, periodo }: PropsAba) {
  const ctx = useContexto(dados, filtros, now)
  const mo = useMemo(() => (ctx && dados ? calcularMotoristas(ctx, dados) : null), [ctx, dados])
  if (!mo) return <KpisCarregando rotulos={KPIS} classe="dash-mo-kpis" rotulo={ROTULO_KPIS} />
  const semInfleet = mo.kpis.score == null
  const kpis: KpiAba[] = [
    { id: 'total', rotulo: KPIS[0], tom: 'brand', valor: mo.kpis.total == null ? null : int(mo.kpis.total) },
    {
      id: 'cnh', rotulo: KPIS[1], tom: 'warning', valor: mo.kpis.cnhAtencao == null ? null : int(mo.kpis.cnhAtencao),
      apoio: mo.kpis.cnhAtencao ? [{ rotulo: 'Validade', texto: 'vencida ou em até 90 dias', atencao: true }] : [],
    },
    {
      id: 'score', rotulo: KPIS[2], tom: 'success', valor: mo.kpis.score == null ? null : nota(mo.kpis.score.media),
      apoio: mo.kpis.score ? [{ rotulo: 'Notas válidas', texto: int(mo.kpis.score.validas) }] : [],
    },
  ]
  return <>
    <KpisAba itens={kpis} classe="dash-mo-kpis" rotulo={ROTULO_KPIS} />
    <div className="dash-grade">
      <RankingCard mo={mo} periodo={periodo} />
      <CnhCard itens={mo.cnhVencendo} indisponivel={mo.kpis.cnhAtencao == null} periodo={periodo} />
      <NotaMesCard pontos={mo.notaPorMes} mo={mo} indisponivel={semInfleet} periodo={periodo} />
      <ScoreMesCard linhas={mo.scorePorMotoristaMes} indisponivel={semInfleet} periodo={periodo} />
      <RankingMensalCard meses={mo.rankingMensal} indisponivel={semInfleet} periodo={periodo} />
    </div>
  </>
}

/** Ranking de motoristas: serviços, faturamento, ticket, participação e CNH; filtro próprio/terceiro e "Ver meses" por linha. */
function RankingCard({ mo, periodo }: { mo: Motoristas; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const uid = useId()
  const [frota, setFrota] = useState<Frota>('todos')
  const filtro = mo.veiculosIndisponiveis ? 'todos' : frota
  const linhas = filtro === 'todos' ? mo.ranking : mo.ranking.filter((l) => l.propria === (filtro === 'proprios'))
  const abertas = useLinhasAbertas(linhas.map((l) => l.key))
  const indice = new Map(linhas.map((l, i) => [l.key, i]))
  const idMeses = (l: LinhaRankingMotorista) => `${uid}-meses-${indice.get(l.key)}`
  const mesesTexto = (l: LinhaRankingMotorista) => l.meses.map((m) => `${m.rotulo}: ${int(m.qtd)} · ${pct(m.pct)} do mês`)
  const porMes = (l: LinhaRankingMotorista) => dec(l.servicos / mo.mesesBase, 1)

  const colunas: TableColumn<LinhaRankingMotorista>[] = mobile
    ? [
      { key: 'n', header: 'Motorista', cell: (l) => l.nome },
      resto('Ranking', (l) => (
        <Expansivel
          resumo={juntar(`${int(l.servicos)} serviços (${porMes(l)}/mês)`, `Faturamento ${brlS(l.faturamento)}`, `Ticket ${brl(l.ticket)}`, `Participação ${pct(l.pct)}`, `CNH ${dataBR(l.cnhDia)}`)}
          itens={mesesTexto(l)} rotulos={VER_MESES} aberta={abertas.aberta(l.key)} onAlternar={() => abertas.alternar(l.key)}
        />
      )),
    ]
    : [
      { key: 'n', header: 'Motorista', width: 'minmax(180px, 1.6fr)', cell: (l) => <Nome texto={l.nome} meta={[l.funcao, frotaDe(l.propria)].filter((t) => t && t !== '—').join(' · ') || undefined} /> },
      { key: 's', header: 'Serviços', align: 'end', width: 'minmax(84px, .8fr)', cell: (l) => <Duplo valor={int(l.servicos)} apoio={`${porMes(l)}/mês`} /> },
      { key: 'f', header: 'Faturamento', align: 'end', cell: (l) => forte(brl(l.faturamento)) },
      { key: 't', header: 'Ticket', align: 'end', hideBelow: 'compact', cell: (l) => brl(l.ticket) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: 'minmax(140px, 1.3fr)', cell: (l) => <span className="dash-col-part"><Participacao valor={l.pct} rotulo={`Participação de ${l.nome}`} /></span> },
      { key: 'c', header: 'CNH', width: 'minmax(92px, .7fr)', cell: (l) => dataBR(l.cnhDia) },
      {
        key: 'm', header: <span className="dash-sr">Meses</span>, width: 'minmax(124px, auto)', align: 'end', cell: (l) => (l.meses.length ? (
          <Button variant="ghost" size="compact" aria-expanded={abertas.aberta(l.key)} aria-controls={abertas.aberta(l.key) ? idMeses(l) : undefined} aria-label={`${abertas.aberta(l.key) ? VER_MESES[1] : VER_MESES[0]} de ${l.nome}`} onClick={() => abertas.alternar(l.key)}>
            {abertas.aberta(l.key) ? VER_MESES[1] : VER_MESES[0]}
          </Button>
        ) : null),
      },
      // Detalhe da linha aberta: a célula ocupa a linha inteira abaixo (CSS); fechada, fica vazia e some.
      {
        key: 'd', header: '', width: '0px', cell: (l) => (abertas.aberta(l.key) && l.meses.length ? (
          <ul id={idMeses(l)} className="dash-mo-meses" aria-label={`Serviços de ${l.nome} por mês`}>
            {l.meses.map((m) => (
              <li key={m.mes} className="dash-mo-meses__item">
                <span className="dash-mo-meses__mes">{m.rotulo}</span>
                <strong className="dash-mo-meses__qtd">{int(m.qtd)}</strong>
                <span className="dash-mo-meses__pct">{pct(m.pct)} do mês</span>
              </li>
            ))}
          </ul>
        ) : null),
      },
    ]
  const vazioRanking = mo.kpis.total == null ? semDadoBloco('O cadastro de funcionários') : vazio(filtro === 'todos' ? 'Nenhum motorista ativo' : 'Nenhum motorista neste filtro')
  const tabela = <Table className="dash-mo-ranking" columns={colunas} rows={linhas} rowKey={(l) => l.key} empty={vazioRanking} />
  const filtroFrota = (
    <div className="dash-mo-filtro">
      <SegmentedControl
        size="compact" aria-label="Frota do motorista" value={filtro} onChange={setFrota}
        options={FROTAS.map((o) => ({ ...o, disabled: mo.veiculosIndisponiveis && o.value !== 'todos' }))}
      />
      {mo.veiculosIndisponiveis ? <p className="dash-mo-filtro__nota">Os veículos não carregaram: o filtro próprio/terceiro não se aplica.</p> : null}
    </div>
  )
  return (
    <AnaliseCard
      largo titulo="Ranking de motoristas" periodo={periodo} unidade="serviços e R$"
      valor={`${int(linhas.length)} ${linhas.length === 1 ? 'motorista' : 'motoristas'}`}
      sub={`Ordenado por serviços · média por mês sobre ${int(mo.mesesBase)} ${mo.mesesBase === 1 ? 'mês' : 'meses'} com serviço`}
      extra={filtroFrota}
      tabela={mobile || linhas.length <= 10 ? tabela : <Rolagem rotulo="Ranking de motoristas" alturaMax={620}>{tabela}</Rolagem>}
    />
  )
}

/** CNH vencida ou vencendo em até 90 dias, da mais antiga para a mais nova; prazo sempre em texto. */
function CnhCard({ itens, indisponivel, periodo }: { itens: CnhVencendo[]; indisponivel: boolean; periodo: string }) {
  const selo = (c: CnhVencendo) => (c.dias < 0
    ? <StatusBadge tone="danger" dot>{`Vencida há ${dias(-c.dias)}`}</StatusBadge>
    : <StatusBadge tone="warning" dot>{c.dias === 0 ? 'Vence hoje' : `Vence em ${dias(c.dias)}`}</StatusBadge>)
  return (
    <AnaliseCard
      titulo="CNH vencendo" periodo={periodo} unidade="validade da CNH" natural
      valor={indisponivel ? '—' : int(itens.length)} sub={indisponivel ? undefined : 'Vencidas ou com validade em até 90 dias'}
      tabela={indisponivel ? semDadoBloco('O cadastro de funcionários') : itens.length ? (
        <ul className="dash-lista" aria-label="CNH vencendo">
          {itens.map((c) => (
            <li key={`${c.nome}-${c.cnhDia}`} className="dash-lista__item">
              <span className="dash-lista__texto">
                <span className="dash-lista__rotulo">{c.nome}</span>
                <span className="dash-lista__apoio">Validade {dataBR(c.cnhDia)}</span>
              </span>
              {selo(c)}
            </li>
          ))}
        </ul>
      ) : vazio('Nenhuma CNH em atenção')}
    />
  )
}

/** Nota média de condução por mês (Infleet), em linha, com os valores sob demanda. */
function NotaMesCard({ pontos, mo, indisponivel, periodo }: { pontos: NotaMes[]; mo: Motoristas; indisponivel: boolean; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<NotaMes>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Nota', (p) => juntar(`Nota ${nota(p.nota)}`, `${int(p.validas)} notas válidas`))]
    : [
      { key: 'm', header: 'Mês', cell: (p) => forte(p.rotulo) },
      { key: 'n', header: 'Nota média', align: 'end', cell: (p) => nota(p.nota) },
      { key: 'v', header: 'Notas válidas', align: 'end', cell: (p) => int(p.validas) },
    ]
  const score = mo.kpis.score
  return (
    <AnaliseCard
      titulo="Nota de condução por mês" periodo={periodo} unidade="nota de 0 a 100"
      valor={indisponivel || !score ? '—' : nota(score.media)} sub={indisponivel || !score ? undefined : `Média do período · ${int(score.validas)} notas válidas`}
      grafico={!indisponivel && pontos.length ? (
        <LinhaChart descricao={`Nota média de condução por mês, ${periodo}`} formatar={(v) => int(Math.round(v))} larguraEixo={36}
          dados={pontos.map((p) => ({ rotulo: p.rotulo, nota: Math.round(p.nota * 10) / 10 }))} series={[{ chave: 'nota', nome: 'Nota média', cor: 'action' }]} />
      ) : undefined}
      tabela={indisponivel ? semDadoBloco('O Infleet') : pontos.length ? <Table columns={colunas} rows={pontos} rowKey={(p) => p.mes} /> : vazio('Sem notas válidas no período')}
      tabelaSobDemanda={!indisponivel && pontos.length > 0}
    />
  )
}

/** Score por motorista e mês: nota, km e as taxas que a compõem; mês mais recente primeiro. */
function ScoreMesCard({ linhas, indisponivel, periodo }: { linhas: LinhaScoreMotorista[]; indisponivel: boolean; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const notaCelula = (l: LinhaScoreMotorista) => (l.suficiente ? nota(l.nota) : '—')
  const trilhas = [col(120, 1.6), col(52), col(60), col(52), col(52), col(60)]
  const colunas: TableColumn<LinhaScoreMotorista>[] = mobile
    ? [
      { key: 'n', header: 'Motorista', cell: (l) => l.nome },
      resto('Score', (l) => juntar(l.rotulo, l.suficiente ? `Nota ${notaCelula(l)}` : 'Menos de 100 km', `${int(Math.round(l.distancia))} km`, `Acel. ${taxa(l.taxaAceleracao)}`, `Fren. ${taxa(l.taxaFrenagem)}`, `Ocioso ${taxa(l.taxaOcioso)}`)),
    ]
    : [
      { key: 'n', header: 'Motorista', width: trilhas[0].width, cell: (l) => <Nome texto={l.nome} meta={l.rotulo} /> },
      { key: 'nota', header: 'Nota', align: 'end', width: trilhas[1].width, cell: (l) => <Duplo valor={notaCelula(l)} apoio={l.suficiente ? undefined : '< 100 km'} /> },
      { key: 'km', header: 'Km', align: 'end', width: trilhas[2].width, cell: (l) => int(Math.round(l.distancia)) },
      { key: 'a', header: 'Acel.', align: 'end', width: trilhas[3].width, cell: (l) => taxa(l.taxaAceleracao) },
      { key: 'f', header: 'Fren.', align: 'end', width: trilhas[4].width, cell: (l) => taxa(l.taxaFrenagem) },
      { key: 'o', header: 'Ocioso', align: 'end', width: trilhas[5].width, cell: (l) => taxa(l.taxaOcioso) },
    ]
  const tabela = <Table columns={colunas} rows={linhas} rowKey={(l) => `${l.motoristaId}-${l.mes}`} empty={vazio('Sem viagens do Infleet no período')} style={mobile ? undefined : { minWidth: larguraMinima(trilhas, 12) }} />
  return (
    <AnaliseCard
      titulo="Score por motorista e mês" periodo={periodo} unidade="nota de 0 a 100 · eventos e minutos ociosos por 100 km"
      sub={indisponivel ? undefined : 'Nota só com 100 km ou mais no mês'}
      tabela={indisponivel ? semDadoBloco('O Infleet') : mobile ? tabela : <Rolagem rotulo="Score por motorista e mês" alturaMax={440}>{tabela}</Rolagem>}
    />
  )
}

/** Cinco maiores notas válidas de cada mês, mês mais recente primeiro; no celular, o 1º fica visível e os demais abrem sob demanda. */
function RankingMensalCard({ meses, indisponivel, periodo }: { meses: RankingMes[]; indisponivel: boolean; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const linhas = [...meses].reverse()
  const abertas = useLinhasAbertas(linhas.map((m) => m.mes))
  const posicao = (m: RankingMes) => m.ranking.map((p, i) => `${i + 1}º ${p.nome} · nota ${int(p.nota)} · ${int(Math.round(p.distancia))} km`)
  const colunas: TableColumn<RankingMes>[] = mobile
    ? [
      { key: 'm', header: 'Mês', cell: (m) => m.rotulo },
      resto('Ranking', (m) => {
        const [primeiro, ...demais] = posicao(m)
        return <Expansivel resumo={primeiro ?? '—'} itens={demais} rotulos={VER_RANKING} aberta={abertas.aberta(m.mes)} onAlternar={() => abertas.alternar(m.mes)} />
      }),
    ]
    : [
      { key: 'm', header: 'Mês', width: 'minmax(72px, .5fr)', cell: (m) => forte(m.rotulo) },
      { key: 'r', header: 'Top 5', width: 'minmax(0, 2fr)', cell: (m) => <Linhas itens={posicao(m)} /> },
    ]
  const [ultimo] = linhas
  const tabela = <Table columns={colunas} rows={linhas} rowKey={(m) => m.mes} empty={vazio('Sem notas válidas no período')} />
  return (
    <AnaliseCard
      titulo="Ranking mensal" periodo={periodo} unidade="nota de 0 a 100"
      valor={!indisponivel && ultimo?.ranking[0] ? ultimo.ranking[0].nome : undefined}
      sub={!indisponivel && ultimo?.ranking[0] ? `1º em ${ultimo.rotulo} · nota ${int(ultimo.ranking[0].nota)}` : undefined}
      tabela={indisponivel ? semDadoBloco('O Infleet') : mobile || linhas.length <= 3 ? tabela : <Rolagem rotulo="Ranking mensal" alturaMax={440}>{tabela}</Rolagem>}
    />
  )
}
