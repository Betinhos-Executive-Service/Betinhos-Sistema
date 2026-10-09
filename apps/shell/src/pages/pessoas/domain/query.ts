import { gravarBandeira, gravarInteiro, gravarInteiros, gravarTexto, lerBandeira, lerInteiro, lerInteiros, type QueryCodec } from '../../../nav/queryState'
import type { Filters } from './filters'

/** Filtros das Pessoas na URL: `q`, `cliente`, `classificacao`, `idioma`, `status`, `duplicados`. */
export const pessoasQuery: QueryCodec<Filters> = {
  chaves: ['q', 'cliente', 'classificacao', 'idioma', 'status', 'duplicados'],
  ler: (q) => ({
    query: q.get('q') ?? '',
    clienteId: q.get('cliente') || null,
    classificacao: lerInteiros(q, 'classificacao') ?? [],
    idioma: lerInteiro(q, 'idioma'),
    status: lerInteiro(q, 'status'),
    duplicados: lerBandeira(q, 'duplicados'),
  }),
  gravar: (f) => ({
    q: gravarTexto(f.query),
    cliente: f.clienteId,
    classificacao: gravarInteiros(f.classificacao),
    idioma: gravarInteiro(f.idioma),
    status: gravarInteiro(f.status),
    duplicados: gravarBandeira(f.duplicados),
  }),
}
