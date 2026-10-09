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

export function useHashRoute() {
  return useSyncExternalStore(subscribe, () => routeFromHash(location.hash))
}
