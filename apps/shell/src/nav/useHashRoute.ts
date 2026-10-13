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

/** Query do hash da tela atual; muda com `setHashQuery` ou com a navegação. */
export function useHashQuery() {
  const texto = useSyncExternalStore(subscribe, () => parseHash(location.hash).query.toString())
  return useMemo(() => new URLSearchParams(texto), [texto])
}

/** Vírgula e dois-pontos são seguros na query do hash; deixá-los legíveis encurta os links (`status=0,2`, `registro=multa:id`). */
function serializar(query: URLSearchParams) {
  return query.toString().replace(/%2C/gi, ',').replace(/%3A/gi, ':')
}

function gravar(id: string, query: URLSearchParams, avisar: boolean) {
  const texto = serializar(query)
  const proximo = `${hrefFor(id)}${texto ? `?${texto}` : ''}`
  if (proximo === location.hash) return
  history.replaceState(history.state, '', proximo)
  if (avisar) window.dispatchEvent(new Event(EVENTO_QUERY))
}

/** Troca a query do hash sem recarregar nem criar entrada no histórico; o id da tela continua o mesmo. */
export function setHashQuery(params: URLSearchParams | Record<string, string>) {
  gravar(parseHash(location.hash).id, new URLSearchParams(params), true)
}

/** Query do hash lida na hora (não do último render): várias alterações no mesmo tick se acumulam em vez de se sobrescrever. */
export function readHashQuery() {
  return parseHash(location.hash).query
}

/** `null`/`undefined` remove o parâmetro; lista grava um valor por ocorrência (`cliente=A&cliente=B`); o resto da query fica como está. */
export type QueryPatch = Record<string, string | readonly string[] | null | undefined>

/**
 * Mescla `patch` na query do hash atual. `silent` grava sem avisar quem escuta: só para semear a URL
 * durante a primeira renderização da tela (um aviso ali atualizaria outros componentes no meio do render).
 */
export function patchHashQuery(patch: QueryPatch, options: { silent?: boolean } = {}) {
  const { id, query } = parseHash(location.hash)
  for (const [chave, valor] of Object.entries(patch)) {
    query.delete(chave)
    if (valor == null) continue
    if (typeof valor === 'string') query.set(chave, valor)
    else for (const item of valor) query.append(chave, item)
  }
  gravar(id, query, !options.silent)
}
