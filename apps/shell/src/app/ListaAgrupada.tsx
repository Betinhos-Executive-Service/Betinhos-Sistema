import { useMemo, type ReactNode } from 'react'
import { TableGroups, groupRows, type FilterField, type RowGroup, type ViewGroup } from '@betinhos/ui'
import { LazyFooter, useLazySlice } from './LazyList'
import './ListaAgrupada.css'

/** Grupos da lista (§10.9.1) sobre a lista inteira já filtrada e buscada; lista vazia volta ao estado vazio (`null`). */
export function useRowGroups<Row>(visible: Row[], group: ViewGroup | null | undefined, fields: FilterField[], read: (row: Row, key: string) => unknown): RowGroup<Row>[] | null {
  return useMemo(() => {
    const found = groupRows(visible, group, fields, read)
    return found?.length ? found : null
  }, [visible, group, fields, read])
}

type Props<Row> = {
  groups: RowGroup<Row>[]
  /** Campo e período do agrupamento: muda e todos os grupos voltam a fechar. */
  group: ViewGroup | null | undefined
  /** Filtros, busca e ordenação: muda e a rolagem dos cartões de cada grupo volta ao primeiro lote. */
  lazyKey: unknown
  pending?: boolean
  /** Cartões do grupo no celular; sem eles, a tabela também serve no celular. */
  cards?: (rows: Row[]) => ReactNode
  /** Tabela de um grupo (virtualizada acima de 100 linhas). Dentro de `TableGroups`, `selection` ganha `all` e `scope` sozinho. */
  table: (rows: Row[]) => ReactNode
  /** Total da lista inteira; sai da tabela e fica abaixo dos grupos (no celular, não aparece). */
  footer: ReactNode
  mobile?: boolean
}

/** Lista agrupada: um cabeçalho por grupo (rótulo e contagem) que abre só a tabela ou os cartões dele. */
export function ListaAgrupada<Row>({ groups, group, lazyKey, pending = false, cards, table, footer, mobile = false }: Props<Row>) {
  const asCards = mobile && cards
  return (
    <>
      <TableGroups groups={groups} resetKey={JSON.stringify(group)} counting={pending}>
        {(rows) => (asCards ? <GroupCards rows={rows} resetKey={lazyKey} pending={pending} cards={cards} /> : table(rows))}
      </TableGroups>
      {mobile ? null : <div className="lista-agrupada__total">{footer}</div>}
    </>
  )
}

/** Cartões de um grupo aberto no celular: a mesma rolagem infinita da lista, por grupo. */
function GroupCards<Row>({ rows, resetKey, pending, cards }: { rows: Row[]; resetKey: unknown; pending: boolean; cards: (rows: Row[]) => ReactNode }) {
  const { slice, more, loadMore } = useLazySlice(rows, resetKey)
  return <>
    {cards(slice)}
    <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} pending={pending} />
  </>
}
