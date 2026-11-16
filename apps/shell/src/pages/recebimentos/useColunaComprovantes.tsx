import { useCallback, useMemo, useState } from 'react'
import type { TableColumn, TableFilters, ViewConfig } from '@betinhos/ui'
import type { OpAberta } from './ComprovantesOpDrawer'
import { IndicadorRecebimentos } from './ComprovantesServicoDrawer'
import { COMPROVANTES_KEY, filtraComprovantes, temComprovante, usaComprovantes } from './colunaOp'
import type { RecebimentosSource } from './source'
import { useContagemRecebimentos } from './useContagemRecebimentos'

type Leitor<Row> = (row: Row, key: string) => unknown
const SEM_CONTAGEM = new Map<string, number>()

/**
 * Coluna Comprovantes das listas de OPs e Pagantes: contagem por OP, célula com o indicador, leitura para filtro e
 * agrupamento e a OP aberta no drawer. `opDe` precisa ter identidade estável (função de módulo).
 * No celular (cards, sem a coluna) só busca a contagem quando o filtro ou o agrupamento a usa.
 */
export function useColunaComprovantes<Row>(source: RecebimentosSource, config: ViewConfig, filters: TableFilters, rows: Row[], opDe: (row: Row) => OpAberta | null, mobile: boolean) {
  const filtra = filtraComprovantes(config, filters)
  const usa = filtra || (!mobile && usaComprovantes(config, filters))
  const opIds = useMemo(() => (usa ? [...new Set(rows.flatMap((row) => opDe(row)?.id ?? []))] : []), [usa, rows, opDe])
  const contagem = useContagemRecebimentos(source, opIds, 'op')
  const [aberta, setAberta] = useState<OpAberta | null>(null)
  const coluna = useMemo<TableColumn<Row>>(() => ({
    key: COMPROVANTES_KEY, header: 'Comprovantes', label: 'Comprovantes', defaultWidth: 150, width: 'minmax(110px, .6fr)',
    cell: (row) => {
      const op = opDe(row)
      return op ? <IndicadorRecebimentos quantidade={contagem.get(op.id.toLowerCase())} onClick={() => setAberta(op)} /> : null
    },
  }), [contagem, opDe])
  // Sem filtro nem agrupamento pela coluna, a leitura não muda a cada lote de contagem (não refaz o filtro da lista).
  const lida = filtra ? contagem : SEM_CONTAGEM
  const comLeitura = useCallback((base: Leitor<Row>): Leitor<Row> => (row, key) => {
    if (key !== COMPROVANTES_KEY) return base(row, key)
    const op = opDe(row)
    return op != null && temComprovante(lida, op.id)
  }, [lida, opDe])
  const fechar = useCallback(() => setAberta(null), [])
  return { coluna, comLeitura, aberta, fechar }
}
