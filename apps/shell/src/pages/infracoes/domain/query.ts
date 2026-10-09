import { gravarBandeira, gravarInteiro, gravarInteiros, gravarTexto, lerBandeira, lerInteiro, lerInteiros, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import { EMPTY_FILTERS, type Filters, type Situacao } from './filters'

const SITUACOES: readonly Situacao[] = ['ativas', 'inativas', 'todas']

/** Filtros das Infrações na URL: `q`, `gravidade`, `competencia`, `responsabilidade`, `situacao`, `multas`. */
export const infracoesQuery: QueryCodec<Filters> = {
  chaves: ['q', 'gravidade', 'competencia', 'responsabilidade', 'situacao', 'multas'],
  ler: (q) => ({
    query: q.get('q') ?? '',
    gravidade: lerInteiros(q, 'gravidade') ?? [],
    competencia: lerInteiro(q, 'competencia'),
    responsabilidade: lerInteiro(q, 'responsabilidade'),
    situacao: lerOpcao(q, 'situacao', SITUACOES, EMPTY_FILTERS.situacao),
    comMultas: lerBandeira(q, 'multas'),
  }),
  gravar: (f) => ({
    q: gravarTexto(f.query),
    gravidade: gravarInteiros(f.gravidade),
    competencia: gravarInteiro(f.competencia),
    responsabilidade: gravarInteiro(f.responsabilidade),
    situacao: gravarTexto(f.situacao, EMPTY_FILTERS.situacao),
    multas: gravarBandeira(f.comMultas),
  }),
}
