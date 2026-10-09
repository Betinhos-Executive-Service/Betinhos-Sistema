import { useCallback, useMemo, useState } from 'react'
import { patchHashQuery, readHashQuery, useHashQuery, type QueryPatch } from './useHashRoute'

// Estado das telas na query do hash (#/pagantes?q=ana&status=1,2&pagina=2&abrir=<id>): recarregar, voltar ou
// compartilhar o link reabre a tela do mesmo jeito. Valor padrão não vai para a URL, para o link ficar curto.

/** Leitura: `null` = parâmetro ausente (vale o padrão da tela). */
export const lerTexto = (q: URLSearchParams, chave: string) => q.get(chave)

export function lerInteiro(q: URLSearchParams, chave: string): number | null {
  const bruto = q.get(chave)
  if (bruto == null || bruto.trim() === '') return null
  const n = Number(bruto)
  return Number.isInteger(n) ? n : null
}

/** Lista de inteiros separados por vírgula; `status=` (vazio) é lista vazia, parâmetro ausente é `null`. */
export function lerInteiros(q: URLSearchParams, chave: string): number[] | null {
  const bruto = q.get(chave)
  if (bruto == null) return null
  return bruto.split(',').map((item) => item.trim()).filter((item) => item !== '').map(Number).filter(Number.isInteger)
}

export const lerBandeira = (q: URLSearchParams, chave: string) => q.get(chave) === '1'

/** Valor da URL só vale se estiver entre os permitidos; senão cai no padrão. */
export function lerOpcao<T extends string>(q: URLSearchParams, chave: string, permitidos: readonly T[], padrao: T): T {
  const bruto = q.get(chave)
  return permitidos.find((item) => item === bruto) ?? padrao
}

