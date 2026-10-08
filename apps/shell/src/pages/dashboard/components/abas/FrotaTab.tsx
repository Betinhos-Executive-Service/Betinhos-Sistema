import { useMemo } from 'react'
import { Table, type TableColumn } from '@betinhos/ui'
import { LinhaChart } from '../../charts/Charts'
import { CORTE_USO_FROTA, calcularFrota, type EventosMes, type Frota, type TelemetriaFrota, type UsoMes } from '../../domain/abas/frota'
import { filtrarServicos } from '../../domain/base'
import { dec, int } from '../../domain/format'
import type { Dados, Filtros, PontoSerie } from '../../domain/types'
import { useMedia } from '../../../operacional/useMedia'
import { AnaliseCard } from '../AnaliseCard'
import { Duplo, Rolagem, col, larguraMinima, pct } from '../Celulas'
import { COLUNA_LARGA, Linhas, MEDIA_MOBILE, juntar } from '../Linhas'
import { BarrasChart, KpiCartao, KpisCarregando, SemDado, Vazio, type SerieBarra } from './DespesasFrotaComum'
import './abas-despesas-frota.css'

/** Número pt-BR com até `casas` decimais (o `toLocaleString` do legado). */
const num = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas })
const forte = (texto: string) => <strong className="dash-forte">{texto}</strong>
const dataBR = (dia: string) => dia.split('-').reverse().join('/')
const diaMes = (dia: string) => dataBR(dia).slice(0, 5)
const ROTULOS_KPI = ['Total de veículos', 'Disponíveis', 'Blindados', 'Em manutenção', 'Uso da frota própria']
const INFLEET_INDISPONIVEL = <Vazio titulo="Telemetria sem dados">O Infleet não respondeu. Tente atualizar o dashboard.</Vazio>

/** Eventos por categoria: cor e padrão distintos, para não depender só da cor. */
const SERIES_EVENTOS: SerieBarra[] = [
  { chave: 'excesso', nome: 'Excesso de velocidade', cor: 'brand', padrao: 'solido' },
  { chave: 'aceleracao', nome: 'Aceleração brusca', cor: 'action', padrao: 'solido' },
  { chave: 'frenagem', nome: 'Frenagem brusca', cor: 'action', padrao: 'listras' },
  { chave: 'curva', nome: 'Curva brusca', cor: 'secondary', padrao: 'pontos' },
]
const SERIES_USO: SerieBarra[] = [
  { chave: 'uteis', nome: 'Dias úteis', cor: 'action', padrao: 'solido' },
  { chave: 'fds', nome: 'Fim de semana', cor: 'brand', padrao: 'listras' },
]

type Props = { dados: Dados; filtros: Filtros; now: Date; periodo: string }

/**
 * Aba Frota: cinco KPIs (cadastro e uso médio da frota própria); Telemetria Infleet | Km por dia;
 * Uso da frota própria por mês | Eventos de condução por mês.
 */
export function FrotaTab({ dados, filtros, now, periodo }: Props) {
  const mobile = useMedia(MEDIA_MOBILE)
  const frota = useMemo(() => {
    const rv = filtrarServicos(dados.reservas, filtros)
    return calcularFrota({ todas: dados.reservas, rv, f: filtros, now }, dados)
  }, [dados, filtros, now])
  return <>
    <KpisFrota frota={frota} />
    <div className="dash-grade">
      <TelemetriaCard telemetria={frota.telemetria} periodo={periodo} />
      <KmPorDiaCard dias={frota.kmPorDia} indisponivel={frota.infleetIndisponivel} periodo={periodo} mobile={mobile} />
      <UsoCard frota={frota} filtros={filtros} periodo={periodo} mobile={mobile} />
      <EventosCard meses={frota.eventosPorMes} indisponivel={frota.infleetIndisponivel} periodo={periodo} mobile={mobile} />
    </div>
  </>
}

export const FrotaCarregando = () => <KpisCarregando rotulos={ROTULOS_KPI} className="dash-fr-kpis" />

/** % médio de uso dos próprios no mês inteiro (úteis + fim de semana, pesados pelos dias). */
const usoDoMes = (m: UsoMes) => { const dias = m.uteis.dias + m.fds.dias; return dias ? (m.uteis.pct * m.uteis.dias + m.fds.pct * m.fds.dias) / dias : 0 }

