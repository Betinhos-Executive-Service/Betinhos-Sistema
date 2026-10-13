import { gravarInteiros, gravarTexto, lerInteiros, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import { ALERTAS, EMPTY_FILTERS, type Alerta, type Filters, type Periodo } from './filters'

const PERIODOS: readonly Periodo[] = ['30', '90', '365', 'all']

/** Filtros das Despesas na URL: `q`, `periodo`, `operacional`, `financeiro`, `alertas` e uma ocorrência por id em `categoria` e `motorista`. */
export const despesasQuery: QueryCodec<Filters> = {
  chaves: ['q', 'periodo', 'operacional', 'financeiro', 'categoria', 'motorista', 'alertas'],
  ler: (q) => ({
    query: q.get('q') ?? '',
    periodo: lerOpcao(q, 'periodo', PERIODOS, EMPTY_FILTERS.periodo),
    operacional: lerInteiros(q, 'operacional') ?? [],
    financeiro: lerInteiros(q, 'financeiro') ?? [],
    categoria: q.getAll('categoria'),
    motorista: q.getAll('motorista'),
    alertas: ALERTAS.map((a) => a.value).filter((valor): valor is Alerta => (q.get('alertas') ?? '').split(',').includes(valor)),
  }),
  gravar: (f) => ({
    q: gravarTexto(f.query),
    periodo: gravarTexto(f.periodo, EMPTY_FILTERS.periodo),
    operacional: gravarInteiros(f.operacional),
    financeiro: gravarInteiros(f.financeiro),
    categoria: f.categoria,
    motorista: f.motorista,
    alertas: f.alertas.length ? f.alertas.join(',') : null,
  }),
}
