import { EmptyState, Table, type TableColumn } from '@betinhos/ui'
import { Inbox } from 'lucide-react'
import { BarraChart, LinhaChart } from '../charts/Charts'
import type { LinhaMeta, MetaRealizado, StatusServicos, TicketMensal, TotalProduzido } from '../domain/analises'
import { brl, brlS, int } from '../domain/format'
import { useMedia } from '../../operacional/useMedia'
import { AnaliseCard } from './AnaliseCard'
import { tabelaCopia } from './Copiar'
import { Participacao, Status, pct } from './Celulas'
import { COLUNA_LARGA, Linhas, MEDIA_MOBILE, juntar } from './Linhas'

type PontoTP = TotalProduzido['pontos'][number]
type PontoTicket = TicketMensal['pontos'][number]
type LinhaStatus = StatusServicos['linhas'][number]
/** Variante de duas colunas do celular: título da linha na 1ª e o restante, com rótulo inline, na 2ª. */
const resto = <R,>(header: string, cell: TableColumn<R>['cell']): TableColumn<R> => ({ key: 'resto', header, width: COLUNA_LARGA, cell })
const forte = (texto: string) => <strong className="dash-forte">{texto}</strong>
const vazio = (titulo: string) => <EmptyState compact icon={<Inbox />} title={titulo} />

/** Total produzido: faturamento mensal dos 3 anos (gráfico de linhas) e os valores sob demanda. */
export function TotalProduzidoCard({ dados: tp, periodo }: { dados: TotalProduzido; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const anos = tp.anos.map(String)
  const colunas: TableColumn<PontoTP>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Por ano', (p) => <Linhas itens={anos.map((a, i) => `${a}: ${brlS(p.valores[i])}`)} />)]
    : [{ key: 'm', header: 'Mês', cell: (p) => forte(p.rotulo) }, ...anos.map((a, i) => ({ key: a, header: a, align: 'end' as const, cell: (p: PontoTP) => brl(p.valores[i]) }))]
  return (
    <AnaliseCard
      titulo="Total produzido" periodo={periodo} unidade="R$ por mês" valor={tp.valor} sub={`Comparativo 3 anos · ${tp.sub}`} chips={tp.chips} apoio={tp.apoio}
      grafico={<LinhaChart descricao={`Faturamento mensal de ${anos.join(', ')}, ${periodo}`} formatar={brlS} dados={tp.pontos.map((p) => ({ rotulo: p.rotulo, [anos[0]]: p.valores[0], [anos[1]]: p.valores[1], [anos[2]]: p.valores[2] }))} series={[{ chave: anos[0], nome: anos[0], cor: 'secondary', tracejada: true }, { chave: anos[1], nome: anos[1], cor: 'brand' }, { chave: anos[2], nome: anos[2], cor: 'action' }]} />}
      tabela={<Table columns={colunas} rows={tp.pontos} rowKey={(p) => p.rotulo} />} tabelaSobDemanda
      copiar={tabelaCopia(tp.pontos, [['Mês', (p) => p.rotulo], ...anos.map((a, i) => [a, (p: PontoTP) => brl(p.valores[i])] as const)])}
    />
  )
}

/** Meta × realizado por mês do recorte, com o atingimento em barra. */
export function MetaRealizadoCard({ dados: mr, periodo }: { dados: MetaRealizado; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<LinhaMeta>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (l) => l.rotulo }, resto('Meta e realizado', (l) => juntar(`Meta ${brlS(l.meta)}`, `Realizado ${brlS(l.real)}`, pct(l.pct)))]
    : [
      { key: 'm', header: 'Mês', width: 'minmax(0, .7fr)', cell: (l) => forte(l.rotulo) },
      { key: 'meta', header: 'Meta', align: 'end', cell: (l) => brl(l.meta) },
      { key: 'real', header: 'Realizado', align: 'end', cell: (l) => forte(brl(l.real)) },
      { key: 'pct', header: 'Atingimento', width: 'minmax(0, 1.3fr)', cell: (l) => <Participacao valor={l.pct} rotulo={`Atingimento de ${l.rotulo}`} tom={l.tom} /> },
    ]
  return (
    <AnaliseCard
      titulo="Meta × realizado" periodo={periodo} unidade="R$ por mês" valor={mr.valor} sub={mr.sub} chips={mr.chips} apoio={mr.apoio}
      tabela={<Table columns={colunas} rows={mr.linhas} rowKey={(l) => l.mes} empty={vazio('Nenhuma meta no período')} />}
      copiar={tabelaCopia(mr.linhas, [['Mês', (l) => l.rotulo], ['Meta', (l) => brl(l.meta)], ['Realizado', (l) => brl(l.real)], ['Atingimento', (l) => pct(l.pct)]])}
    />
  )
}

/** Ticket médio por mês (barras) e os valores sob demanda. */
export function TicketMensalCard({ dados: tm, periodo }: { dados: TicketMensal; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<PontoTicket>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Ticket médio', (p) => (p.valor == null ? '—' : `Ticket médio ${brl(p.valor)}`))]
    : [{ key: 'm', header: 'Mês', cell: (p) => forte(p.rotulo) }, { key: 'v', header: 'Ticket médio', align: 'end', cell: (p) => (p.valor == null ? '—' : brl(p.valor)) }]
  return (
    <AnaliseCard
      titulo="Ticket médio — mensal" periodo={periodo} unidade="R$ por serviço" valor={tm.valor} sub={tm.sub} chips={tm.chips}
      grafico={<BarraChart descricao={`Ticket médio por mês, ${periodo}`} nome="Ticket médio" formatar={brlS} dados={tm.pontos} />}
      tabela={<Table columns={colunas} rows={tm.pontos} rowKey={(p) => p.rotulo} />} tabelaSobDemanda
      copiar={tabelaCopia(tm.pontos, [['Mês', (p) => p.rotulo], ['Ticket médio', (p) => (p.valor == null ? '—' : brl(p.valor))]])}
    />
  )
}

/** Status dos serviços: participação de cada status, sempre com texto. */
export function StatusServicosCard({ dados: status, periodo }: { dados: StatusServicos; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<LinhaStatus>[] = mobile
    ? [{ key: 's', header: 'Status', cell: (l) => <Status texto={l.status} /> }, resto('Serviços', (l) => juntar(`${int(l.qtd)} serviços`, `Participação ${pct(l.pct)}`))]
    : [
      { key: 's', header: 'Status', cell: (l) => <Status texto={l.status} /> },
      { key: 'p', header: 'Participação', width: 'minmax(0, 1.6fr)', cell: (l) => <Participacao valor={l.pct} rotulo={`Participação de ${l.status}`} detalhe={`${int(l.qtd)} serv.`} /> },
    ]
  return (
    <AnaliseCard
      titulo="Status dos serviços" periodo={periodo} unidade="serviços" valor={status.valor} sub={status.sub} apoio={status.apoio}
      tabela={<Table columns={colunas} rows={status.linhas} rowKey={(l) => l.status} empty={vazio('Nenhum serviço no período')} />}
      copiar={tabelaCopia(status.linhas, [['Status', (l) => l.status], ['Serviços', (l) => l.qtd], ['Participação', (l) => pct(l.pct)]])}
    />
  )
}
