import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import { detectarPendencias } from './domain/detect'
import type { Pendencia } from './domain/types'

type State = { list: Pendencia[]; loaded: boolean; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga por período e detecção das pendências; a recarga mais recente vence. */
export function usePendencias(source: Source, since: Date | null) {
  const [state, setState] = useState<State>({ list: [], loaded: false, loading: true, error: null })
  const token = useRef(0)
  const sinceKey = since?.getTime() ?? null

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { ops, reservas, pagantes } = await source.load(sinceKey == null ? null : new Date(sinceKey))
      if (current !== token.current) return
      setState({ list: detectarPendencias(ops, reservas, pagantes), loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source, sinceKey])

  useEffect(() => { void reload() }, [reload])

  return { ...state, reload }
}
