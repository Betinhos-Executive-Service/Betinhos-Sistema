// Porte de Tela Planner/src/quotes/quoteViewPreference.js (sem mudança de comportamento).
const VIEW_KEY = 'betinhos-quotes-hybrid-v3-view'

export type QuoteView = 'list' | 'kanban'
export interface PreferenceStorage {
  getItem(key: string): unknown
  setItem(key: string, value: string): unknown
}

export function readQuoteViewPreference(storage?: PreferenceStorage | null): QuoteView {
  try {
    return (storage ?? globalThis.localStorage)?.getItem(VIEW_KEY) === 'list' ? 'list' : 'kanban'
  } catch {
    return 'kanban'
  }
}

export function saveQuoteViewPreference(view: string, storage?: PreferenceStorage | null): void {
  if (view !== 'list' && view !== 'kanban') return
  try {
    (storage ?? globalThis.localStorage)?.setItem(VIEW_KEY, view)
  } catch {
    // A preferência é opcional quando o armazenamento está indisponível.
  }
}
