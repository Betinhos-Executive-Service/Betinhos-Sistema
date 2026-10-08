import { EmptyState, Table, type TableColumn } from '@betinhos/ui'
import { Inbox } from 'lucide-react'
import { BarraChart, LinhaChart } from '../charts/Charts'
import type { Delta, LinhaCliente, LinhaMeta, LinhaMotorista } from '../domain/analises'
import { brl, brlS, dec, int } from '../domain/format'
import type { Resumo } from '../domain/resumo'
import { useMedia } from '../../operacional/useMedia'
import { AnaliseCard } from './AnaliseCard'
import { Duplo, Nome, Participacao, Rolagem, Status, ValorDelta, col, larguraMinima, pct } from './Celulas'
import { COLUNA_LARGA, Expansivel, Linhas, MEDIA_MOBILE, VER_MESES, juntar, useLinhasAbertas } from './Linhas'

const delta = (d: Delta) => (d.tipo === 'novo' ? 'Novo' : d.tipo === 'nada' ? '—' : `${d.valor > 0 ? '+' : ''}${dec(d.valor, 1)}%`)
type PontoTP = Resumo['totalProduzido']['pontos'][number]
type PontoTicket = Resumo['ticketMensal']['pontos'][number]
type PontoCusto = Resumo['custoFrota']['pontos'][number]
type LinhaStatus = Resumo['status']['linhas'][number]
type LinhaVolume = Resumo['topVolume']['linhas'][number]
type LinhaFat = Resumo['topFaturamento']['linhas'][number]
/** Variante de duas colunas do celular: título da linha na 1ª e o restante, com rótulo inline, na 2ª. */
const resto = <R,>(header: string, cell: TableColumn<R>['cell']): TableColumn<R> => ({ key: 'resto', header, width: COLUNA_LARGA, cell })
const forte = (texto: string) => <strong className="dash-forte">{texto}</strong>
/** Vão entre colunas das tabelas mensais (mais denso que o padrão de 12 px do Table). */
const VAO_DENSO = 8
const vazio = (titulo: string) => <EmptyState compact icon={<Inbox />} title={titulo} />

