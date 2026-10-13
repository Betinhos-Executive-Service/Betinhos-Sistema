import { gravarBandeira, gravarInteiro, gravarInteiros, gravarTexto, lerBandeira, lerInteiro, lerInteiros, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import { EMPTY_FILTERS, type Filters, type Periodo, type ReciboFiltro } from './filters'

const PERIODOS: readonly Periodo[] = ['30', '90', '365', 'all']
const RECIBOS: readonly ReciboFiltro[] = ['enviado', 'nao-enviado']

/** Filtros dos Pagantes na URL: `q`, `periodo`, `status`, `forma`, `recibo`, `falhas`. */
export const pagantesQuery: QueryCodec<Filters> = {
  chaves: ['q', 'periodo', 'status', 'forma', 'recibo', 'falhas'],
  ler: (q) => ({
    query: q.get('q') ?? '',
    periodo: lerOpcao(q, 'periodo', PERIODOS, EMPTY_FILTERS.periodo),
    status: lerInteiros(q, 'status') ?? [],
    forma: lerInteiro(q, 'forma'),
    recibo: RECIBOS.find((item) => item === q.get('recibo')) ?? null,
    falhas: lerBandeira(q, 'falhas'),
  }),
  gravar: (f) => ({
    q: gravarTexto(f.query),
    periodo: gravarTexto(f.periodo, EMPTY_FILTERS.periodo),
    status: gravarInteiros(f.status),
    forma: gravarInteiro(f.forma),
    recibo: f.recibo,
    falhas: gravarBandeira(f.falhas),
  }),
}
