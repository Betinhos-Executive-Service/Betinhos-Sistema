import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { OperacionalData, Reserva } from './domain/types'
import { applyOverrides, changedIds } from './domain/refresh'

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
  const [overrides, setOverrides] = useState(() => new Map<string, Partial<Reserva>>())
  const token = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const data = await source.load(key)
      if (current !== token.current) return // resposta de um dia que já não está na tela
      setState((s) => ({ data, loading: false, error: null, refreshing: false, refreshFailed: false, lastUpdated: new Date(), changed: changedIds(s.data?.reservas ?? [], data.reservas) }))
      setOverrides(new Map())
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, refreshing: false, refreshFailed: true, error: s.data ? null : message(reason) }))
    }
  }, [source, key])

  useEffect(() => { setState(initial); void refresh() }, [refresh])

  useEffect(() => {
    const whenVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(whenVisible, REFRESH_MS)
    document.addEventListener('visibilitychange', whenVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', whenVisible) }
  }, [refresh])

  const mutate = useCallback(async (reservaId: string, patch: Partial<Reserva>, run: () => Promise<void>) => {
    setOverrides((map) => new Map(map).set(reservaId, { ...map.get(reservaId), ...patch }))
    try {
      await run()
    } catch (reason) {
      setOverrides((map) => { const next = new Map(map); next.delete(reservaId); return next })
      throw reason
    }
  }, [])

  const reservas = useMemo(() => (state.data ? applyOverrides(state.data.reservas, overrides) : []), [state.data, overrides])
  return { ...state, reservas, refresh, mutate }
}
