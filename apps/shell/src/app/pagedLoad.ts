import { odataString, type DataverseClient, type Row } from '@betinhos/dataverse'

/** Linhas da primeira página, que aparecem antes da carga completa. */
export const FIRST_PAGE = 100

/**
 * Carga completa com a primeira página antes. A doc da Web API pede o mesmo `odata.maxpagesize` em todos os
 * `@odata.nextLink`, então não dá para começar com 100 e seguir com 5.000: a primeira página vai numa requisição
 * à parte, em paralelo com a carga completa (páginas padrão de 5.000). Se a completa chegar antes, a página é ignorada;
 * falha só da primeira página não importa (a completa decide).
 */
export function getAllWithFirstPage(client: DataverseClient, path: string, onFirstPage?: (rows: Row[]) => void): Promise<Row[]> {
  return withFirstPage(client.getAll(path), () => client.request<{ value: Row[] }>(path, { maxPageSize: FIRST_PAGE }).then((page) => page.value), onFirstPage)
}

/** O mesmo para qualquer fonte (ex.: `Xrm.WebApi`): `first` busca a primeira página em paralelo com `full`. */
export function withFirstPage<T, P>(full: Promise<T>, first: () => Promise<P>, onFirstPage?: (page: P) => void): Promise<T> {
  if (!onFirstPage) return full
  let settled = false
  full.then(() => { settled = true }, () => { settled = true })
  first().then((page) => { if (!settled) onFirstPage(page) }, () => undefined)
  return full
}

/** Linhas que batem com a busca, no máximo `top` (busca no servidor enquanto a lista ainda não carregou inteira). */
export async function searchRows(client: DataverseClient, path: string, top = 50) {
  const page = await client.request<{ value: Row[] }>(`${path}&$top=${top}`)
  return page.value
}

export type SearchFields = {
  /** Códigos e identificadores: `startswith` (usa índice). */
  startsWith?: string[]
  /** Texto em que a palavra pode estar no meio (nomes, listas de passageiros): `contains`. */
  contains?: string[]
}

/** Palavras da busca levadas ao servidor; no máximo 4, cada uma com 2 letras ou mais. */
export function searchTerms(query: string) {
  return query.trim().split(/\s+/).filter((w) => w.length >= 2).slice(0, 4)
}

/**
 * `$filter` da busca: cada palavra precisa aparecer em algum campo (E entre palavras, OU entre campos).
 * Aspas escapadas; sem palavra válida devolve null (não há o que buscar no servidor).
 */
export function odataSearchFilter(query: string, fields: SearchFields): string | null {
  const words = searchTerms(query)
  const starts = fields.startsWith ?? []
  const contains = fields.contains ?? []
  if (!words.length || !(starts.length + contains.length)) return null
  const clause = (word: string) => {
    const w = odataString(word)
    const parts = [...starts.map((f) => `startswith(${f},'${w}')`), ...contains.map((f) => `contains(${f},'${w}')`)]
    return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`
  }
  return words.map(clause).join(' and ')
}

/** Junta o filtro base da lista (ativos, período) com o da busca. */
export const andFilter = (base: string, extra: string | null) => (extra ? `${base} and ${extra}` : base)
