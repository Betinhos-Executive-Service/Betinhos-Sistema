// domain/query.ts
import { gravarTexto, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import { KPIS, type FiltroCentral } from './pendencias'
import type { Categoria } from './types'

const ABAS: readonly Categoria[] = ['pessoas', 'frota']
export const FILTRO_PADRAO: FiltroCentral = { aba: 'pessoas', kpi: null, tipo: null, q: '' }

/** Estado da central na URL: `#/documentos?aba=frota&kpi=vencido&tipo=<id>&q=abc`. */
export const documentosQuery: QueryCodec<FiltroCentral> = {
  chaves: ['aba', 'kpi', 'tipo', 'q'],
  ler: (q) => ({
    aba: lerOpcao(q, 'aba', ABAS, 'pessoas'),
    kpi: KPIS.find((k) => k === q.get('kpi')) ?? null,
    tipo: q.get('tipo') || null,
    q: q.get('q') ?? '',
  }),
  gravar: (f) => ({ aba: gravarTexto(f.aba, 'pessoas'), kpi: f.kpi, tipo: f.tipo, q: gravarTexto(f.q) }),
}