export function Analises({ resumo, periodo }: { resumo: Resumo; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const { totalProduzido: tp, metaRealizado: mr, clientes, ticketMensal: tm, status, custoFrota: cf, topVolume: tv, topFaturamento: tf, motoristas } = resumo
  const anos = tp.anos.map(String)
  // Celular: clientes e motoristas mostram só o total e abrem os meses sob demanda (uma chave por linha).
  const abertasClientes = useLinhasAbertas(clientes.linhas.map((l) => l.cliente))
  const abertasMotoristas = useLinhasAbertas(motoristas.linhas.map((l) => l.key))

  const colTP: TableColumn<PontoTP>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Por ano', (p) => <Linhas itens={anos.map((a, i) => `${a}: ${brlS(p.valores[i])}`)} />)]
    : [{ key: 'm', header: 'Mês', cell: (p) => forte(p.rotulo) }, ...anos.map((a, i) => ({ key: a, header: a, align: 'end' as const, cell: (p: PontoTP) => brl(p.valores[i]) }))]
  const colMeta: TableColumn<LinhaMeta>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (l) => l.rotulo }, resto('Meta e realizado', (l) => juntar(`Meta ${brlS(l.meta)}`, `Realizado ${brlS(l.real)}`, pct(l.pct)))]
    : [
      { key: 'm', header: 'Mês', width: 'minmax(0, .7fr)', cell: (l) => forte(l.rotulo) },
      { key: 'meta', header: 'Meta', align: 'end', cell: (l) => brl(l.meta) },
      { key: 'real', header: 'Realizado', align: 'end', cell: (l) => forte(brl(l.real)) },
      { key: 'pct', header: 'Atingimento', width: 'minmax(0, 1.3fr)', cell: (l) => <Participacao valor={l.pct} rotulo={`Atingimento de ${l.rotulo}`} tom={l.tom} /> },
    ]

  // Faturamento por cliente: no desktop, um mês por coluna (valor + variação), Total e Participação; rola dentro do card se não couber.
  const trilhasCli = [col(140, 1.6), ...clientes.meses.map(() => col(60)), col(72), col(136, 1.6)]
  const colClientes: TableColumn<LinhaCliente>[] = mobile
    ? [
      { key: 'c', header: 'Cliente', cell: (l) => l.cliente },
      resto('Total e participação', (l) => (
        <Expansivel
          resumo={juntar(`Total ${brlS(l.total)}`, `Participação ${pct(l.participacao)}`)} rotulos={VER_MESES}
          itens={clientes.meses.map((m, i) => `${m.rotulo}: ${brlS(l.meses[i].valor)} · ${delta(l.meses[i].delta)}`)}
          aberta={abertasClientes.aberta(l.cliente)} onAlternar={() => abertasClientes.alternar(l.cliente)}
        />
      )),
    ]
    : [
      { key: 'c', header: 'Cliente', width: trilhasCli[0].width, cell: (l) => <Nome texto={l.cliente} /> },
      ...clientes.meses.map((m, i) => ({ key: m.mes, header: m.rotulo, align: 'end' as const, width: trilhasCli[i + 1].width, cell: (l: LinhaCliente) => <ValorDelta valor={brlS(l.meses[i].valor)} delta={l.meses[i].delta} /> })),
      { key: 't', header: 'Total', align: 'end', width: trilhasCli[clientes.meses.length + 1].width, cell: (l) => forte(brlS(l.total)) },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: trilhasCli[clientes.meses.length + 2].width, cell: (l) => <span className="dash-col-part"><Participacao valor={l.participacao} rotulo={`Participação de ${l.cliente}`} detalhe={brlS(l.total)} /></span> },
    ]
  const colTicket: TableColumn<PontoTicket>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Ticket médio', (p) => (p.valor == null ? '—' : `Ticket médio ${brl(p.valor)}`))]
    : [{ key: 'm', header: 'Mês', cell: (p) => forte(p.rotulo) }, { key: 'v', header: 'Ticket médio', align: 'end', cell: (p) => (p.valor == null ? '—' : brl(p.valor)) }]
  const colStatus: TableColumn<LinhaStatus>[] = mobile
    ? [{ key: 's', header: 'Status', cell: (l) => <Status texto={l.status} /> }, resto('Serviços', (l) => juntar(`${int(l.qtd)} serviços`, `Participação ${pct(l.pct)}`))]
    : [
      { key: 's', header: 'Status', cell: (l) => <Status texto={l.status} /> },
      { key: 'p', header: 'Participação', width: 'minmax(0, 1.6fr)', cell: (l) => <Participacao valor={l.pct} rotulo={`Participação de ${l.status}`} detalhe={`${int(l.qtd)} serv.`} /> },
    ]
  const colCusto: TableColumn<PontoCusto>[] = mobile
    ? [{ key: 'm', header: 'Mês', cell: (p) => p.rotulo }, resto('Custo', (p) => `Custo ${brl(p.valor)}`)]
    : [{ key: 'm', header: 'Mês', cell: (p) => forte(p.rotulo) }, { key: 'v', header: 'Custo', align: 'end', cell: (p) => brl(p.valor) }]
  const colVolume: TableColumn<LinhaVolume>[] = mobile
    ? [{ key: 'c', header: 'Cliente', cell: (l) => l.cliente }, resto('Serviços', (l) => juntar(`${int(l.qtd)} serviços`, `Participação ${pct(l.pct)}`))]
    : [
      { key: 'c', header: 'Cliente', cell: (l) => <Nome texto={l.cliente} /> },
      { key: 'p', header: 'Participação', width: 'minmax(0, 1.6fr)', cell: (l) => <Participacao valor={l.pct} rotulo={`Participação de ${l.cliente}`} detalhe={`${int(l.qtd)} serviços`} /> },
    ]
  const colFat: TableColumn<LinhaFat>[] = mobile
    ? [{ key: 'c', header: 'Cliente', cell: (l) => l.cliente }, resto('Faturamento', (l) => juntar(`Faturamento ${l.valor}`, `Ticket médio ${l.ticket}`, `Participação ${pct(l.pct)}`))]
    : [
      { key: 'c', header: 'Cliente', width: 'minmax(0, 1.2fr)', cell: (l) => <Nome texto={l.cliente} /> },
      { key: 'v', header: 'Faturamento', align: 'end', cell: (l) => forte(l.valor) },
      { key: 't', header: 'Ticket médio', align: 'end', cell: (l) => l.ticket },
      { key: 'p', header: 'Participação', width: 'minmax(0, 1.2fr)', cell: (l) => <Participacao valor={l.pct} rotulo={`Participação de ${l.cliente}`} /> },
    ]

  // Serviços por motorista: um mês por coluna (quantidade + % do mês), Total e Participação; cabeçalho e nome fixos na rolagem.
  const trilhasMot = [col(112, 1.4), ...motoristas.meses.map(() => col(50)), col(58), col(116, 1.4)]
  const colMotoristas: TableColumn<LinhaMotorista>[] = mobile
    ? [
      { key: 'n', header: 'Motorista', cell: (l) => l.nome },
      resto('Total e participação', (l) => (
        <Expansivel
          resumo={juntar(`Total ${int(l.total)}`, pct(l.pct))} rotulos={VER_MESES}
          itens={motoristas.meses.map((m, i) => `${m.rotulo}: ${int(l.meses[i].qtd)} · ${l.meses[i].pct}`)}
          aberta={abertasMotoristas.aberta(l.key)} onAlternar={() => abertasMotoristas.alternar(l.key)}
        />
      )),
    ]
    : [
      { key: 'n', header: 'Motorista', width: trilhasMot[0].width, cell: (l) => <Nome texto={l.nome} /> },
      ...motoristas.meses.map((m, i) => ({ key: m.mes, header: m.rotulo, align: 'end' as const, width: trilhasMot[i + 1].width, cell: (l: LinhaMotorista) => <Duplo valor={int(l.meses[i].qtd)} apoio={l.meses[i].pct} /> })),
      { key: 't', header: 'Total', align: 'end', width: trilhasMot[motoristas.meses.length + 1].width, cell: (l) => <Duplo valor={int(l.total)} apoio={pct(l.pct)} /> },
      { key: 'p', header: <span className="dash-col-part">Participação</span>, width: trilhasMot[motoristas.meses.length + 2].width, cell: (l) => <span className="dash-col-part"><Participacao valor={l.pct} rotulo={`Participação de ${l.nome}`} /></span> },
    ]

  const tabelaClientes = <Table className="dash-tabela--densa" columns={colClientes} rows={clientes.linhas} rowKey={(l) => l.cliente} empty={vazio('Nenhum cliente com faturamento no período')} style={mobile ? undefined : { minWidth: larguraMinima(trilhasCli, VAO_DENSO) }} />
  const tabelaMotoristas = <Table className="dash-tabela--densa" columns={colMotoristas} rows={motoristas.linhas} rowKey={(l) => l.key} empty={vazio('Nenhum motorista no período')} style={mobile ? undefined : { minWidth: larguraMinima(trilhasMot, VAO_DENSO) }} />

  return (
    <section className="dash-grade" aria-label="Análises">
      <AnaliseCard
        titulo="Total produzido" periodo={periodo} unidade="R$ por mês" valor={tp.valor} sub={`Comparativo 3 anos · ${tp.sub}`} chips={tp.chips} apoio={tp.apoio}
        grafico={<LinhaChart descricao={`Faturamento mensal de ${anos.join(', ')}, ${periodo}`} formatar={brlS} dados={tp.pontos.map((p) => ({ rotulo: p.rotulo, [anos[0]]: p.valores[0], [anos[1]]: p.valores[1], [anos[2]]: p.valores[2] }))} series={[{ chave: anos[0], nome: anos[0], cor: 'secondary', tracejada: true }, { chave: anos[1], nome: anos[1], cor: 'brand' }, { chave: anos[2], nome: anos[2], cor: 'action' }]} />}
        tabela={<Table columns={colTP} rows={tp.pontos} rowKey={(p) => p.rotulo} />} tabelaSobDemanda
      />
      <AnaliseCard
        titulo="Meta × realizado" periodo={periodo} unidade="R$ por mês" valor={mr.valor} sub={mr.sub} chips={mr.chips} apoio={mr.apoio}
        tabela={<Table columns={colMeta} rows={mr.linhas} rowKey={(l) => l.mes} empty={vazio('Nenhuma meta no período')} />}
      />
      <AnaliseCard
        largo titulo="Faturamento por cliente" periodo={periodo} unidade="R$ por mês" valor={clientes.valor} sub={clientes.sub} apoio={clientes.apoio}
        tabela={mobile ? tabelaClientes : <Rolagem rotulo="Faturamento por cliente e mês">{tabelaClientes}</Rolagem>}
      />
      <AnaliseCard
        titulo="Ticket médio — mensal" periodo={periodo} unidade="R$ por serviço" valor={tm.valor} sub={tm.sub} chips={tm.chips}
        grafico={<BarraChart descricao={`Ticket médio por mês, ${periodo}`} nome="Ticket médio" formatar={brlS} dados={tm.pontos} />}
        tabela={<Table columns={colTicket} rows={tm.pontos} rowKey={(p) => p.rotulo} />} tabelaSobDemanda
      />
      <AnaliseCard
        titulo="Status dos serviços" periodo={periodo} unidade="serviços" valor={status.valor} sub={status.sub} apoio={status.apoio}
        tabela={<Table columns={colStatus} rows={status.linhas} rowKey={(l) => l.status} empty={vazio('Nenhum serviço no período')} />}
      />
      <AnaliseCard
        titulo="Custo frota — manutenções" periodo={periodo} unidade="R$ em manutenções" valor={cf.valor} sub={cf.sub} apoio={cf.apoio}
        grafico={cf.pontos.length ? <BarraChart descricao={`Custo de manutenção por mês, ${periodo}`} nome="Custo" formatar={brlS} dados={cf.pontos} /> : vazio(cf.sub === 's/dado' ? 'Manutenções indisponíveis no momento' : 'Nenhuma manutenção no período')}
        tabela={cf.pontos.length ? <Table columns={colCusto} rows={cf.pontos} rowKey={(p) => p.rotulo} /> : undefined} tabelaSobDemanda
      />
      <AnaliseCard
        titulo="Top clientes — volume" periodo={periodo} unidade="serviços" valor={tv.valor} sub={tv.sub} apoio={tv.apoio}
        tabela={<Table columns={colVolume} rows={tv.linhas} rowKey={(l) => l.cliente} empty={vazio('Nenhum serviço no período')} />}
      />
      <AnaliseCard
        natural titulo="Top clientes — faturamento" periodo={periodo} unidade="R$" valor={tf.valor} sub={tf.sub} apoio={tf.apoio}
        tabela={<Table columns={colFat} rows={tf.linhas} rowKey={(l) => l.cliente} empty={vazio('Nenhum serviço no período')} />}
      />
      <AnaliseCard
        titulo="Serviços por motorista" periodo={periodo} unidade="serviços por mês" valor={motoristas.valor} sub={motoristas.sub} apoio={motoristas.apoio}
        tabela={mobile ? tabelaMotoristas : <Rolagem rotulo="Serviços por motorista e mês" alturaMax={520}>{tabelaMotoristas}</Rolagem>}
      />
    </section>
  )
}
