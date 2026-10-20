import { useCallback, useEffect, useRef, useState } from 'react'
import { LIST_TTL, type ListCache } from './listCache'

type Options<V> = {
  cache: ListCache
  /** Chave da variante carregada (ex.: `ops:90`); trocar de chave usa a cópia dela ou carrega. */
  key: string
  /** Carga completa; `partial` mostra antes o que já chegou (a primeira página). */
  load: (partial: (value: V) => void) => Promise<V>
  ttl?: number
  /** Prefixo das variantes (ex.: `ops:`): uma gravação descarta as cópias das outras. */
  group?: string
}

type State<V> = {
  /** Chave a que `data` pertence (trocar de período mantém a lista anterior até chegar a nova). */
  key: string
  data: V | null
  /** A carga completa chegou: totais, ordenação e filtros valem para o conjunto todo. */
  complete: boolean
  loading: boolean
  error: string | null
}

type Mutation<V> = { seq: number; fn: (value: V) => V }

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/**
 * Carga de uma lista com primeira página rápida, cache em memória e stale-while-revalidate:
 * - com cópia válida no cache, mostra e não vai ao servidor; vencida, mostra e revalida em segundo plano;
 * - sem cópia, mostra cada parcial (`partial`) e depois o conjunto todo;
 * - a carga mais recente vence (resposta antiga é descartada) e erro no meio mantém o que já apareceu;
 * - `mutate` reflete uma gravação na tela e no cache, inclusive sobre cargas que começaram antes dela.
 */
export function useProgressiveData<V>({ cache, key, load, ttl = LIST_TTL, group }: Options<V>) {
  const [state, setState] = useState<State<V>>(() => {
    const entry = cache.get<V>(key)
    return entry ? { key, data: entry.value, complete: true, loading: !cache.isFresh(entry, ttl), error: null } : { key, data: null, complete: false, loading: true, error: null }
  })
  const latest = useRef({ key, load })
  latest.current = { key, load }
  const token = useRef(0)
  const seq = useRef(0)
  const mutations = useRef<Mutation<V>[]>([])

  const run = useCallback(async () => {
    const current = ++token.current
    const startSeq = seq.current
    const { key: runKey, load: runLoad } = latest.current
    // Gravações feitas depois do início valem também sobre o que esta carga trouxer.
    const apply = (value: V) => mutations.current.filter((m) => m.seq > startSeq).reduce((acc, m) => m.fn(acc), value)
    let settled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const value = await runLoad((partial) => {
        if (settled || current !== token.current) return
        // Revalidação de uma lista que já está inteira na tela: a parcial a encolheria; espera a carga completa.
        setState((s) => (s.complete && s.key === runKey ? s : { ...s, key: runKey, data: apply(partial), complete: false }))
      })
      settled = true
      if (current !== token.current) return
      const final = apply(value)
      cache.set(runKey, final)
      mutations.current = mutations.current.filter((m) => m.seq > startSeq)
      setState({ key: runKey, data: final, complete: true, loading: false, error: null })
    } catch (reason) {
      settled = true
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [cache])

  useEffect(() => {
    const entry = cache.get<V>(key)
    if (entry) {
      setState({ key, data: entry.value, complete: true, loading: false, error: null })
      if (cache.isFresh(entry, ttl)) { token.current++; return }
    } else {
      // Outra chave sem cópia (ex.: outro período): a lista anterior fica até a nova chegar, mas sem valer como completa.
      setState((s) => (s.key === key ? s : { ...s, complete: false }))
    }
    void run()
  }, [cache, key, ttl, run])

  const mutate = useCallback((fn: (value: V) => V) => {
    mutations.current.push({ seq: ++seq.current, fn })
    setState((s) => (s.data == null || s.key !== latest.current.key ? s : { ...s, data: fn(s.data) }))
    const { key: currentKey } = latest.current
    cache.update(currentKey, fn)
    if (group) cache.invalidate(group, currentKey)
  }, [cache, group])

  return { ...state, reload: run, mutate }
}
