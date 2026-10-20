import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { Comunicado, Motorista } from './domain/comunicados'

type State = {
  items: Comunicado[]
  motoristas: Motorista[]
  /** `false` até a primeira carga terminar. */
  loaded: boolean
  loading: boolean
  error: string | null
}
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Comunicados e motoristas aptos, com token contra respostas fora de ordem. */
export function useComunicados(source: Source) {
  const [state, setState] = useState<State>({ items: [], motoristas: [], loaded: false, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [items, motoristas] = await Promise.all([source.comunicados(), source.motoristas()])
      if (current === token.current) setState({ items, motoristas, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current === token.current) setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  return { ...state, reload }
}
