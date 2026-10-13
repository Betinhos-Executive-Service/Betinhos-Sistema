import { useSyncExternalStore } from 'react'

// WebResource não aceita rotas por path; a rota vive no hash (#/id-do-item?chave=valor).
function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/** Id da rota: o hash sem `#/` e sem a query (`?…`). */
export function routeFromHash(hash: string) {
  return decodeURIComponent(hash.replace(/^#\/?/, '').replace(/\?.*$/s, ''))
}

/** Parâmetros da query do hash (`#/geral?view=a` → `view=a`); sem query, vazio. */
export function queryFromHash(hash: string) {
  const at = hash.indexOf('?')
  return new URLSearchParams(at < 0 ? '' : hash.slice(at + 1))
}

export function hrefFor(id: string, params?: URLSearchParams | Record<string, string>) {
  const query = params ? new URLSearchParams(params).toString() : ''
  return `#/${encodeURIComponent(id)}${query ? `?${query}` : ''}`
}

/**
 * Rota inicial vinda da query da página (`?data=geral` ou `?data=geral%3Fview%3Dx`), como o
 * sitemap do model-driven passa ao WebResource. Só vale quando ainda não há rota no hash.
 * Devolve o hash a aplicar ou null.
 */
export function hashFromSearch(search: string, hash: string) {
  if (routeFromHash(hash)) return null
  const data = new URLSearchParams(search).get('data')?.trim()
  if (!data) return null
  const [id, query] = data.replace(/^#?\/?/, '').split(/\?(.*)/s)
  if (!id) return null
  return hrefFor(id, query ? new URLSearchParams(query) : undefined)
}

/** Aplica `hashFromSearch` na janela sem recarregar nem criar entrada no histórico. */
export function applyRouteFromSearch(win: Pick<Window, 'location' | 'history'> = window) {
  const next = hashFromSearch(win.location.search, win.location.hash)
  if (next) win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}${next}`)
  return next
}

export function useHashRoute() {
  return useSyncExternalStore(subscribe, () => routeFromHash(location.hash))
}
