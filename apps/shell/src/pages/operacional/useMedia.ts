import { useSyncExternalStore } from 'react'

/** Media query reativa (ex.: '(min-width: 860px)'). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => { const list = window.matchMedia(query); list.addEventListener('change', notify); return () => list.removeEventListener('change', notify) },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
