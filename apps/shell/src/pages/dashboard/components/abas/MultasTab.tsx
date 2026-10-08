import { useMemo } from 'react'
import { Table, type TableColumn } from '@betinhos/ui'
import { useMedia } from '../../../operacional/useMedia'
import { BarraChart } from '../../charts/Charts'
import { calcularMultas, type LinhaMultaInfracao, type LinhaMultaMotorista, type MultasMes } from '../../domain/abas/multas'
import { int } from '../../domain/format'
import { AnaliseCard } from '../AnaliseCard'
import { Participacao, pct } from '../Celulas'
import { MEDIA_MOBILE, juntar } from '../Linhas'
import { KpisAba, KpisCarregando, forte, resto, semDadoBloco, useContexto, vazio, type KpiAba, type PropsAba } from './MoMaMuComum'
import './abas-motoristas-manutencoes-multas.css'

const ROTULO_KPIS = 'Indicadores de multas'
const KPIS = ['Multas', 'Pendentes', 'Resolvidas']
const FONTE = 'A tabela de multas'
const multas = (n: number) => `${int(n)} ${n === 1 ? 'multa' : 'multas'}`

/** Aba Multas: KPIs (total, pendentes, resolvidas); Por mês | Por motorista; Por infração na largura total. */
export function MultasTab({ dados, filtros, now, periodo }: PropsAba) {
  const ctx = useContexto(dados, filtros, now)
  const mu = useMemo(() => (ctx && dados ? calcularMultas(ctx, dados) : null), [ctx, dados])
  if (!mu) return <KpisCarregando rotulos={KPIS} classe="dash-mu-kpis" rotulo={ROTULO_KPIS} />
  const k = mu.kpis
  const parte = (n: number) => (k && k.total ? [{ rotulo: 'Do total', texto: pct((n / k.total) * 100) }] : [])
  const kpis: KpiAba[] = [
    { id: 'total', rotulo: KPIS[0], tom: 'brand', valor: k ? int(k.total) : null },
    { id: 'pendentes', rotulo: KPIS[1], tom: 'warning', valor: k ? int(k.pendentes) : null, apoio: k ? [{ rotulo: 'Status', texto: 'Notificar o condutor', atencao: k.pendentes > 0 }, ...parte(k.pendentes)] : [] },
    { id: 'resolvidas', rotulo: KPIS[2], tom: 'success', valor: k ? int(k.resolvidas) : null, apoio: k ? parte(k.resolvidas) : [] },
  ]
  const indisponivel = k == null
  return <>
    <KpisAba itens={kpis} classe="dash-mu-kpis" rotulo={ROTULO_KPIS} />
    <div className="dash-grade">
      <PorMesCard pontos={mu.porMes} total={k?.total ?? 0} indisponivel={indisponivel} periodo={periodo} />
      <PorMotoristaCard linhas={mu.porMotorista} indisponivel={indisponivel} periodo={periodo} />
      <PorInfracaoCard linhas={mu.porInfracao} indisponivel={indisponivel} periodo={periodo} />
    </div>
  </>
}

/** Multas por mês (barras) e, sob demanda, total e pendentes de cada mês. */
function PorMesCard({ pontos, total, indisponivel, periodo }: { pontos: MultasMes[]; total: number; indisponivel: boolean; periodo: string }) {
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
      titulo="Multas por mês" periodo={periodo} unidade="multas por mês" valor={indisponivel ? '—' : multas(total)} sub={indisponivel ? undefined : 'Pela data da multa'}
      grafico={!indisponivel && pontos.length ? <BarraChart descricao={`Multas por mês, ${periodo}`} nome="Multas" formatar={int} larguraEixo={36} dados={pontos.map((p) => ({ rotulo: p.rotulo, valor: p.qtd }))} /> : undefined}
      tabela={indisponivel ? semDadoBloco(FONTE) : pontos.length ? <Table columns={colunas} rows={pontos} rowKey={(p) => p.mes} /> : vazio('Nenhuma multa no período')}
      tabelaSobDemanda={!indisponivel && pontos.length > 0}
    />
  )
}

function PorMotoristaCard({ linhas, indisponivel, periodo }: { linhas: LinhaMultaMotorista[]; indisponivel: boolean; periodo: string }) {
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
      valor={!indisponivel && maior ? maior.motorista : undefined} sub={!indisponivel && maior ? `Mais multas · ${multas(maior.qtd)} · ${pct(maior.pct)} do total` : undefined}
      tabela={indisponivel ? semDadoBloco(FONTE) : <Table columns={colunas} rows={linhas} rowKey={(l) => l.motorista} empty={vazio('Nenhuma multa no período')} />}
    />
  )
}

function PorInfracaoCard({ linhas, indisponivel, periodo }: { linhas: LinhaMultaInfracao[]; indisponivel: boolean; periodo: string }) {
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
      valor={!indisponivel && maior ? multas(maior.qtd) : undefined} sub={!indisponivel && maior ? `Infração mais frequente: ${maior.infracao}` : undefined}
      tabela={indisponivel ? semDadoBloco(FONTE) : <Table columns={colunas} rows={linhas} rowKey={(l) => l.infracao} empty={vazio('Nenhuma multa no período')} />}
    />
  )
}
