import { useMemo, useSyncExternalStore } from 'react'

// WebResource não aceita rotas por path; a rota vive no hash (#/id-do-item?chave=valor).
// O id (sem a query) identifica a tela no menu; a query guarda o estado da tela (ex.: a aba ativa).
const EVENTO_QUERY = 'bt:hashquery'

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener(EVENTO_QUERY, onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener(EVENTO_QUERY, onChange)
  }
}

/** Separa o hash em id da tela e query (`#/dashboard?tab=servicos` → `dashboard` + `tab=servicos`). */
export function parseHash(hash: string) {
  const raw = hash.replace(/^#\/?/, '')
  const i = raw.indexOf('?')
  return { id: decodeURIComponent(i < 0 ? raw : raw.slice(0, i)), query: new URLSearchParams(i < 0 ? '' : raw.slice(i + 1)) }
}

/** Id da tela no hash, sem a query: é o que o menu e o `findItem` conhecem. */
export function routeFromHash(hash: string) {
  return parseHash(hash).id
}

export function hrefFor(id: string) {
  return `#/${encodeURIComponent(id)}`
}

export function useHashRoute() {
  return useSyncExternalStore(subscribe, () => routeFromHash(location.hash))
}

/** Query do hash da tela atual; muda com `setHashQuery` ou com a navegação. */
export function useHashQuery() {
  const texto = useSyncExternalStore(subscribe, () => parseHash(location.hash).query.toString())
  return useMemo(() => new URLSearchParams(texto), [texto])
}

/** Troca a query do hash sem recarregar nem criar entrada no histórico; o id da tela continua o mesmo. */
export function setHashQuery(params: URLSearchParams | Record<string, string>) {
  const { id } = parseHash(location.hash)
  const query = new URLSearchParams(params).toString()
  history.replaceState(history.state, '', `${hrefFor(id)}${query ? `?${query}` : ''}`)
  window.dispatchEvent(new Event(EVENTO_QUERY))
}