/** Data `AAAA-MM-DD` válida (rejeita 2026-02-31) ou `null`. */
export function lerDia(q: URLSearchParams, chave: string): string | null {
  const bruto = q.get(chave)
  if (!bruto || !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return null
  const d = new Date(`${bruto}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== bruto ? null : bruto
}

/** Escrita: devolve `null` (sai da URL) quando o valor é o padrão. */
export const gravarTexto = (valor: string, padrao = '') => (valor.trim() !== '' && valor !== padrao ? valor : null)
export const gravarInteiro = (valor: number | null, padrao: number | null = null) => (valor != null && valor !== padrao ? String(valor) : null)
export const gravarBandeira = (valor: boolean) => (valor ? '1' : null)
/** Lista vazia some da URL; só quando o padrão da tela não é vazio é que "nenhum" precisa ficar explícito (`status=`). */
export function gravarInteiros(valor: readonly number[], padrao: readonly number[] = []) {
  if (valor.length === padrao.length && valor.every((item, i) => item === padrao[i])) return null
  return valor.join(',')
}

/** Como uma tela lê e grava seus filtros: `chaves` lista todos os parâmetros dela e `gravar` informa cada um (`null` apaga). */
export type QueryCodec<F> = { chaves: readonly string[]; ler(q: URLSearchParams): F; gravar(filtros: F): QueryPatch }

/**
 * Filtros guardados na URL. `semente` entra na URL na abertura da tela, quando a URL não traz nenhum filtro dela
 * (ex.: a última visão usada). Trocar os filtros volta a lista para a página 1.
 */
export function useQueryFilters<F>(codec: QueryCodec<F>, semente?: () => F) {
  // Roda uma vez, antes da primeira leitura da URL: sem filtro na URL, grava a semente em silêncio. É idempotente (vale no StrictMode).
  useState(() => {
    const q = readHashQuery()
    if (!semente || codec.chaves.some((chave) => q.has(chave))) return null
    patchHashQuery(codec.gravar(semente()), { silent: true })
    return null
  })
  const query = useHashQuery()
  // Só os parâmetros dos filtros entram na dependência: mudar a página ou a ficha aberta não recalcula a lista.
  const assinatura = codec.chaves.map((chave) => query.getAll(chave).join('\u0001')).join('\u0002')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtros = useMemo(() => codec.ler(query), [codec, assinatura])
  const alterar = useCallback((proximo: F) => patchHashQuery({ ...codec.gravar(proximo), pagina: null }), [codec])
  return [filtros, alterar] as const
}

/** Página da lista (`pagina=2`); a primeira não aparece na URL. */
export function useQueryPagina() {
  const query = useHashQuery()
  const pagina = Math.max(1, lerInteiro(query, 'pagina') ?? 1)
  const alterar = useCallback((proxima: number) => patchHashQuery({ pagina: proxima > 1 ? String(proxima) : null }), [])
  return [pagina, alterar] as const
}

/** Um id simples na URL (ficha ou serviço aberto): `chave=<id>`. */
export function useQueryId(chave: string) {
  const query = useHashQuery()
  const id = query.get(chave) || null
  const alterar = useCallback((proximo: string | null) => patchHashQuery({ [chave]: proximo }), [chave])
  return [id, alterar] as const
}

/** Gaveta de cadastro: ver (`ver=<id>`), editar (`editar=<id>`) ou novo (`novo=1`). */
export type AlvoGaveta = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

export function useQueryAlvo() {
  const query = useHashQuery()
  const ver = query.get('ver')
  const editar = query.get('editar')
  const novo = query.get('novo') === '1'
  const alvo = useMemo<AlvoGaveta>(() => {
    if (editar) return { mode: 'edit', id: editar }
    if (ver) return { mode: 'view', id: ver }
    return novo ? { mode: 'create' } : null
  }, [ver, editar, novo])
  const alterar = useCallback((proximo: AlvoGaveta) => patchHashQuery({
    ver: proximo?.mode === 'view' ? proximo.id : null,
    editar: proximo?.mode === 'edit' ? proximo.id : null,
    novo: proximo?.mode === 'create' ? '1' : null,
  }), [])
  return [alvo, alterar] as const
}

/** Texto simples na URL (`q=ana`). Igual ao padrão sai da URL; com padrão não vazio, "vazio" fica explícito (`status=`). */
export function useQueryTexto(chave: string, padrao = '') {
  const query = useHashQuery()
  const valor = query.get(chave) ?? padrao
  const alterar = useCallback((proximo: string) => patchHashQuery({ [chave]: proximo === padrao ? null : proximo }), [chave, padrao])
  return [valor, alterar] as const
}

export type PeriodoDias = { de: string; ate: string }

/** Intervalo de datas na URL (`de=2026-01-01&ate=2026-03-31`); data ausente, inválida ou invertida cai no padrão. */
export function useQueryPeriodo(chaveDe: string, chaveAte: string, padrao: PeriodoDias) {
  const query = useHashQuery()
  const de = lerDia(query, chaveDe) ?? padrao.de
  const ate = lerDia(query, chaveAte) ?? padrao.ate
  const valido = de <= ate
  const periodo = useMemo<PeriodoDias>(() => (valido ? { de, ate } : { de: padrao.de, ate: padrao.ate }), [valido, de, ate, padrao.de, padrao.ate])
  const alterar = useCallback((proximo: PeriodoDias) => patchHashQuery({
    [chaveDe]: proximo.de === padrao.de ? null : proximo.de,
    [chaveAte]: proximo.ate === padrao.ate ? null : proximo.ate,
  }), [chaveDe, chaveAte, padrao.de, padrao.ate])
  return [periodo, alterar] as const
}

/** Liga/desliga simples na URL (`recolhido=1`); desligado é o padrão e some da URL. */
export function useQueryBandeira(chave: string) {
  const query = useHashQuery()
  const ligada = lerBandeira(query, chave)
  const alterar = useCallback((proximo: boolean) => patchHashQuery({ [chave]: proximo ? '1' : null }), [chave])
  return [ligada, alterar] as const
}

/**
 * Conjunto de itens abertos/expandidos (`linha=a&linha=b`). `alternar` lê a URL na hora; `manter` descarta os valores que não
 * existem mais (só chame com a lista já carregada: lista vazia não apaga nada).
 */
export function useQueryConjunto(chave: string) {
  const query = useHashQuery()
  const assinatura = query.getAll(chave).join('\u0001')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const valores = useMemo<ReadonlySet<string>>(() => new Set(query.getAll(chave)), [chave, assinatura])
  const alternar = useCallback((valor: string) => {
    const atual = readHashQuery().getAll(chave)
    patchHashQuery({ [chave]: atual.includes(valor) ? atual.filter((item) => item !== valor) : [...atual, valor] })
  }, [chave])
  const manter = useCallback((existentes: ReadonlySet<string>) => {
    const atual = readHashQuery().getAll(chave)
    const mantidos = atual.filter((item) => existentes.has(item))
    if (existentes.size > 0 && mantidos.length !== atual.length) patchHashQuery({ [chave]: mantidos })
  }, [chave])
  return { valores, alternar, manter }
}
