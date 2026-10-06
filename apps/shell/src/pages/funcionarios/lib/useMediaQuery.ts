import { useSyncExternalStore } from 'react'

/** Breakpoint "mobile" do Betinhos Design System (até 820 px). */
export const MOBILE_QUERY = '(max-width: 820px)'

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia?.(query)
      media?.addEventListener('change', notify)
      return () => media?.removeEventListener('change', notify)
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY)
