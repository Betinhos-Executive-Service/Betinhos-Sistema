import { Table, type TableColumn } from '@betinhos/ui'
import type { Emergenciais as Dados } from '../domain/destaques'
import { dec, int } from '../domain/format'
import { useMedia } from '../../operacional/useMedia'
import { AnaliseCard } from './AnaliseCard'
import { Duplo, Rolagem, col, larguraMinima } from './Celulas'
import { COLUNA_LARGA, Linhas, MEDIA_MOBILE } from './Linhas'

type Mes = Dados['meses'][number]
const POSICOES = [0, 1, 2, 3, 4]
/** Colunas do desktop: mês e os cinco primeiros clientes (nome + quantidade abaixo). */
const TRILHAS = [col(52, 0.7), ...POSICOES.map(() => col(76))]
const VAO = 8

/** Pódio 1º/2º/3º à direita do título, empilhado como os chips 1º/2º dos demais cards. */
function Podio({ top3 }: { top3: Dados['top3'] }) {
  if (!top3.length) return null
  return (
    <ol className="dash-podio" aria-label="Clientes com mais pedidos emergenciais">
      {top3.map((t, i) => (
        <li key={t.cliente} className="dash-chip dash-podio__item">
          <span className="dash-chip__rotulo">{i + 1}º</span>
          <span className="dash-podio__nome" title={t.cliente}>{t.cliente}</span>
          <span className="dash-podio__meta">{dec(t.percentual, 1)}% · {int(t.qtd)}</span>
        </li>
      ))}
    </ol>
  )
}

export function Emergenciais({ dados, periodo }: { dados: Dados; periodo: string }) {
  const mobile = useMedia(MEDIA_MOBILE)
  /** No celular, o ranking do mês vira uma linha por posição; no desktop, uma coluna por posição. */
  const colunas: TableColumn<Mes>[] = mobile
    ? [
      { key: 'mes', header: 'Mês', cell: (m) => m.rotulo },
      { key: 'ranking', header: 'Ranking de clientes', width: COLUNA_LARGA, cell: (m) => <Linhas itens={m.ranking.length ? m.ranking.map((r, i) => `${i + 1}º ${r.cliente} · ${int(r.qtd)}`) : ['—']} /> },
    ]
    : [
      { key: 'mes', header: 'Mês', width: TRILHAS[0].width, cell: (m) => <strong className="dash-forte">{m.rotulo}</strong> },
      ...POSICOES.map((i) => ({
        key: `p${i}`, header: `${i + 1}º cliente`, width: TRILHAS[i + 1].width,
        cell: (m: Mes) => (m.ranking[i] ? <span className="dash-celula-nome" title={m.ranking[i].cliente}><Duplo valor={m.ranking[i].cliente} apoio={`${int(m.ranking[i].qtd)} serv.`} /></span> : '—'),
      })),
    ]
  const tabela = <Table className="dash-tabela--densa" columns={colunas} rows={dados.meses} rowKey={(m) => m.mes} empty="Nenhum serviço emergencial no período." style={mobile ? undefined : { minWidth: larguraMinima(TRILHAS, VAO) }} />
  return (
    <AnaliseCard
      titulo="Serviços emergenciais"
      periodo={periodo}
      unidade="pedidos no mesmo dia da saída"
      valor={int(dados.total)}
      sub={`de ${int(dados.de)} serviços · ${dec(dados.percentual, 1)}%`}
      extra={<Podio top3={dados.top3} />}
      tabela={mobile ? tabela : <Rolagem rotulo="Ranking mensal de clientes emergenciais" alturaMax={344}>{tabela}</Rolagem>}
    />
  )
}
