import { useCallback, useEffect, useRef, useState } from 'react'
import type { LookupOption } from '../domain/types'

const SEARCH_DELAY_MS = 250

/** Busca de opções de lookup no servidor: espera a pausa na digitação e descarta respostas de buscas já superadas. */
export function useLookupSearch(search: (text: string) => Promise<LookupOption[]>) {
  const [found, setFound] = useState<LookupOption[] | null>(null)
  const [searching, setSearching] = useState(false)
  const timerRef = useRef(0)
  const tokenRef = useRef(0)
  const searchRef = useRef(search)
  searchRef.current = search

  /** Cancela busca pendente e volta às opções iniciais. */
  const reset = useCallback(() => {
    window.clearTimeout(timerRef.current)
    tokenRef.current += 1
    setSearching(false)
    setFound(null)
  }, [])
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const onSearch = useCallback((typed: string) => {
    window.clearTimeout(timerRef.current)
    const run = () => {
      const token = ++tokenRef.current
      setSearching(true)
      searchRef.current(typed).then(
        (list) => { if (token === tokenRef.current) { setFound(list); setSearching(false) } },
        () => { if (token === tokenRef.current) setSearching(false) },
      )
    }
    // Campo vazio busca já (lista inicial); digitando, espera a pausa.
    if (typed.trim() === '') { run(); return }
    setSearching(true)
    timerRef.current = window.setTimeout(run, SEARCH_DELAY_MS)
  }, [])

  return { found, searching, onSearch, reset }
}
