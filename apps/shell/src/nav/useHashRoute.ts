import { useSyncExternalStore } from 'react'

// WebResource não aceita rotas por path; a rota vive no hash (#/id-do-item).
function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function routeFromHash(hash: string) {
  return decodeURIComponent(hash.replace(/^#\/?/, ''))
}

export function hrefFor(id: string) {
  return `#/${encodeURIComponent(id)}`
}

export function useHashRoute() {
  return useSyncExternalStore(subscribe, () => routeFromHash(location.hash))
}