function KpisFrota({ frota }: { frota: Frota }) {
  const k = frota.kpis
  const parte = (v: number) => (k.total ? <span className="dash-apoio">{pct((v / k.total) * 100)} da frota</span> : null)
  const valor = (v: number) => (k.indisponivel ? '—' : int(v))
  const serieUso: PontoSerie[] = frota.usoMensal.map((m) => ({ mes: m.mes, rotulo: m.rotulo, valor: usoDoMes(m) }))
  return (
    <section className="dash-fr-kpis" aria-label="Indicadores da frota">
      <KpiCartao rotulo="Total de veículos" valor={valor(k.total)} tom="brand">{k.indisponivel ? <SemDado /> : <span className="dash-apoio">frota cadastrada</span>}</KpiCartao>
      <KpiCartao rotulo="Disponíveis" valor={valor(k.disponiveis)} tom="success">{k.indisponivel ? <SemDado /> : parte(k.disponiveis)}</KpiCartao>
      <KpiCartao rotulo="Blindados" valor={valor(k.blindados)} tom="brand">{k.indisponivel ? <SemDado /> : parte(k.blindados)}</KpiCartao>
      <KpiCartao rotulo="Em manutenção" valor={valor(k.emManutencao)} tom="warning">{k.indisponivel ? <SemDado /> : parte(k.emManutencao)}</KpiCartao>
      <KpiCartao rotulo="Uso da frota própria" valor={k.usoMedioPropria == null ? '—' : pct(k.usoMedioPropria)} tom="action" serie={serieUso}>
        {k.indisponivel ? <SemDado /> : <span className="dash-apoio">{k.usoMedioPropria == null ? 'sem próprios ativos com dias no período' : `média diária desde ${dataBR(CORTE_USO_FROTA)}`}</span>}
      </KpiCartao>
    </section>
  )
}

/** As seis medidas da telemetria Infleet em lista; Infleet indisponível = s/dado em cada uma. */
function TelemetriaCard({ telemetria: t, periodo }: { telemetria: TelemetriaFrota | null; periodo: string }) {
  const itens: { rotulo: string; apoio: string; valor: (t: TelemetriaFrota) => string }[] = [
    { rotulo: 'Km rodados', apoio: 'soma da distância diária', valor: (t) => `${num(t.km)} km` },
    { rotulo: 'Velocidade média', apoio: 'ponderada pela distância', valor: (t) => `${num(t.velocidadeMedia)} km/h` },
    { rotulo: 'Velocidade máxima', apoio: 'maior registro do período', valor: (t) => `${num(t.velocidadeMaxima)} km/h` },
    { rotulo: 'Excessos de velocidade', apoio: 'ocorrências registradas', valor: (t) => int(t.excessos) },
    { rotulo: 'Consumo real', apoio: 'km das viagens ÷ litros', valor: (t) => (t.consumoKmL == null ? '—' : `${dec(t.consumoKmL, 2)} km/l`) },
    { rotulo: 'Motor ocioso', apoio: 'tempo parado com motor ligado', valor: (t) => `${num(t.ociosoMin, 0)} min` },
  ]
  return (
    <AnaliseCard
      titulo="Telemetria Infleet" periodo={periodo} unidade="veículos com serviço no período"
      valor={t ? `${num(t.km)} km` : 's/dado'} sub={t ? 'rodados pelos veículos do recorte' : 'O Infleet não respondeu.'}
      tabela={
        <ul className="dash-lista">
          {itens.map((i) => (
            <li key={i.rotulo} className="dash-lista__item">
              <span className="dash-lista__texto">
                <span className="dash-lista__rotulo">{i.rotulo}</span>
                <span className="dash-lista__apoio">{t && t.consumoKmL == null && i.rotulo === 'Consumo real' ? 'sem km/litros ou fora da faixa de 2 a 30 km/l' : i.apoio}</span>
              </span>
              {t ? <span className="dash-lista__valor dash-fr-medida">{i.valor(t)}</span> : <SemDado />}
            </li>
          ))}
        </ul>
      }
    />
  )
}

