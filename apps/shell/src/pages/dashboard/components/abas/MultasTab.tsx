import { useMemo } from 'react'
import { Table, type TableColumn } from '@betinhos/ui'
import { useMedia } from '../../../operacional/useMedia'
import { BarraChart } from '../../charts/Charts'
import { calcularMultas, type LinhaMultaInfracao, type LinhaMultaMotorista, type MultasMes } from '../../domain/abas/multas'
import { int } from '../../domain/format'
import { AnaliseCard } from '../AnaliseCard'
import { AbaCarregando } from '../Carregando'
import { Participacao, pct } from '../Celulas'
import { SemDadoBloco, Vazio, naoRespondeu } from '../Estados'
import { KpiCard, KpiLinha } from '../KpiCard'
import { MEDIA_MOBILE, juntar } from '../Linhas'
import type { DadosAba, PropsAba } from './abas'
import { forte, resto } from './MoMaMuComum'
import './abas-motoristas-manutencoes-multas.css'

const ROTULO_KPIS = 'Indicadores de multas'
const KPIS = ['Multas', 'Pendentes', 'Resolvidas']
const BLOCOS = ['Multas por mês', 'Por motorista', 'Por infração']
const MOTIVO = naoRespondeu('A tabela de multas')
const multas = (n: number) => `${int(n)} ${n === 1 ? 'multa' : 'multas'}`

/** Aba Multas: KPIs (total, pendentes, resolvidas); Por mês | Por motorista; Por infração na largura total. */
export function MultasTab({ ctx, dados, periodo }: PropsAba) {
  if (!ctx || !dados) return <AbaCarregando rotulo={ROTULO_KPIS} kpis={KPIS} colunas={3} blocos={BLOCOS} />
  return <MultasAba ctx={ctx} dados={dados} periodo={periodo} />
}

function MultasAba({ ctx, dados, periodo }: DadosAba) {
  const mu = useMemo(() => calcularMultas(ctx, dados), [ctx, dados])
  const k = mu.kpis
  const parte = (n: number) => (k && k.total ? [{ rotulo: 'Do total', texto: pct((n / k.total) * 100) }] : [])
  return <>
    <KpiLinha rotulo={ROTULO_KPIS} colunas={3}>
      <KpiCard rotulo={KPIS[0]} tom="brand" valor={k ? int(k.total) : null} />
      <KpiCard rotulo={KPIS[1]} tom="warning" valor={k ? int(k.pendentes) : null} apoio={k ? [{ rotulo: 'Status', texto: 'Notificar o condutor', atencao: k.pendentes > 0 }, ...parte(k.pendentes)] : []} />
      <KpiCard rotulo={KPIS[2]} tom="success" valor={k ? int(k.resolvidas) : null} apoio={k ? [{ rotulo: 'Status', texto: 'Pago, Descontado ou Finalizado' }, ...parte(k.resolvidas)] : []} />
    </KpiLinha>
    {k == null ? (
      <div className="dash-grade">
        <SemDadoBloco titulo={BLOCOS[0]} periodo={periodo} unidade="multas por mês" motivo={MOTIVO} />
        <SemDadoBloco titulo={BLOCOS[1]} periodo={periodo} unidade="multas" motivo={MOTIVO} />
        <SemDadoBloco largo titulo={BLOCOS[2]} periodo={periodo} unidade="multas" motivo={MOTIVO} />
      </div>
    ) : (
      <div className="dash-grade">
        <PorMesCard pontos={mu.porMes} total={k.total} periodo={periodo} />
        <PorMotoristaCard linhas={mu.porMotorista} periodo={periodo} />
        <PorInfracaoCard linhas={mu.porInfracao} periodo={periodo} />
      </div>
    )}
  </>
}

/** Multas por mês (barras) e, sob demanda, total e pendentes de cada mês. */
function PorMesCard({ pontos, total, periodo }: { pontos: MultasMes[]; total: number; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<MultasMes>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Multas', (p) => juntar(multas(p.qtd), `${int(p.pendentes)} pendentes`))]
    : [
      { key: 'm', header: 'Mês', cell: (p) => forte(p.rotulo) },
      { key: 'q', header: 'Multas', align: 'end', cell: (p) => int(p.qtd) },
      { key: 'p', header: 'Pendentes', align: 'end', cell: (p) => int(p.pendentes) },
    ]
  return (
    <AnaliseCard
      titulo="Multas por mês" periodo={periodo} unidade="multas por mês" valor={multas(total)} sub="Pela data da multa"
      grafico={pontos.length ? <BarraChart descricao={`Multas por mês, ${periodo}`} nome="Multas" formatar={int} larguraEixo={36} dados={pontos.map((p) => ({ rotulo: p.rotulo, valor: p.qtd }))} /> : undefined}
      tabela={pontos.length ? <Table columns={colunas} rows={pontos} rowKey={(p) => p.mes} /> : <Vazio titulo="Nenhuma multa no período" />}
      tabelaSobDemanda={pontos.length > 0}
    />
  )
}

function PorMotoristaCard({ linhas, periodo }: { linhas: LinhaMultaMotorista[]; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<LinhaMultaMotorista>[] = mobile
    ? [{ key: 'n', header: 'Motorista', cell: (l) => l.motorista }, resto('Multas', (l) => juntar(multas(l.qtd), `Participação ${pct(l.pct)}`))]
    : [
      { key: 'n', header: 'Motorista', width: 'minmax(0, 1.3fr)', cell: (l) => forte(l.motorista) },
      { key: 'q', header: 'Multas', align: 'end', width: 'minmax(56px, .5fr)', cell: (l) => int(l.qtd) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: 'minmax(0, 1.4fr)', cell: (l) => <span className="dash-col-part"><Participacao valor={l.pct} rotulo={`Participação de ${l.motorista}`} tom="warning" /></span> },
    ]
  const [maior] = linhas
  return (
    <AnaliseCard
      titulo="Por motorista" periodo={periodo} unidade="multas"
      valor={maior ? maior.motorista : undefined} sub={maior ? `Mais multas · ${multas(maior.qtd)} · ${pct(maior.pct)} do total` : undefined}
      tabela={<Table columns={colunas} rows={linhas} rowKey={(l) => l.motorista} empty={<Vazio titulo="Nenhuma multa no período" />} />}
    />
  )
}

function PorInfracaoCard({ linhas, periodo }: { linhas: LinhaMultaInfracao[]; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<LinhaMultaInfracao>[] = mobile
    ? [{ key: 'i', header: 'Infração', cell: (l) => l.infracao }, resto('Multas', (l) => juntar(multas(l.qtd), `Participação ${pct(l.pct)}`))]
    : [
      { key: 'i', header: 'Infração (código e descrição)', width: 'minmax(0, 2.4fr)', cell: (l) => <span className="dash-mu-infracao">{l.infracao}</span> },
      { key: 'q', header: 'Multas', align: 'end', width: 'minmax(64px, .4fr)', cell: (l) => int(l.qtd) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: 'minmax(0, 1fr)', cell: (l) => <span className="dash-col-part"><Participacao valor={l.pct} rotulo={`Participação de ${l.infracao}`} tom="warning" /></span> },
    ]
  const [maior] = linhas
  return (
    <AnaliseCard
      largo titulo="Por infração" periodo={periodo} unidade="multas"
      valor={maior ? multas(maior.qtd) : undefined} sub={maior ? `Infração mais frequente: ${maior.infracao}` : undefined}
      tabela={<Table columns={colunas} rows={linhas} rowKey={(l) => l.infracao} empty={<Vazio titulo="Nenhuma multa no período" />} />}
    />
  )
}
