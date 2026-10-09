import { gravarInteiro, gravarTexto, lerInteiro, type QueryCodec } from '../../../nav/queryState'
import type { Filters } from './funnel'

/** Filtros dos Currículos na URL: `q`, `cargo`, `cnh`, `origem`, `nota`. */
export const curriculosQuery: QueryCodec<Filters> = {
  chaves: ['q', 'cargo', 'cnh', 'origem', 'nota'],
  ler: (q) => ({ query: q.get('q') ?? '', cargo: q.get('cargo') || null, cnh: lerInteiro(q, 'cnh'), origem: lerInteiro(q, 'origem'), notaMin: lerInteiro(q, 'nota') }),
  gravar: (f) => ({ q: gravarTexto(f.query), cargo: f.cargo, cnh: gravarInteiro(f.cnh), origem: gravarInteiro(f.origem), nota: gravarInteiro(f.notaMin) }),
}
