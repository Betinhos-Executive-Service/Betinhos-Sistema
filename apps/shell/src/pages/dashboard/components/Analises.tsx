import { Progress, Table } from '@betinhos/ui'
import { BarraChart, LinhaChart } from '../charts/Charts'
import type { Delta, LinhaCliente, LinhaMeta, LinhaMotorista } from '../domain/analises'
import { brl, brlS, dec, int } from '../domain/format'
import type { Resumo } from '../domain/resumo'
import { AnaliseCard } from './AnaliseCard'

const delta = (d: Delta) => (d.tipo === 'novo' ? 'Novo' : d.tipo === 'nada' ? '—' : `${d.valor > 0 ? '+' : ''}${dec(d.valor, 1)}%`)
const pct = (v: number) => `${dec(v, 1)}%`

export function Analises({ resumo, periodo }: { resumo: Resumo; periodo: string }) {
  const { totalProduzido: tp, metaRealizado: mr, clientes, ticketMensal: tm, status, custoFrota: cf, topVolume: tv, topFaturamento: tf, motoristas } = resumo
  const anos = tp.anos.map(String)
  return (
    <section className="dash-analises" aria-label="Análises">
      <AnaliseCard
        titulo="Total produzido" periodo={periodo} unidade="R$ por mês" valor={tp.valor} sub={tp.sub} chips={tp.chips} apoio={tp.apoio}
        grafico={<LinhaChart descricao={`Faturamento mensal de ${anos.join(', ')}`} formatar={brlS} dados={tp.pontos.map((p) => ({ rotulo: p.rotulo, [anos[0]]: p.valores[0], [anos[1]]: p.valores[1], [anos[2]]: p.valores[2] }))} series={[{ chave: anos[0], nome: anos[0], cor: 'secondary', tracejada: true }, { chave: anos[1], nome: anos[1], cor: 'brand' }, { chave: anos[2], nome: anos[2], cor: 'action' }]} />}
        tabela={<Table columns={[{ key: 'm', header: 'Mês', cell: (p: (typeof tp.pontos)[number]) => p.rotulo }, ...anos.map((a, i) => ({ key: a, header: a, align: 'end' as const, cell: (p: (typeof tp.pontos)[number]) => (p.valores[i] == null ? '—' : brl(p.valores[i])) }))]} rows={tp.pontos} rowKey={(p) => p.rotulo} />}
      />
      <AnaliseCard
        titulo="Meta × realizado" periodo={periodo} unidade="R$ por mês" valor={mr.valor} sub={mr.sub} chips={mr.chips} apoio={mr.apoio}
        tabela={<Table columns={[
          { key: 'm', header: 'Mês', cell: (l: LinhaMeta) => l.rotulo },
          { key: 'meta', header: 'Meta', align: 'end', cell: (l: LinhaMeta) => brl(l.meta) },
          { key: 'real', header: 'Realizado', align: 'end', cell: (l: LinhaMeta) => brl(l.real) },
          { key: 'pct', header: 'Atingimento', cell: (l: LinhaMeta) => <Progress value={Math.min(100, l.pct)} label={pct(l.pct)} tone={l.tom} showValue={false} /> },
        ]} rows={mr.linhas} rowKey={(l) => l.mes} empty="Nenhuma meta no período." />}
      />
      <AnaliseCard
        titulo="Faturamento por cliente" periodo={periodo} unidade="R$" valor={clientes.valor} sub={clientes.sub} apoio={clientes.apoio}
        tabela={<Table columns={[
          { key: 'c', header: 'Cliente', cell: (l: LinhaCliente) => l.cliente },
          ...clientes.meses.map((m, i) => ({ key: m.mes, header: m.rotulo, align: 'end' as const, hideBelow: 'compact' as const, cell: (l: LinhaCliente) => `${brlS(l.meses[i].valor)} · ${delta(l.meses[i].delta)}` })),
          { key: 't', header: 'Total', align: 'end', cell: (l: LinhaCliente) => brlS(l.total) },
          { key: 'p', header: 'Participação', align: 'end', cell: (l: LinhaCliente) => pct(l.participacao) },
        ]} rows={clientes.linhas} rowKey={(l) => l.cliente} empty="Nenhum cliente com faturamento no período." />}
      />
      <AnaliseCard
        titulo="Ticket médio mensal" periodo={periodo} unidade="R$ por serviço" valor={tm.valor} sub={tm.sub} chips={tm.chips}
        grafico={<BarraChart descricao="Ticket médio por mês" nome="Ticket médio" formatar={brlS} dados={tm.pontos} />}
        tabela={<Table columns={[{ key: 'm', header: 'Mês', cell: (p: (typeof tm.pontos)[number]) => p.rotulo }, { key: 'v', header: 'Ticket médio', align: 'end', cell: (p: (typeof tm.pontos)[number]) => (p.valor == null ? '—' : brl(p.valor)) }]} rows={tm.pontos} rowKey={(p) => p.rotulo} />}
      />
      <AnaliseCard
        titulo="Status dos serviços" periodo={periodo} unidade="serviços" valor={status.valor} sub={status.sub} apoio={status.apoio}
        tabela={<Table columns={[{ key: 's', header: 'Status', cell: (l: (typeof status.linhas)[number]) => l.status }, { key: 'q', header: 'Serviços', align: 'end', cell: (l: (typeof status.linhas)[number]) => int(l.qtd) }, { key: 'p', header: 'Participação', align: 'end', cell: (l: (typeof status.linhas)[number]) => pct(l.pct) }]} rows={status.linhas} rowKey={(l) => l.status} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Custo da frota" periodo={periodo} unidade="R$ em manutenções" valor={cf.valor} sub={cf.sub} apoio={cf.apoio}
        grafico={cf.pontos.length ? <BarraChart descricao="Custo de manutenção por mês" nome="Custo" formatar={brlS} dados={cf.pontos} /> : undefined}
        tabela={<Table columns={[{ key: 'm', header: 'Mês', cell: (p: (typeof cf.pontos)[number]) => p.rotulo }, { key: 'v', header: 'Custo', align: 'end', cell: (p: (typeof cf.pontos)[number]) => brl(p.valor) }]} rows={cf.pontos} rowKey={(p) => p.rotulo} empty="Nenhuma manutenção no período." />}
      />
      <AnaliseCard
        titulo="Clientes por volume" periodo={periodo} unidade="serviços" valor={tv.valor} sub={tv.sub} apoio={tv.apoio}
        tabela={<Table columns={[{ key: 'c', header: 'Cliente', cell: (l: (typeof tv.linhas)[number]) => l.cliente }, { key: 'q', header: 'Serviços', align: 'end', cell: (l: (typeof tv.linhas)[number]) => int(l.qtd) }, { key: 'p', header: 'Participação', align: 'end', cell: (l: (typeof tv.linhas)[number]) => pct(l.pct) }]} rows={tv.linhas} rowKey={(l) => l.cliente} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Clientes por faturamento" periodo={periodo} unidade="R$" valor={tf.valor} sub={tf.sub} apoio={tf.apoio}
        tabela={<Table columns={[{ key: 'c', header: 'Cliente', cell: (l: (typeof tf.linhas)[number]) => l.cliente }, { key: 'v', header: 'Faturamento', align: 'end', cell: (l: (typeof tf.linhas)[number]) => l.valor }, { key: 't', header: 'Ticket médio', align: 'end', hideBelow: 'mobile', cell: (l: (typeof tf.linhas)[number]) => l.ticket }, { key: 'p', header: 'Participação', align: 'end', cell: (l: (typeof tf.linhas)[number]) => pct(l.pct) }]} rows={tf.linhas} rowKey={(l) => l.cliente} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Serviços por motorista" periodo={periodo} unidade="serviços" valor={motoristas.valor} sub={motoristas.sub} apoio={motoristas.apoio}
        tabela={<Table columns={[
          { key: 'n', header: 'Motorista', cell: (l: LinhaMotorista) => l.nome },
          ...motoristas.meses.map((m, i) => ({ key: m.mes, header: m.rotulo, align: 'end' as const, hideBelow: 'compact' as const, cell: (l: LinhaMotorista) => `${int(l.meses[i].qtd)} · ${l.meses[i].pct}` })),
          { key: 't', header: 'Total', align: 'end', cell: (l: LinhaMotorista) => int(l.total) },
          { key: 'p', header: 'Participação', align: 'end', cell: (l: LinhaMotorista) => pct(l.pct) },
        ]} rows={motoristas.linhas} rowKey={(l) => l.key} empty="Nenhum motorista no período." />}
      />
    </section>
  )
}
