import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { ChoiceSet, Pessoa } from './domain/types'

type State = { list: Pessoa[]; choices: ChoiceSet | null; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga única com token contra respostas fora de ordem; `upsert` reflete o que foi salvo sem recarregar. */
export function usePessoas(source: Source) {
  const [state, setState] = useState<State>({ list: [], choices: null, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [list, choices] = await Promise.all([source.load(), source.choices()])
      if (current !== token.current) return
      setState({ list, choices, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  const upsert = useCallback((p: Pessoa) => setState((s) => ({
    ...s,
    list: s.list.some((x) => x.id === p.id) ? s.list.map((x) => (x.id === p.id ? p : x)) : [p, ...s.list],
  })), [])

  return { ...state, reload, upsert }
}