function KmPorDiaCard({ dias, indisponivel, periodo, mobile }: { dias: Frota['kmPorDia']; indisponivel: boolean; periodo: string; mobile: boolean }) {
  const total = dias.reduce((s, d) => s + d.km, 0)
  const colunas: TableColumn<Frota['kmPorDia'][number]>[] = [
    { key: 'd', header: 'Dia', cell: (d) => (mobile ? dataBR(d.dia) : forte(dataBR(d.dia))) },
    { key: 'k', header: 'Km', align: mobile ? undefined : 'end', width: mobile ? COLUNA_LARGA : undefined, cell: (d) => (mobile ? `Km ${num(d.km)}` : num(d.km)) },
  ]
  return (
    <AnaliseCard
      titulo="Km por dia" periodo={periodo} unidade="km por dia"
      valor={indisponivel ? 's/dado' : dias.length ? `${num(total / dias.length)} km` : '—'}
      sub={indisponivel ? undefined : dias.length ? `média por dia · ${int(dias.length)} dias com telemetria` : undefined}
      grafico={indisponivel ? INFLEET_INDISPONIVEL : dias.length ? (
        <LinhaChart descricao={`Quilômetros rodados por dia, ${periodo}`} formatar={(v) => num(v, 0)} larguraEixo={48} dados={dias.map((d) => ({ rotulo: diaMes(d.dia), valor: d.km }))} series={[{ chave: 'valor', nome: 'Km', cor: 'action' }]} />
      ) : <Vazio titulo="Sem telemetria no período" />}
      tabela={!indisponivel && dias.length ? <Rolagem rotulo="Km por dia" alturaMax={320}><Table columns={colunas} rows={dias} rowKey={(d) => d.dia} /></Rolagem> : undefined}
      tabelaSobDemanda
    />
  )
}

const bucketTexto = (b: UsoMes['uteis']) => `${dec(b.ociosos, 1)} ociosos / ${dec(b.terceiros, 1)} terceiros / ${dec(b.aluguel, 1)} aluguel`

/** Uso da frota própria por mês: barras dias úteis × fim de semana e a tabela com ociosos, terceiros e aluguel (médias diárias). */
function UsoCard({ frota, filtros, periodo, mobile }: { frota: Frota; filtros: Filtros; periodo: string; mobile: boolean }) {
  const { usoMensal: meses, usoTotais: t, kpis } = frota
  const colunas: TableColumn<UsoMes>[] = mobile
    ? [
      { key: 'm', header: 'Mês', cell: (m) => m.rotulo },
      {
        key: 'resto', header: 'Uso', width: COLUNA_LARGA, cell: (m) => <Linhas itens={[
          `Úteis ${m.usoUteis == null ? '—' : pct(m.usoUteis)}${m.uteis.dias ? ` · ${bucketTexto(m.uteis)}` : ''}`,
          `Fim de semana ${m.usoFds == null ? '—' : pct(m.usoFds)}${m.fds.dias ? ` · ${bucketTexto(m.fds)}` : ''}`,
        ]} />,
      },
    ]
    : [
      { key: 'm', header: 'Mês', width: 'minmax(0, .6fr)', cell: (m) => forte(m.rotulo) },
      { key: 'u', header: 'Dias úteis', cell: (m) => <Duplo valor={m.usoUteis == null ? '—' : pct(m.usoUteis)} apoio={m.uteis.dias ? bucketTexto(m.uteis) : 'sem dias'} /> },
      { key: 'f', header: 'Fim de semana', cell: (m) => <Duplo valor={m.usoFds == null ? '—' : pct(m.usoFds)} apoio={m.fds.dias ? bucketTexto(m.fds) : 'sem dias'} /> },
    ]
  const antesDoCorte = filtros.fim < CORTE_USO_FROTA
  return (
    <AnaliseCard
      titulo="Uso da frota própria por mês" periodo={periodo} unidade="% médio diário dos próprios ativos"
      valor={kpis.indisponivel ? 's/dado' : kpis.usoMedioPropria == null ? '—' : pct(kpis.usoMedioPropria)}
      sub={kpis.indisponivel ? undefined : `${int(t.proprios)} próprios ativos · ${int(t.terceiros)} terceiros · ${int(t.aluguel)} aluguel · desde ${dataBR(CORTE_USO_FROTA)}`}
      grafico={kpis.indisponivel ? <Vazio titulo="Veículos sem dados">O cadastro de veículos não respondeu.</Vazio> : meses.length ? (
        <BarrasChart
          descricao={`Uso médio da frota própria por mês, dias úteis e fim de semana, ${periodo}`} formatar={(v) => `${num(v, 0)}%`} dominioMax={100} larguraEixo={44}
          dados={meses.map((m) => ({ rotulo: m.rotulo, uteis: m.usoUteis, fds: m.usoFds }))} series={SERIES_USO}
        />
      ) : <Vazio titulo={antesDoCorte ? `O uso da frota é medido a partir de ${dataBR(CORTE_USO_FROTA)}` : 'Sem dias no período'} />}
      tabela={!kpis.indisponivel && meses.length ? <Table className="dash-tabela--densa dash-fr-uso" columns={colunas} rows={meses} rowKey={(m) => m.mes} /> : undefined}
    />
  )
}

