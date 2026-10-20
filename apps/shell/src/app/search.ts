import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeSearch } from '@betinhos/ui'
import { searchTerms } from './pagedLoad'

/** Texto que só muda depois de `delay` ms sem mudar (a busca filtra quando a pessoa para de digitar). */
export function useDebouncedText(value: string, delay = 200) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    // Limpar a busca vale na hora: não há o que esperar para mostrar a lista inteira.
    if (!value) { setDebounced(''); return }
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return value ? debounced : ''
}

/** Palavras normalizadas da busca (minúsculas, sem acento). */
export const searchWords = (query: string) => normalizeSearch(query).split(/\s+/).filter(Boolean)

/**
 * Texto normalizado de cada linha, calculado uma vez por lista (não a cada tecla).
 * Criar dentro de `useMemo([lista])`: a lista nova (recarga, gravação) refaz o índice.
 */
export function keywordIndex<T extends object>(text: (row: T) => string) {
  const cache = new WeakMap<T, string>()
  const of = (row: T) => {
    let value = cache.get(row)
    if (value === undefined) {
      value = normalizeSearch(text(row))
      cache.set(row, value)
    }
    return value
  }
  return { of, matches: (row: T, words: string[]) => !words.length || words.every((w) => of(row).includes(w)) }
}

type ServerSearch<T> = {
  /** Busca já com debounce. */
  query: string
  /** Só busca no servidor enquanto a lista não carregou inteira. */
  enabled: boolean
  search: ((query: string) => Promise<T[]>) | undefined
}

/**
 * Busca no servidor enquanto a carga completa não chega: o que bate aparece já, mesmo fora da primeira página.
 * Resposta de uma busca antiga (a pessoa continuou digitando) é descartada.
 */
export function useServerSearch<T>({ query, enabled, search }: ServerSearch<T>) {
  const [rows, setRows] = useState<T[]>([])
  const latest = useRef(search)
  latest.current = search
  const active = enabled && Boolean(search) && searchTerms(query).length > 0
  useEffect(() => {
    if (!active) { setRows([]); return }
    let cancelled = false
    latest.current!(query).then((found) => { if (!cancelled) setRows(found) }, () => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [active, query])
  return active ? rows : EMPTY
}

const EMPTY: never[] = []

/** Lista com as linhas extras (busca no servidor) que ainda não estão nela, sem repetir id. */
export function useMergedById<T extends { id: string }>(list: T[], extras: T[]) {
  return useMemo(() => {
    if (!extras.length) return list
    const ids = new Set(list.map((row) => row.id))
    const missing = extras.filter((row) => !ids.has(row.id))
    return missing.length ? [...list, ...missing] : list
  }, [list, extras])
}
