import { lerDia, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import type { FiltrosDespesaProprios } from '../components/abas/DespesasTab'
import type { FrotaMotorista } from '../components/abas/MotoristasTab'
import { atalho } from './periodo'
import type { Atalho, Filtros } from './types'

const ATALHOS: readonly Atalho[] = ['hoje', 'ult7', 'ult30', 'esteMes', 'mesAnt', 'esteAno', 'anoAnt', 'personalizado']
const FROTAS: readonly FrotaMotorista[] = ['todos', 'proprios', 'terceiros']

/**
 * Filtros do Dashboard na URL: `periodo` (atalho; "Este ano" é o padrão e não aparece), `de`/`ate` (só no período personalizado)
 * e uma ocorrência por valor em `status`, `cliente`, `motorista` e `tipo`. Os atalhos relativos são recalculados com o relógio da página.
 */
export function dashboardQuery(now: Date): QueryCodec<Filtros> {
  return {
    chaves: ['periodo', 'de', 'ate', 'status', 'cliente', 'motorista', 'tipo'],
    ler: (q) => {
      const escolhido = lerOpcao(q, 'periodo', ATALHOS, 'esteAno')
      const inicio = lerDia(q, 'de')
      const fim = lerDia(q, 'ate')
      const segmentos = { status: q.getAll('status'), clientes: q.getAll('cliente'), motoristas: q.getAll('motorista'), tipos: q.getAll('tipo') }
      if (escolhido === 'personalizado' && inicio && fim && inicio <= fim) return { atalho: escolhido, inicio, fim, ...segmentos }
      const relativo = escolhido === 'personalizado' ? 'esteAno' : escolhido
      return { atalho: relativo, ...atalho(relativo, now), ...segmentos }
    },
    gravar: (f) => ({
      periodo: f.atalho === 'esteAno' ? null : f.atalho,
      de: f.atalho === 'personalizado' ? f.inicio : null,
      ate: f.atalho === 'personalizado' ? f.fim : null,
      status: f.status,
      cliente: f.clientes,
      motorista: f.motoristas,
      tipo: f.tipos,
    }),
  }
}

/** Filtros próprios da aba Despesas: uma ocorrência por valor em `categoria`, `forma` e `empresa`. */
export const despesasQuery: QueryCodec<FiltrosDespesaProprios> = {
  chaves: ['categoria', 'forma', 'empresa'],
  ler: (q) => ({ categorias: q.getAll('categoria'), formas: q.getAll('forma'), empresas: q.getAll('empresa') }),
  gravar: (f) => ({ categoria: f.categorias, forma: f.formas, empresa: f.empresas }),
}

/** Filtro Todos | Próprios | Terceiros do ranking de Motoristas: `frota=proprios`. */
export const lerFrotaMotorista = (q: URLSearchParams) => lerOpcao(q, 'frota', FROTAS, 'todos')
