import { useMemo } from 'react'
import { StatusBadge, Table, type StatusTone, type TableColumn } from '@betinhos/ui'
import { useMedia } from '../../../operacional/useMedia'
import { BarraChart } from '../../charts/Charts'
import { calcularManutencoes, type LinhaCategoria, type LinhaTipoReparo, type Manutencoes, type StatusMeta } from '../../domain/abas/manutencoes'
import { brl, brlS, dec, int } from '../../domain/format'
import type { Apoio } from '../../domain/types'
import { AnaliseCard } from '../AnaliseCard'
import { AbaCarregando } from '../Carregando'
import { Duplo, Participacao, pct } from '../Celulas'
import { SemDadoBloco, Vazio, naoRespondeu } from '../Estados'
import { KpiCard, KpiLinha } from '../KpiCard'
import { MEDIA_MOBILE, juntar } from '../Linhas'
import type { DadosAba, PropsAba } from './abas'
import { forte, resto } from './MoMaMuComum'
import './abas-motoristas-manutencoes-multas.css'

const ROTULO_KPIS = 'Indicadores de manutenções'
const KPIS = ['Manutenções', 'Custo total', 'Em andamento', 'Custo médio', 'Prazo médio']
const BLOCOS = ['Custo por mês', 'Por tipo de reparo', 'Categorias com metas']
const MOTIVO = naoRespondeu('A tabela de manutenções')
type PontoCusto = Manutencoes['custoPorMes'][number]

/** Selo da meta sempre com texto: Dentro da meta, Fora da meta, Sem meta ou s/dado. */
const SELO: Record<StatusMeta, { tom: StatusTone; texto: string }> = {
  dentro: { tom: 'success', texto: 'Dentro da meta' },
  fora: { tom: 'danger', texto: 'Fora da meta' },
  'sem-meta': { tom: 'neutral', texto: 'Sem meta' },
  'sem-dado': { tom: 'neutral', texto: 's/dado' },
}
const Selo = ({ status }: { status: StatusMeta }) => <StatusBadge tone={SELO[status].tom} dot>{SELO[status].texto}</StatusBadge>
const diasTexto = (v: number | null) => (v == null ? 's/dado' : `${dec(v, 1)} ${v === 1 ? 'dia' : 'dias'}`)
/** Contagem do mesmo período anterior: 0 vira s/dado, como os chips do legado. */
const anterior = (v: number | null) => (v == null ? '—' : v === 0 ? 's/dado' : int(v))

/**
 * Aba Manutenções: KPIs (total, custo total com % da receita, em andamento, custo médio e prazo médio com % em até 10 dias);
 * Custo por mês | Por tipo de reparo; Categorias com metas na largura total, cada meta com selo em texto.
 */
export function ManutencoesTab({ ctx, dados, periodo }: PropsAba) {
  if (!ctx || !dados) return <AbaCarregando rotulo={ROTULO_KPIS} kpis={KPIS} colunas={5} blocos={BLOCOS} />
  return <ManutencoesAba ctx={ctx} dados={dados} periodo={periodo} />
}

function ManutencoesAba({ ctx, dados, periodo }: DadosAba) {
  const ma = useMemo(() => calcularManutencoes(ctx, dados), [ctx, dados])
  const k = ma.kpis
  const prazo = ma.prazo
  const apoioPrazo: Apoio[] = prazo?.ate10 != null ? [{ rotulo: 'Até 10 dias', texto: pct(prazo.ate10) }] : []
  if (prazo && ma.mostrarLM) apoioPrazo.push({ rotulo: 'Mês anterior', texto: diasTexto(prazo.lm) })
  if (prazo) apoioPrazo.push({ rotulo: 'Ano anterior', texto: diasTexto(prazo.ly) })
  return <>
    <KpiLinha rotulo={ROTULO_KPIS} colunas={5}>
      <KpiCard rotulo={KPIS[0]} tom="brand" valor={k ? int(k.total) : null} />
      <KpiCard rotulo={KPIS[1]} tom="action" valor={k ? brl(k.custoTotal) : null} apoio={k ? [{ rotulo: '% da receita', texto: pct(k.pctReceita) }] : []} />
      <KpiCard rotulo={KPIS[2]} tom="warning" valor={k ? int(k.emAndamento) : null} apoio={k ? 'solicitadas, aprovadas ou programadas' : undefined} />
      <KpiCard rotulo={KPIS[3]} tom="action" valor={k ? brl(k.custoMedio) : null} />
      <KpiCard rotulo={KPIS[4]} tom="success" valor={prazo ? (prazo.medio == null ? '—' : diasTexto(prazo.medio)) : null} apoio={apoioPrazo} />
    </KpiLinha>
    {k == null ? (
      <div className="dash-grade">
        <SemDadoBloco titulo={BLOCOS[0]} periodo={periodo} unidade="R$ por mês" motivo={MOTIVO} />
        <SemDadoBloco titulo={BLOCOS[1]} periodo={periodo} unidade="registros e R$" motivo={MOTIVO} />
        <SemDadoBloco largo titulo={BLOCOS[2]} periodo={periodo} unidade="registros por categoria" motivo={MOTIVO} />
      </div>
    ) : (
      <div className="dash-grade">
        <CustoMesCard pontos={ma.custoPorMes} total={k.custoTotal} periodo={periodo} />
        <TipoReparoCard linhas={ma.porTipoReparo} periodo={periodo} />
        <CategoriasCard linhas={ma.categorias} mostrarLM={ma.mostrarLM} periodo={periodo} />
      </div>
    )}
  </>
}

