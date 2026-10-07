import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import type { Source } from './data/source'
import { applyPatch } from './domain/status'
import type { ChoiceSet, Contato, Pagante } from './domain/types'

type State = { list: Pagante[]; choices: ChoiceSet | null; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/**
 * Linha lida antes da gravação confirmada (modifiedon mais antigo) recebe o patch; a lida depois
 * vence, mesmo com outro status (um flow ou outra pessoa pode ter mudado). Entradas vencem em 2 min.
 */
export function reconcile(list: Pagante[], confirmed: Map<string, { at: number; patch: Partial<Pagante> }>, now = Date.now()) {
  if (!confirmed.size) return list
  return list.map((p) => {
    const entry = confirmed.get(p.id)
    if (!entry) return p
    const serverIsNewer = p.alteradoEm != null && p.alteradoEm.getTime() >= entry.at - 5_000
    if (serverIsNewer || now - entry.at > 120_000) { confirmed.delete(p.id); return p }
    return { ...p, ...entry.patch }
  })
}

/** Carga por período, contatos em segundo plano e mudança de status otimista com rollback. */
export function usePagantes(source: Source, since: Date | null) {
  const [state, setState] = useState<State>({ list: [], choices: null, loading: true, error: null })
  const [contatos, setContatos] = useState(() => new Map<string, Contato>())
  const [contatosError, setContatosError] = useState<string | null>(null)
  const [overrides, setOverrides] = useState(() => new Map<string, Partial<Pagante>>())
  const token = useRef(0)
  // Gravações confirmadas: uma recarga iniciada antes delas não pode trazer o status antigo de volta.
  const confirmed = useRef(new Map<string, { at: number; patch: Partial<Pagante> }>())
  const sinceKey = since?.getTime() ?? null

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [list, choices] = await Promise.all([source.load(sinceKey == null ? null : new Date(sinceKey)), source.choices()])
      if (current !== token.current) return
      setState({ list: reconcile(list, confirmed.current), choices, loading: false, error: null })
      // Contato só enriquece busca e WhatsApp: falha aqui avisa, mas não bloqueia a lista.
      source.contatos(list.map((p) => p.pessoaId)).then(
        (map) => { if (current === token.current) { setContatos(map); setContatosError(null) } },
        (reason) => { if (current === token.current) setContatosError(message(reason)) },
      )
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
      confirmed.current.set(id, { at: Date.now(), patch })
      setState((s) => ({ ...s, list: s.list.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
    } finally {
      setOverrides((map) => { const next = new Map(map); next.delete(id); return next })
    }
  }, [source])

  const list = useMemo(
    () => (overrides.size ? state.list.map((p) => (overrides.has(p.id) ? { ...p, ...overrides.get(p.id) } : p)) : state.list),
    [state.list, overrides],
  )
  return { ...state, list, contatos, contatosError, reload, update }
}
