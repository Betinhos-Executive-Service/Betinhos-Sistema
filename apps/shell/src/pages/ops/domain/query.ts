import { gravarInteiros, gravarTexto, lerInteiros, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import { EMPTY_FILTERS, type Filters, type Periodo } from './filters'

const PERIODOS: readonly Periodo[] = ['30', '90', '365', 'all']

/** Filtros das Ordens de Pagamento na URL: `q`, `periodo`, `status`. */
export const opsQuery: QueryCodec<Filters> = {
  chaves: ['q', 'periodo', 'status'],
  ler: (q) => ({
    query: q.get('q') ?? '',
    periodo: lerOpcao(q, 'periodo', PERIODOS, EMPTY_FILTERS.periodo),
    status: lerInteiros(q, 'status') ?? [],
  }),
  gravar: (f) => ({ q: gravarTexto(f.query), periodo: gravarTexto(f.periodo, EMPTY_FILTERS.periodo), status: gravarInteiros(f.status) }),
}
