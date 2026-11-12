import type { QueryCodec } from '../../../../nav/queryState'
import type { Filtros } from './regras'

const inteiro = (q: URLSearchParams, k: string) => { const v = q.get(k); const n = Number(v); return v && Number.isInteger(n) ? n : null }
const dia = (q: URLSearchParams, k: string) => { const v = q.get(k) ?? ''; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '' }

/** Filtros da fila Compras sem despesa na URL, com prefixo `cc-` (a lista de despesas usa `q`, `motorista` e `f` para os dela). */
export const filtrosCodec: QueryCodec<Filtros> = {
  chaves: ['cc-q', 'cc-cartao', 'cc-motorista', 'cc-canal', 'cc-situacao', 'cc-de', 'cc-ate'],
  ler: (q) => ({
    busca: q.get('cc-q') ?? '', cartaoId: q.get('cc-cartao') || null, motoristaId: q.get('cc-motorista') || null,
    canal: inteiro(q, 'cc-canal'), situacao: inteiro(q, 'cc-situacao'), de: dia(q, 'cc-de'), ate: dia(q, 'cc-ate'),
  }),
  gravar: (f) => ({
    'cc-q': f.busca.trim() ? f.busca : null, 'cc-cartao': f.cartaoId, 'cc-motorista': f.motoristaId, 'cc-canal': f.canal == null ? null : String(f.canal),
    'cc-situacao': f.situacao == null ? null : String(f.situacao), 'cc-de': f.de || null, 'cc-ate': f.ate || null,
  }),
}
