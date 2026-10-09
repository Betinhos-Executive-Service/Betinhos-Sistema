import { gravarBandeira, gravarInteiro, gravarInteiros, gravarTexto, lerBandeira, lerInteiro, lerInteiros, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import type { AlertKind } from './alerts'
import { DEFAULT_FILTERS, type Filters, type SortKey } from './filters'

const ORDENS: readonly SortKey[] = ['nome', 'funcao', 'status', 'cnh', 'aso', 'admissao']
const ALERTAS: readonly AlertKind[] = ['cnh', 'aso', 'aniversario']

/** Filtros dos Funcionários na URL: `q`, `status` (`status=` = nenhum), `funcao`, `empresa`, `vinculo`, `alerta`, `ordem`, `desc`. */
export const funcionariosQuery: QueryCodec<Filters> = {
  chaves: ['q', 'status', 'funcao', 'empresa', 'vinculo', 'alerta', 'ordem', 'desc'],
  ler: (q) => ({
    search: q.get('q') ?? '',
    status: lerInteiros(q, 'status') ?? DEFAULT_FILTERS.status,
    funcao: lerInteiro(q, 'funcao'),
    empresa: lerInteiro(q, 'empresa'),
    vinculo: lerInteiro(q, 'vinculo'),
    alerta: ALERTAS.find((item) => item === q.get('alerta')) ?? null,
    sort: lerOpcao(q, 'ordem', ORDENS, DEFAULT_FILTERS.sort),
    desc: lerBandeira(q, 'desc'),
  }),
  gravar: (f) => ({
    q: gravarTexto(f.search),
    status: gravarInteiros(f.status, DEFAULT_FILTERS.status),
    funcao: gravarInteiro(f.funcao),
    empresa: gravarInteiro(f.empresa),
    vinculo: gravarInteiro(f.vinculo),
    alerta: f.alerta,
    ordem: gravarTexto(f.sort, DEFAULT_FILTERS.sort),
    desc: gravarBandeira(f.desc),
  }),
}
