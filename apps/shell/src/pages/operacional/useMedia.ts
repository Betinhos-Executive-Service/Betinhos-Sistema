import { useCallback, useSyncExternalStore } from 'react'

/** Media query reativa (ex.: '(min-width: 860px)'). */
export function useMedia(query: string) {
  const subscribe = useCallback((notify: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', notify)
    return () => list.removeEventListener('change', notify)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
