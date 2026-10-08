import { Table } from '@betinhos/ui'
import { LinhaChart } from '../charts/Charts'
import type { ProducaoPT, TopMotorista } from '../domain/destaques'
import { brl, int } from '../domain/format'
import { AnaliseCard } from './AnaliseCard'

type Mes = ProducaoPT['meses'][number]

function Top({ titulo, rows }: { titulo: string; rows: TopMotorista[] }) {
  return (
    <div className="dash-top">
      <h3 className="dash-top__titulo">{titulo}</h3>
      <Table
        columns={[
          { key: 'nome', header: 'Motorista', cell: (r: TopMotorista) => r.nome },
          { key: 'qtd', header: 'Serviços', align: 'end', cell: (r: TopMotorista) => int(r.qtd) },
          { key: 'fat', header: 'Faturamento', align: 'end', cell: (r: TopMotorista) => brl(r.fat) },
        ]}
        rows={rows}
        rowKey={(r) => r.nome}
        empty="Nenhum serviço no período."
      />
    </div>
  )
}

export function ProducaoPropriaTerceira({ dados, periodo }: { dados: ProducaoPT; periodo: string }) {
  const tops = <div className="dash-tops"><Top titulo="Top 5 motoristas próprios" rows={dados.topPropria} /><Top titulo="Top 5 motoristas terceirizados" rows={dados.topTerceirizada} /></div>
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
          series={[{ chave: 'propria', nome: 'Própria', cor: 'action' }, { chave: 'terceirizada', nome: 'Terceirizada', cor: 'brand' }]}
        />
        {tops}
      </> : undefined}
      tabela={<>
        <Table
          columns={[
            { key: 'm', header: 'Mês', cell: (m: Mes) => m.rotulo },
            { key: 'p', header: 'Própria', align: 'end', cell: (m: Mes) => int(m.propria) },
            { key: 't', header: 'Terceirizada', align: 'end', cell: (m: Mes) => int(m.terceirizada) },
          ]}
          rows={dados.meses}
          rowKey={(m) => m.mes}
          empty="Nenhum serviço com veículo classificado."
        />
        {tops}
      </>}
    />
  )
}