/** Custo por mês (barras) e os valores sob demanda. */
function CustoMesCard({ pontos, total, periodo }: { pontos: PontoCusto[]; total: number; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<PontoCusto>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Custo', (p) => `Custo ${brl(p.valor)}`)]
    : [{ key: 'm', header: 'Mês', cell: (p) => forte(p.rotulo) }, { key: 'v', header: 'Custo', align: 'end', cell: (p) => brl(p.valor) }]
  return (
    <AnaliseCard
      titulo="Custo por mês" periodo={periodo} unidade="R$ por mês" valor={brl(total)} sub="Custo das manutenções pela data da manutenção"
      grafico={pontos.length ? <BarraChart descricao={`Custo de manutenção por mês, ${periodo}`} nome="Custo" formatar={brlS} dados={pontos} /> : undefined}
      tabela={pontos.length ? <Table columns={colunas} rows={pontos} rowKey={(p) => p.mes} /> : <Vazio titulo="Nenhuma manutenção no período" />}
      tabelaSobDemanda={pontos.length > 0}
    />
  )
}

/** Por tipo de reparo: quantidade (e % dos registros), valor e participação no custo. */
function TipoReparoCard({ linhas, periodo }: { linhas: LinhaTipoReparo[]; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<LinhaTipoReparo>[] = mobile
    ? [{ key: 't', header: 'Tipo de reparo', cell: (l) => l.tipo }, resto('Custo', (l) => juntar(`${int(l.qtd)} registros`, `Custo ${brl(l.valor)}`, `Participação ${pct(l.pct)}`))]
    : [
      { key: 't', header: 'Tipo de reparo', width: 'minmax(0, 1.4fr)', cell: (l) => forte(l.tipo) },
      { key: 'q', header: 'Qtd', align: 'end', width: 'minmax(56px, .5fr)', cell: (l) => <Duplo valor={int(l.qtd)} apoio={pct(l.pctQtd)} /> },
      { key: 'v', header: 'Custo', align: 'end', cell: (l) => brl(l.valor) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: 'minmax(0, 1.2fr)', cell: (l) => <span className="dash-col-part"><Participacao valor={l.pct} rotulo={`Participação de ${l.tipo} no custo`} /></span> },
    ]
  const [maior] = linhas
  return (
    <AnaliseCard
      titulo="Por tipo de reparo" periodo={periodo} unidade="registros e R$"
      valor={maior ? maior.tipo : undefined} sub={maior ? `Mais frequente · ${int(maior.qtd)} registros · ${pct(maior.pct)} do custo` : undefined}
      tabela={<Table columns={colunas} rows={linhas} rowKey={(l) => l.tipo} empty={<Vazio titulo="Nenhuma manutenção no período" />} />}
    />
  )
}

/** Categorias (por palavra-chave do tipo de reparo) com a meta de cada uma e o selo Dentro/Fora da meta em texto. */
function CategoriasCard({ linhas, mostrarLM, periodo }: { linhas: LinhaCategoria[]; mostrarLM: boolean; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const comparativo = (l: LinhaCategoria) => [mostrarLM ? `Mês anterior ${anterior(l.lm)}` : '', `Ano anterior ${anterior(l.ly)}`].filter(Boolean)
  const colunas: TableColumn<LinhaCategoria>[] = mobile
    ? [
      { key: 'c', header: 'Categoria', cell: (l) => l.categoria },
      resto('Meta', (l) => (
        <span className="dash-ma-meta">
          <span>{juntar(`${int(l.qtd)} registros`, l.meta ? `Meta: ${l.meta}` : 'Sem meta', ...comparativo(l))}</span>
          <Selo status={l.status} />
        </span>
      )),
    ]
    : [
      { key: 'c', header: 'Categoria', width: 'minmax(160px, 1.3fr)', cell: (l) => forte(l.categoria) },
      { key: 'q', header: 'Registros', align: 'end', width: 'minmax(72px, .6fr)', cell: (l) => int(l.qtd) },
      ...(mostrarLM ? [{ key: 'lm', header: 'Mês anterior', align: 'end' as const, width: 'minmax(92px, .7fr)', cell: (l: LinhaCategoria) => anterior(l.lm) }] : []),
      { key: 'ly', header: 'Ano anterior', align: 'end', width: 'minmax(92px, .7fr)', cell: (l) => anterior(l.ly) },
      { key: 'm', header: <span className="dash-col-part">Meta</span>, width: 'minmax(180px, 1.6fr)', cell: (l) => <span className="dash-col-part">{l.meta ?? '—'}</span> },
      { key: 's', header: 'Status', width: 'minmax(132px, .9fr)', cell: (l) => <Selo status={l.status} /> },
    ]
  const fora = linhas.filter((l) => l.status === 'fora').length
  return (
    <AnaliseCard
      largo titulo="Categorias com metas" periodo={periodo} unidade="registros por categoria"
      valor={fora ? `${int(fora)} fora da meta` : 'Nenhuma fora da meta'}
      sub={'Corretiva crítica: zero · Corretiva não crítica: até 5 por mês · Preventiva programada: da aprovação à data em até 10 dias'}
      tabela={<Table columns={colunas} rows={linhas} rowKey={(l) => l.categoria} />}
    />
  )
}
