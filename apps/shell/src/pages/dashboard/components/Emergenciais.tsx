import { Table } from '@betinhos/ui'
import type { Emergenciais as Dados } from '../domain/destaques'
import { dec, int } from '../domain/format'
import { AnaliseCard } from './AnaliseCard'
import { COLUNA_LARGA, Linhas } from './Linhas'

type Mes = Dados['meses'][number]

/** Mês + ranking dos 5 clientes, uma linha por posição: os cinco "Nº cliente" não cabem em colunas no card. */
const colunas = [
  { key: 'mes', header: 'Mês', cell: (m: Mes) => m.rotulo },
  { key: 'ranking', header: 'Ranking de clientes', width: COLUNA_LARGA, cell: (m: Mes) => <Linhas itens={m.ranking.length ? m.ranking.map((r, i) => `${i + 1}º ${r.cliente} · ${int(r.qtd)}`) : ['—']} /> },
]

export function Emergenciais({ dados, periodo }: { dados: Dados; periodo: string }) {
  return (
    <AnaliseCard
      titulo="Serviços emergenciais"
      periodo={periodo}
      unidade="pedidos no mesmo dia da saída"
      valor={int(dados.total)}
      sub={`de ${int(dados.de)} serviços · ${dec(dados.percentual, 1)}%`}
      apoio={dados.top3.map((t, i) => ({ rotulo: `${i + 1}º`, texto: `${t.cliente} · ${dec(t.percentual, 1)}% · ${int(t.qtd)}` }))}
      tabela={<Table columns={colunas} rows={dados.meses} rowKey={(m) => m.mes} empty="Nenhum serviço emergencial no período." />}
    />
  )
}
