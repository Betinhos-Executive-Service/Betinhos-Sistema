import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { ChoiceSet, Curriculo } from './domain/types'

type State = { list: Curriculo[]; choices: ChoiceSet | null; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga única (lista + choices), mudanças otimistas com rollback e upsert após salvar. */
export function useCurriculos(source: Source) {
  const [state, setState] = useState<State>({ list: [], choices: null, loading: true, error: null })
  const [overrides, setOverrides] = useState(() => new Map<string, Partial<Curriculo>>())
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [list, choices] = await Promise.all([source.load(), source.choices()])
      if (current !== token.current) return
      setState({ list, choices, loading: false, error: null })
      setOverrides(new Map())
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  const mutate = useCallback(async (id: string, patch: Partial<Curriculo>, run: () => Promise<void>) => {
    setOverrides((map) => new Map(map).set(id, { ...map.get(id), ...patch }))
    try {
      await run()
      setState((s) => ({ ...s, list: s.list.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    } finally {
      setOverrides((map) => { const next = new Map(map); next.delete(id); return next })
    }
  }, [])

  const upsert = useCallback((c: Curriculo) => setState((s) => ({
    ...s,
    list: s.list.some((x) => x.id === c.id) ? s.list.map((x) => (x.id === c.id ? c : x)) : [c, ...s.list],
  })), [])

  const list = useMemo(
    () => (overrides.size ? state.list.map((c) => (overrides.has(c.id) ? { ...c, ...overrides.get(c.id) } : c)) : state.list),
    [state.list, overrides],
  )
  return { ...state, list, reload, mutate, upsert }
}
