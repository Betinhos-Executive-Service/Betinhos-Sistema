import { hrefFor, parseHash } from '../../nav/useHashRoute'

/**
 * No Tela Planner o estado da tela (view, taskId, contactId, quoteId) vivia na query da página.
 * No shell ele vive na query do hash (`#/planner?view=quotes&quoteId=…`). Este adaptador expõe a
 * mesma forma de janela que `plannerUrl.ts` e o `usePlanner` esperam (location.search, history,
 * popstate), lendo e gravando no hash da rota atual.
 */
export interface PlannerNavigationWindow {
  location: { search: string; pathname: string; hash: string }
  history: { state: unknown; pushState(state: unknown, unused: string, url: string): void }
  addEventListener(type: 'popstate', listener: () => void): void
  removeEventListener(type: 'popstate', listener: () => void): void
}

/** `plannerUrlForState` guarda o estado em `data=`; no hash ele fica achatado (`view=…&quoteId=…`). */
export function flattenPlannerQuery(query: string): URLSearchParams {
  const params = new URLSearchParams(query)
  const data = new URLSearchParams((params.get('data') || '').replace(/^\?/, ''))
  params.delete('data')
  for (const [key, value] of data) params.set(key, value)
  return params
}

export function shellPlannerWindow(win: Window = window): PlannerNavigationWindow {
  return {
    get location() {
      const query = parseHash(win.location.hash).query.toString()
      return { search: query ? `?${query}` : '', pathname: '', hash: '' }
    },
    history: {
      get state() { return win.history.state },
      pushState(state, _unused, url) {
        const at = url.indexOf('?')
        const query = flattenPlannerQuery(at < 0 ? '' : url.slice(at + 1))
        const next = hrefFor(parseHash(win.location.hash).id, query)
        if (next !== win.location.hash) win.history.pushState(state, '', next)
      },
    },
    addEventListener(type, listener) { win.addEventListener(type, listener) },
    removeEventListener(type, listener) { win.removeEventListener(type, listener) },
  }
}
