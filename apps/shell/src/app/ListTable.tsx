import { Table, type TableProps } from '@betinhos/ui'
import { BrandLoader } from './BrandLoader'

/**
 * `Table` do DS como as listas do shell usam: virtualização acima de 100 linhas (rola no `main`), barra horizontal presa ao
 * pé da tela, colunas da visão que encolhem para caber (`view.fit`) e o loader da marca na primeira carga. Todo o
 * comportamento é do DS (§10.9); aqui só ficam os padrões das listas.
 */
export function ListTable<Row>({ loadingLabel = 'Carregando a lista', view, ...props }: TableProps<Row> & { loadingLabel?: string }) {
  return (
    <Table
      virtual
      stickyScrollbar
      loadingContent={<BrandLoader variant="inline" label={loadingLabel} text={`${loadingLabel}…`} />}
      view={view ? { ...view, fit: true } : undefined}
      {...props}
    />
  )
}
