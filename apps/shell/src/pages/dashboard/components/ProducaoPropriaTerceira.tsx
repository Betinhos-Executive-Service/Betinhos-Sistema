import { EmptyState, Table, type TableColumn } from '@betinhos/ui'
import { Inbox } from 'lucide-react'
import { LinhaChart } from '../charts/Charts'
import type { ProducaoPT, TopMotorista } from '../domain/destaques'
import { brl, brlS, int } from '../domain/format'
import { useMedia } from '../../operacional/useMedia'
import { AnaliseCard } from './AnaliseCard'
import { Nome } from './Celulas'
import { COLUNA_LARGA, MEDIA_MOBILE, juntar } from './Linhas'

type Mes = ProducaoPT['meses'][number]

/** Top 5 motoristas de uma frota: o 1º em destaque no topo, tabela Motorista · Serviços · Faturamento. */
export function TopMotoristas({ titulo, rows, periodo }: { titulo: string; rows: TopMotorista[]; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunas: TableColumn<TopMotorista>[] = mobile
    ? [
      { key: 'nome', header: 'Motorista', cell: (r) => r.nome },
      { key: 'resto', header: 'Serviços e faturamento', width: COLUNA_LARGA, cell: (r) => juntar(`${int(r.qtd)} serviços`, brl(r.fat)) },
    ]
    : [
      { key: 'nome', header: 'Motorista', width: 'minmax(0, 1.4fr)', cell: (r) => <Nome texto={r.nome} /> },
      { key: 'qtd', header: 'Serviços', align: 'end', cell: (r) => <strong className="dash-forte">{int(r.qtd)}</strong> },
      { key: 'fat', header: 'Faturamento', align: 'end', cell: (r) => <strong className="dash-forte">{brl(r.fat)}</strong> },
    ]
  const lider = rows[0]
  return (
    <AnaliseCard
      titulo={titulo}
      periodo={periodo}
      unidade="serviços e R$"
      valor={lider ? brlS(lider.fat) : undefined}
      sub={lider ? `${lider.nome} · ${int(lider.qtd)} serviços` : 'Serviços e faturamento'}
      tabela={<Table columns={colunas} rows={rows} rowKey={(r) => r.key} empty={<EmptyState compact icon={<Inbox />} title="Nenhum registro no período" />} />}
    />
  )
}

export function ProducaoPropriaTerceira({ dados, periodo }: { dados: ProducaoPT; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const colunasMes: TableColumn<Mes>[] = mobile
    ? [
      { key: 'm', header: 'Mês', cell: (m) => m.rotulo },
      { key: 'resto', header: 'Própria e terceirizada', width: COLUNA_LARGA, cell: (m) => juntar(`Própria ${int(m.propria)}`, `Terceirizada ${int(m.terceirizada)}`) },
    ]
    : [
      { key: 'm', header: 'Mês', cell: (m) => <strong className="dash-forte">{m.rotulo}</strong> },
      { key: 'p', header: 'Própria', align: 'end', cell: (m) => int(m.propria) },
      { key: 't', header: 'Terceirizada', align: 'end', cell: (m) => int(m.terceirizada) },
    ]
  const tabela = <Table columns={colunasMes} rows={dados.meses} rowKey={(m) => m.mes} empty="Nenhum serviço com veículo classificado." />
  return (
    <AnaliseCard
      titulo="Produção própria × terceirizada"
      periodo={periodo}
      unidade="serviços por mês"
      valor={int(dados.classificados)}
      sub="serviços com veículo classificado"
      grafico={dados.meses.length ? (
        <LinhaChart
          descricao={`Serviços por mês com veículo próprio e terceirizado, ${periodo}`}
          formatar={int}
          larguraEixo={36}
          dados={dados.meses.map((m) => ({ rotulo: m.rotulo, propria: m.propria, terceirizada: m.terceirizada }))}
          series={[{ chave: 'propria', nome: 'Própria', cor: 'action' }, { chave: 'terceirizada', nome: 'Terceirizada', cor: 'brand', tracejada: true }]}
        />
      ) : <EmptyState compact icon={<Inbox />} title="Nenhum serviço com veículo classificado no período" />}
      tabela={dados.meses.length ? tabela : undefined}
      tabelaSobDemanda
    />
  )
}
