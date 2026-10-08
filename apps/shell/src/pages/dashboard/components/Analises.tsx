import { Progress, Table, type TableColumn } from '@betinhos/ui'
import { BarraChart, LinhaChart } from '../charts/Charts'
import type { Delta, LinhaCliente, LinhaMeta, LinhaMotorista } from '../domain/analises'
import { brl, brlS, dec, int } from '../domain/format'
import type { Resumo } from '../domain/resumo'
import { useMedia } from '../../operacional/useMedia'
import { AnaliseCard } from './AnaliseCard'
import { COLUNA_LARGA, Linhas, MEDIA_MOBILE, juntar } from './Linhas'

const delta = (d: Delta) => (d.tipo === 'novo' ? 'Novo' : d.tipo === 'nada' ? '—' : `${d.valor > 0 ? '+' : ''}${dec(d.valor, 1)}%`)
const pct = (v: number) => `${dec(v, 1)}%`
/** Com mais meses que isso, as colunas mensais não cabem no card: cada mês vira uma linha da célula. */
const LIMITE_MESES_EM_COLUNAS = 3
type PontoTP = Resumo['totalProduzido']['pontos'][number]
type PontoTicket = Resumo['ticketMensal']['pontos'][number]
type PontoCusto = Resumo['custoFrota']['pontos'][number]
type LinhaStatus = Resumo['status']['linhas'][number]
type LinhaVolume = Resumo['topVolume']['linhas'][number]
type LinhaFat = Resumo['topFaturamento']['linhas'][number]
/** Variante de duas colunas: título da linha na 1ª e o restante, com rótulo inline, na 2ª. */
const resto = <R,>(header: string, cell: TableColumn<R>['cell']): TableColumn<R> => ({ key: 'resto', header, width: COLUNA_LARGA, cell })

