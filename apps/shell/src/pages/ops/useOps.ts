import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import { OP_STATUS } from './domain/status'
import type { Op, OpChoices } from './domain/types'

type State = { list: Op[]; choices: OpChoices | null; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga por período e cancelamento; a recarga mais recente vence. */
export function useOps(source: Source, since: Date | null) {
  const [state, setState] = useState<State>({ list: [], choices: null, loading: true, error: null })
  const token = useRef(0)
  // Cancelamentos confirmados: uma recarga iniciada antes deles não traz o status antigo de volta.
  const cancelled = useRef(new Map<string, number>())
  const sinceKey = since?.getTime() ?? null

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [list, choices] = await Promise.all([source.load(sinceKey == null ? null : new Date(sinceKey)), source.choices()])
      if (current !== token.current) return
      const now = Date.now()
      const merged = list.map((op) => {
        const at = cancelled.current.get(op.id)
        if (at == null) return op
        if (now - at > 120_000 || (op.alteradoEm && op.alteradoEm.getTime() >= at - 5_000)) { cancelled.current.delete(op.id); return op }
        return { ...op, status: OP_STATUS.cancelada }
      })
      setState({ list: merged, choices, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source, sinceKey])

  useEffect(() => { void reload() }, [reload])

  const cancel = useCallback(async (id: string) => {
    await source.cancel(id)
    const at = Date.now()
    cancelled.current.set(id, at)
    setState((s) => ({ ...s, list: s.list.map((op) => (op.id === id ? { ...op, status: OP_STATUS.cancelada, alteradoEm: new Date(at) } : op)) }))
  }, [source])

  return { ...state, reload, cancel }
}
