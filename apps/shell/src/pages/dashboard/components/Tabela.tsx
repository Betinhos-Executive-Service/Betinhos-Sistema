import { Table, type TableProps } from '@betinhos/ui'

/** Tabela do dashboard: densa (linha de 44 px) acima de 820 px, para os cards não crescerem além do conteúdo; no celular, `dashboard.css` reduz a linha. */
export function Tabela<Row>(props: TableProps<Row>) {
  return <Table density="dense" {...props} />
}
