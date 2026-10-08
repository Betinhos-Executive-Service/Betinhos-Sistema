import { Table, type TableColumn } from '@betinhos/ui'
import { LinhaChart } from '../charts/Charts'
import type { ProducaoPT, TopMotorista } from '../domain/destaques'
import { brl, int } from '../domain/format'
import { useMedia } from '../../operacional/useMedia'
import { AnaliseCard } from './AnaliseCard'
import { COLUNA_LARGA, MEDIA_MOBILE, juntar } from './Linhas'

type Mes = ProducaoPT['meses'][number]

function Top({ titulo, rows, mobile }: { titulo: string; rows: TopMotorista[]; mobile: boolean }) {
  const colunas: TableColumn<TopMotorista>[] = mobile
    ? [
      { key: 'nome', header: 'Motorista', cell: (r) => r.nome },
      { key: 'resto', header: 'Serviços e faturamento', width: COLUNA_LARGA, cell: (r) => juntar(`${int(r.qtd)} serviços`, brl(r.fat)) },
    ]
    : [
      { key: 'nome', header: 'Motorista', cell: (r) => r.nome },
      { key: 'qtd', header: 'Serviços', align: 'end', cell: (r) => int(r.qtd) },
      { key: 'fat', header: 'Faturamento', align: 'end', cell: (r) => brl(r.fat) },
    ]
  return (
    <div className="dash-top">
      <h3 className="dash-top__titulo">{titulo}</h3>
      <Table
        columns={colunas}
        rows={rows}
        rowKey={(r) => r.key}
        empty="Nenhum serviço no período."
      />
    </div>
  )
}

export function ProducaoPropriaTerceira({ dados, periodo }: { dados: ProducaoPT; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const tops = <div className="dash-tops"><Top titulo="Top 5 motoristas próprios" rows={dados.topPropria} mobile={mobile} /><Top titulo="Top 5 motoristas terceirizados" rows={dados.topTerceirizada} mobile={mobile} /></div>
  const colunasMes: TableColumn<Mes>[] = mobile
    ? [
      { key: 'm', header: 'Mês', cell: (m) => m.rotulo },
      { key: 'resto', header: 'Própria e terceirizada', width: COLUNA_LARGA, cell: (m) => juntar(`Própria ${int(m.propria)}`, `Terceirizada ${int(m.terceirizada)}`) },
    ]
    : [
      { key: 'm', header: 'Mês', cell: (m) => m.rotulo },
      { key: 'p', header: 'Própria', align: 'end', cell: (m) => int(m.propria) },
      { key: 't', header: 'Terceirizada', align: 'end', cell: (m) => int(m.terceirizada) },
    ]
  return (
    <AnaliseCard
      titulo="Produção própria × terceirizada"
      periodo={periodo}
      unidade="serviços por mês"
      valor={int(dados.classificados)}
      sub="serviços com veículo classificado"
      grafico={dados.meses.length ? <>
        <LinhaChart
          descricao="Serviços por mês com veículo próprio e terceirizado"
          formatar={int}
          dados={dados.meses.map((m) => ({ rotulo: m.rotulo, propria: m.propria, terceirizada: m.terceirizada }))}
          series={[{ chave: 'propria', nome: 'Própria', cor: 'action' }, { chave: 'terceirizada', nome: 'Terceirizada', cor: 'brand', tracejada: true }]}
        />
        {tops}
      </> : undefined}
      tabela={<>
        <Table
          columns={colunasMes}
          rows={dados.meses}
          rowKey={(m) => m.mes}
          empty="Nenhum serviço com veículo classificado."
        />
        {tops}
      </>}
    />
  )
}
