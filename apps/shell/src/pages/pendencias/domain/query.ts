import { gravarTexto, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import { EMPTY_FILTERS, TIPOS, type Filters, type Periodo } from './filters'
import type { TipoPendencia } from './types'

const PERIODOS: readonly Periodo[] = ['30', '90', '365', 'all']

/** Filtros das Pendências na URL: `q`, `periodo`, `tipos` (lista separada por vírgula; valor desconhecido é ignorado). */
export const pendenciasQuery: QueryCodec<Filters> = {
  chaves: ['q', 'periodo', 'tipos'],
  ler: (q) => ({
    q: q.get('q') ?? '',
    periodo: lerOpcao(q, 'periodo', PERIODOS, EMPTY_FILTERS.periodo),
    tipos: (q.get('tipos') ?? '').split(',').map((t) => t.trim()).filter((t): t is TipoPendencia => (TIPOS as string[]).includes(t)),
  }),
  gravar: (f) => ({ q: gravarTexto(f.q), periodo: gravarTexto(f.periodo, EMPTY_FILTERS.periodo), tipos: f.tipos.length ? f.tipos.join(',') : null }),
}