export function Analises({ resumo, periodo }: { resumo: Resumo; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const { totalProduzido: tp, metaRealizado: mr, clientes, ticketMensal: tm, status, custoFrota: cf, topVolume: tv, topFaturamento: tf, motoristas } = resumo
  const anos = tp.anos.map(String)
  const empilhaClientes = mobile || clientes.meses.length > LIMITE_MESES_EM_COLUNAS
  const empilhaMotoristas = mobile || motoristas.meses.length > LIMITE_MESES_EM_COLUNAS

  const colTP: TableColumn<PontoTP>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Por ano', (p) => <Linhas itens={anos.map((a, i) => `${a}: ${brlS(p.valores[i])}`)} />)]
    : [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, ...anos.map((a, i) => ({ key: a, header: a, align: 'end' as const, cell: (p: PontoTP) => brl(p.valores[i]) }))]
  const colMeta: TableColumn<LinhaMeta>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (l) => l.rotulo }, resto('Meta e realizado', (l) => juntar(`Meta ${brlS(l.meta)}`, `Realizado ${brlS(l.real)}`, pct(l.pct)))]
    : [
      { key: 'm', header: 'Mês', cell: (l) => l.rotulo },
      { key: 'meta', header: 'Meta', align: 'end', cell: (l) => brl(l.meta) },
      { key: 'real', header: 'Realizado', align: 'end', cell: (l) => brl(l.real) },
      { key: 'pct', header: 'Atingimento', cell: (l) => <Progress value={Math.min(100, l.pct)} label={pct(l.pct)} tone={l.tom} showValue={false} /> },
    ]
  const colClientes: TableColumn<LinhaCliente>[] = empilhaClientes
    ? [
      { key: 'c', header: 'Cliente', cell: (l) => l.cliente },
      resto('Por mês e total', (l) => <Linhas itens={[...clientes.meses.map((m, i) => `${m.rotulo}: ${brlS(l.meses[i].valor)} · ${delta(l.meses[i].delta)}`), juntar(`Total ${brlS(l.total)}`, `Participação ${pct(l.participacao)}`)]} />),
    ]
    : [
      { key: 'c', header: 'Cliente', cell: (l) => l.cliente },
      ...clientes.meses.map((m, i) => ({ key: m.mes, header: m.rotulo, align: 'end' as const, cell: (l: LinhaCliente) => `${brlS(l.meses[i].valor)} · ${delta(l.meses[i].delta)}` })),
      { key: 't', header: 'Total', align: 'end', cell: (l) => brlS(l.total) },
      { key: 'p', header: 'Participação', align: 'end', cell: (l) => pct(l.participacao) },
    ]
  const colTicket: TableColumn<PontoTicket>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Ticket médio', (p) => (p.valor == null ? '—' : `Ticket médio ${brl(p.valor)}`))]
    : [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, { key: 'v', header: 'Ticket médio', align: 'end', cell: (p) => (p.valor == null ? '—' : brl(p.valor)) }]
  const colStatus: TableColumn<LinhaStatus>[] = mobile
    ? [{ key: 's', header: 'Status', cell: (l) => l.status }, resto('Serviços', (l) => juntar(`${int(l.qtd)} serviços`, `Participação ${pct(l.pct)}`))]
    : [{ key: 's', header: 'Status', cell: (l) => l.status }, { key: 'q', header: 'Serviços', align: 'end', cell: (l) => int(l.qtd) }, { key: 'p', header: 'Participação', align: 'end', cell: (l) => pct(l.pct) }]
  const colCusto: TableColumn<PontoCusto>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Custo', (p) => `Custo ${brl(p.valor)}`)]
    : [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, { key: 'v', header: 'Custo', align: 'end', cell: (p) => brl(p.valor) }]
  const colVolume: TableColumn<LinhaVolume>[] = mobile
    ? [{ key: 'c', header: 'Cliente', cell: (l) => l.cliente }, resto('Serviços', (l) => juntar(`${int(l.qtd)} serviços`, `Participação ${pct(l.pct)}`))]
    : [{ key: 'c', header: 'Cliente', cell: (l) => l.cliente }, { key: 'q', header: 'Serviços', align: 'end', cell: (l) => int(l.qtd) }, { key: 'p', header: 'Participação', align: 'end', cell: (l) => pct(l.pct) }]
  const colFat: TableColumn<LinhaFat>[] = mobile
    ? [{ key: 'c', header: 'Cliente', cell: (l) => l.cliente }, resto('Faturamento', (l) => juntar(`Faturamento ${l.valor}`, `Ticket médio ${l.ticket}`, `Participação ${pct(l.pct)}`))]
    : [{ key: 'c', header: 'Cliente', cell: (l) => l.cliente }, { key: 'v', header: 'Faturamento', align: 'end', cell: (l) => l.valor }, { key: 't', header: 'Ticket médio', align: 'end', cell: (l) => l.ticket }, { key: 'p', header: 'Participação', align: 'end', cell: (l) => pct(l.pct) }]
  const colMotoristas: TableColumn<LinhaMotorista>[] = empilhaMotoristas
    ? [
      { key: 'n', header: 'Motorista', cell: (l) => l.nome },
      resto('Por mês e total', (l) => <Linhas itens={[...motoristas.meses.map((m, i) => `${m.rotulo}: ${int(l.meses[i].qtd)} · ${l.meses[i].pct}`), juntar(`Total ${int(l.total)}`, `Participação ${pct(l.pct)}`)]} />),
    ]
    : [
      { key: 'n', header: 'Motorista', cell: (l) => l.nome },
      ...motoristas.meses.map((m, i) => ({ key: m.mes, header: m.rotulo, align: 'end' as const, cell: (l: LinhaMotorista) => `${int(l.meses[i].qtd)} · ${l.meses[i].pct}` })),
      { key: 't', header: 'Total', align: 'end', cell: (l) => int(l.total) },
      { key: 'p', header: 'Participação', align: 'end', cell: (l) => pct(l.pct) },
    ]

  return (
    <section className="dash-analises" aria-label="Análises">
      <AnaliseCard
        titulo="Total produzido" periodo={periodo} unidade="R$ por mês" valor={tp.valor} sub={tp.sub} chips={tp.chips} apoio={tp.apoio}
        grafico={<LinhaChart descricao={`Faturamento mensal de ${anos.join(', ')}`} formatar={brlS} dados={tp.pontos.map((p) => ({ rotulo: p.rotulo, [anos[0]]: p.valores[0], [anos[1]]: p.valores[1], [anos[2]]: p.valores[2] }))} series={[{ chave: anos[0], nome: anos[0], cor: 'secondary', tracejada: true }, { chave: anos[1], nome: anos[1], cor: 'brand' }, { chave: anos[2], nome: anos[2], cor: 'action' }]} />}
        tabela={<Table columns={colTP} rows={tp.pontos} rowKey={(p) => p.rotulo} />}
      />
      <AnaliseCard
        titulo="Meta × realizado" periodo={periodo} unidade="R$ por mês" valor={mr.valor} sub={mr.sub} chips={mr.chips} apoio={mr.apoio}
        tabela={<Table columns={colMeta} rows={mr.linhas} rowKey={(l) => l.mes} empty="Nenhuma meta no período." />}
      />
      <AnaliseCard
        titulo="Faturamento por cliente" periodo={periodo} unidade="R$" valor={clientes.valor} sub={clientes.sub} apoio={clientes.apoio}
        tabela={<Table columns={colClientes} rows={clientes.linhas} rowKey={(l) => l.cliente} empty="Nenhum cliente com faturamento no período." />}
      />
      <AnaliseCard
        titulo="Ticket médio mensal" periodo={periodo} unidade="R$ por serviço" valor={tm.valor} sub={tm.sub} chips={tm.chips}
        grafico={<BarraChart descricao="Ticket médio por mês" nome="Ticket médio" formatar={brlS} dados={tm.pontos} />}
        tabela={<Table columns={colTicket} rows={tm.pontos} rowKey={(p) => p.rotulo} />}
      />
      <AnaliseCard
        titulo="Status dos serviços" periodo={periodo} unidade="serviços" valor={status.valor} sub={status.sub} apoio={status.apoio}
        tabela={<Table columns={colStatus} rows={status.linhas} rowKey={(l) => l.status} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Custo da frota" periodo={periodo} unidade="R$ em manutenções" valor={cf.valor} sub={cf.sub} apoio={cf.apoio}
        grafico={cf.pontos.length ? <BarraChart descricao="Custo de manutenção por mês" nome="Custo" formatar={brlS} dados={cf.pontos} /> : undefined}
        tabela={<Table columns={colCusto} rows={cf.pontos} rowKey={(p) => p.rotulo} empty="Nenhuma manutenção no período." />}
      />
      <AnaliseCard
        titulo="Clientes por volume" periodo={periodo} unidade="serviços" valor={tv.valor} sub={tv.sub} apoio={tv.apoio}
        tabela={<Table columns={colVolume} rows={tv.linhas} rowKey={(l) => l.cliente} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Clientes por faturamento" periodo={periodo} unidade="R$" valor={tf.valor} sub={tf.sub} apoio={tf.apoio}
        tabela={<Table columns={colFat} rows={tf.linhas} rowKey={(l) => l.cliente} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Serviços por motorista" periodo={periodo} unidade="serviços" valor={motoristas.valor} sub={motoristas.sub} apoio={motoristas.apoio}
        tabela={<Table columns={colMotoristas} rows={motoristas.linhas} rowKey={(l) => l.key} empty="Nenhum motorista no período." />}
      />
    </section>
  )
}