type Tendencia = { texto: string; atencao: boolean }
/** Direção da reta de tendência (primeiro × último mês), em texto. */
function tendenciaGeral(meses: EventosMes[]): Tendencia | null {
  if (meses.length < 2) return null
  const delta = meses[meses.length - 1].tendencia - meses[0].tendencia
  if (Math.abs(delta) < 0.01) return { texto: 'estável', atencao: false }
  return delta > 0 ? { texto: 'em alta', atencao: true } : { texto: 'em queda', atencao: false }
}

/** Eventos de condução por mês: barras empilhadas por categoria; taxa por 1.000 km e tendência no título e na tabela. */
function EventosCard({ meses, indisponivel, periodo, mobile }: { meses: EventosMes[]; indisponivel: boolean; periodo: string; mobile: boolean }) {
  const total = meses.reduce((s, m) => s + m.total, 0)
  const km = meses.reduce((s, m) => s + m.km, 0)
  const tend = tendenciaGeral(meses)
  const taxa = (v: number) => dec(v, 2)
  const colunasDesk = [
    { key: 'm', header: 'Mês', ...col(72, .8), cell: (m: EventosMes) => forte(m.rotulo) },
    ...SERIES_EVENTOS.map((s) => ({ key: s.chave, header: s.nome.split(' ')[0], align: 'end' as const, ...col(72), cell: (m: EventosMes) => int(m[s.chave as 'excesso']) })),
    { key: 't', header: 'Total', align: 'end' as const, ...col(56), cell: (m: EventosMes) => forte(int(m.total)) },
    { key: 'k', header: 'Km', align: 'end' as const, ...col(72), cell: (m: EventosMes) => num(m.km, 0) },
    { key: 'x', header: 'Por 1.000 km', align: 'end' as const, ...col(96), cell: (m: EventosMes) => <Duplo valor={taxa(m.taxa)} apoio={`tendência ${taxa(m.tendencia)}`} /> },
  ]
  const colunas: TableColumn<EventosMes>[] = mobile
    ? [
      { key: 'm', header: 'Mês', cell: (m) => m.rotulo },
      {
        key: 'resto', header: 'Eventos', width: COLUNA_LARGA, cell: (m) => <Linhas itens={[
          juntar(`Excesso ${int(m.excesso)}`, `Aceleração ${int(m.aceleracao)}`, `Frenagem ${int(m.frenagem)}`, `Curva ${int(m.curva)}`),
          `Total ${int(m.total)} em ${num(m.km, 0)} km`,
          `${taxa(m.taxa)} por 1.000 km · tendência ${taxa(m.tendencia)}`,
        ]} />,
      },
    ]
    : colunasDesk.map(({ min: _min, ...c }) => c)
  const tabela = <Table className="dash-tabela--densa" columns={colunas} rows={meses} rowKey={(m) => m.mes} style={mobile ? undefined : { minWidth: larguraMinima(colunasDesk, 8) }} />
  return (
    <AnaliseCard
      titulo="Eventos de condução por mês" periodo={periodo} unidade="eventos e eventos por 1.000 km"
      valor={indisponivel ? 's/dado' : km ? `${taxa((total / km) * 1000)} / 1.000 km` : '—'}
      sub={indisponivel ? undefined : `${int(total)} eventos classificados${km ? ` em ${num(km, 0)} km` : ''}`}
      apoio={tend ? [{ rotulo: 'Tendência', texto: tend.texto, atencao: tend.atencao }] : []}
      grafico={indisponivel ? INFLEET_INDISPONIVEL : meses.length ? (
        <BarrasChart
          descricao={`Eventos de condução por mês e por categoria, ${periodo}`} formatar={int} empilhado larguraEixo={40}
          dados={meses.map((m) => ({ rotulo: m.rotulo, excesso: m.excesso, aceleracao: m.aceleracao, frenagem: m.frenagem, curva: m.curva }))} series={SERIES_EVENTOS}
        />
      ) : <Vazio titulo="Nenhum evento de condução no período" />}
      tabela={!indisponivel && meses.length ? (mobile ? tabela : <Rolagem rotulo="Eventos de condução por mês">{tabela}</Rolagem>) : undefined}
      tabelaSobDemanda
    />
  )
}
