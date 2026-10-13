import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { Despesa, DespesaChoices } from './domain/types'

type State = { list: Despesa[]; choices: DespesaChoices | null; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga por período; a recarga mais recente vence. */
export function useDespesas(source: Source, since: Date | null) {
  const [state, setState] = useState<State>({ list: [], choices: null, loading: true, error: null })
  const token = useRef(0)
  const sinceKey = since?.getTime() ?? null

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [list, choices] = await Promise.all([source.load(sinceKey == null ? null : new Date(sinceKey)), source.choices()])
      if (current !== token.current) return
      setState({ list, choices, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source, sinceKey])

  useEffect(() => { void reload() }, [reload])

  return { ...state, reload }
}
