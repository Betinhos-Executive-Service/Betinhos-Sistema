import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import type { Source } from './data/source'
import { applyPatch } from './domain/status'
import type { ChoiceSet, Contato, Pagante } from './domain/types'

type State = { list: Pagante[]; choices: ChoiceSet | null; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga por período, contatos em segundo plano e mudança de status otimista com rollback. */
export function usePagantes(source: Source, since: Date | null) {
  const [state, setState] = useState<State>({ list: [], choices: null, loading: true, error: null })
  const [contatos, setContatos] = useState(() => new Map<string, Contato>())
  const [overrides, setOverrides] = useState(() => new Map<string, Partial<Pagante>>())
  const token = useRef(0)
  const sinceKey = since?.getTime() ?? null

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [list, choices] = await Promise.all([source.load(sinceKey == null ? null : new Date(sinceKey)), source.choices()])
      if (current !== token.current) return
      setState({ list, choices, loading: false, error: null })
      setOverrides(new Map())
      // Contato só enriquece busca e WhatsApp: falha aqui não bloqueia a lista.
      source.contatos(list.map((p) => p.pessoaId)).then((map) => { if (current === token.current) setContatos(map) }, () => undefined)
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source, sinceKey])

  useEffect(() => { void reload() }, [reload])

  const update = useCallback(async (id: string, payload: Row) => {
    const patch = applyPatch(payload)
    setOverrides((map) => new Map(map).set(id, { ...map.get(id), ...patch }))
    try {
      await source.update(id, payload)
      setState((s) => ({ ...s, list: s.list.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
    } finally {
      setOverrides((map) => { const next = new Map(map); next.delete(id); return next })
    }
  }, [source])

  const list = useMemo(
    () => (overrides.size ? state.list.map((p) => (overrides.has(p.id) ? { ...p, ...overrides.get(p.id) } : p)) : state.list),
    [state.list, overrides],
  )
  return { ...state, list, contatos, reload, update }
}
