import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { OperacionalData, Reserva } from './domain/types'
import { applyOverrides, changedIds, keepPending, previousFields, revertPatch, type Overrides } from './domain/refresh'

const REFRESH_MS = 60_000
type State = {
  data: OperacionalData | null
  loading: boolean
  error: string | null
  refreshing: boolean
  refreshFailed: boolean
  lastUpdated: Date | null
  changed: Set<string>
}
const initial: State = { data: null, loading: true, error: null, refreshing: false, refreshFailed: false, lastUpdated: null, changed: new Set() }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carrega o dia, atualiza a cada 60 s só com a aba visível e aplica mutações otimistas com rollback. */
export function useOperacional(source: Source, key: string) {
  const [state, setState] = useState<State>(initial)
  const [overrides, setOverrides] = useState<Overrides>(() => new Map())
  const overridesRef = useRef<Overrides>(overrides) // espelho síncrono do estado, para calcular antes de aplicar
  const pending = useRef(new Map<string, number>()) // mutações em voo por reserva
  const token = useRef(0)
  const commit = useCallback((next: Overrides) => { overridesRef.current = next; setOverrides(next) }, [])

  const refresh = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const data = await source.load(key)
      if (current !== token.current) return // resposta de um dia que já não está na tela
      setState((s) => ({ data, loading: false, error: null, refreshing: false, refreshFailed: false, lastUpdated: new Date(), changed: changedIds(s.data?.reservas ?? [], data.reservas) }))
      commit(keepPending(overridesRef.current, pending.current)) // mutação em voo mantém o override
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, refreshing: false, refreshFailed: true, error: s.data ? null : message(reason) }))
    }
  }, [source, key, commit])

  useEffect(() => { setState(initial); void refresh() }, [refresh])
  useEffect(() => () => { token.current++ }, []) // descarta respostas depois de desmontar

  useEffect(() => {
    const whenVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(whenVisible, REFRESH_MS)
    document.addEventListener('visibilitychange', whenVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', whenVisible) }
  }, [refresh])

  const mutate = useCallback(async (reservaId: string, patch: Partial<Reserva>, run: () => Promise<void>) => {
    const before = previousFields(overridesRef.current, reservaId, patch)
    pending.current.set(reservaId, (pending.current.get(reservaId) ?? 0) + 1)
    commit(new Map(overridesRef.current).set(reservaId, { ...overridesRef.current.get(reservaId), ...patch }))
    const settle = () => pending.current.set(reservaId, (pending.current.get(reservaId) ?? 1) - 1)
    try {
      await run()
    } catch (reason) {
      settle()
      commit(revertPatch(overridesRef.current, reservaId, patch, before)) // só os campos deste patch
      throw reason
    }
    settle()
    void refresh() // o override fica até uma carga que comece depois da escrita
  }, [commit, refresh])

  const reservas = useMemo(() => (state.data ? applyOverrides(state.data.reservas, overrides) : []), [state.data, overrides])
  return { ...state, reservas, refresh, mutate }
}
