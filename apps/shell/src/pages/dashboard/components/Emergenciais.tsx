import { Table } from '@betinhos/ui'
import type { Emergenciais as Dados } from '../domain/destaques'
import { dec, int } from '../domain/format'
import { AnaliseCard } from './AnaliseCard'

type Mes = Dados['meses'][number]
const posicao = (i: number) => ({ key: `c${i}`, header: `${i + 1}º cliente`, hideBelow: i >= 2 ? ('mobile' as const) : undefined, cell: (m: Mes) => (m.ranking[i] ? `${m.ranking[i].cliente} · ${int(m.ranking[i].qtd)}` : '—') })

export function Emergenciais({ dados, periodo }: { dados: Dados; periodo: string }) {
  return (
    <AnaliseCard
      titulo="Serviços emergenciais"
      periodo={periodo}
      unidade="pedidos no mesmo dia da saída"
      valor={int(dados.total)}
      sub={`de ${int(dados.de)} serviços · ${dec(dados.percentual, 1)}%`}
      apoio={dados.top3.map((t, i) => ({ rotulo: `${i + 1}º`, texto: `${t.cliente} · ${dec(t.percentual, 1)}% · ${int(t.qtd)}` }))}
      tabela={<Table columns={[{ key: 'mes', header: 'Mês', cell: (m: Mes) => m.rotulo }, ...[0, 1, 2, 3, 4].map(posicao)]} rows={dados.meses} rowKey={(m) => m.mes} empty="Nenhum serviço emergencial no período." />}
    />
  )
}
