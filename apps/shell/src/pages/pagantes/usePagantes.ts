import { useCallback, useMemo, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import type { ListCache } from '../../app/listCache'
import { useProgressiveData } from '../../app/useProgressiveData'
import type { Source } from './data/source'
import { applyPatch } from './domain/status'
import type { ChoiceSet, Contato, Pagante } from './domain/types'

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

type Data = {
  list: Pagante[]
  choices: ChoiceSet
  /** O período chegou inteiro (os contatos podem ainda estar carregando). */
  listComplete: boolean
  contatos: Map<string, Contato>
  contatosError: string | null
}
const EMPTY_LIST: Pagante[] = []
const EMPTY_CONTATOS = new Map<string, Contato>()

/**
 * Carga por período com a primeira página antes, contatos em segundo plano (falha só avisa), cache por período e
 * mudança de status otimista com rollback.
 */
export function usePagantes(source: Source, since: Date | null, cache: ListCache) {
  const [overrides, setOverrides] = useState(() => new Map<string, Partial<Pagante>>())
  // Gravações confirmadas: uma recarga iniciada antes delas não pode trazer o status antigo de volta.
  const confirmed = useRef(new Map<string, { at: number; patch: Partial<Pagante> }>())
  const sinceKey = since?.getTime() ?? null

  const load = useCallback(async (partial: (data: Data) => void) => {
    const choicesP = source.choices()
    const first = await source.load(sinceKey == null ? null : new Date(sinceKey), (rows) => {
      choicesP.then((choices) => partial({ list: reconcile(rows, confirmed.current), choices, listComplete: false, contatos: EMPTY_CONTATOS, contatosError: null }), () => undefined)
    })
    const choices = await choicesP
    const list = reconcile(first, confirmed.current)
    partial({ list, choices, listComplete: true, contatos: EMPTY_CONTATOS, contatosError: null })
    // Contato só enriquece busca e WhatsApp: falha aqui avisa, mas não bloqueia a lista.
    try {
      return { list, choices, listComplete: true, contatos: await source.contatos(list.map((p) => p.pessoaId)), contatosError: null }
    } catch (reason) {
      return { list, choices, listComplete: true, contatos: EMPTY_CONTATOS, contatosError: message(reason) }
    }
  }, [source, sinceKey])
  const key = `pagantes:${sinceKey ?? 'all'}`
  const { data, key: dataKey, complete, loading, error, reload, mutate } = useProgressiveData<Data>({ cache, key, group: 'pagantes:', load })

  const update = useCallback(async (id: string, payload: Row) => {
    const patch = applyPatch(payload)
    setOverrides((map) => new Map(map).set(id, { ...map.get(id), ...patch }))
    try {
      await source.update(id, payload)
      confirmed.current.set(id, { at: Date.now(), patch })
      mutate((d) => ({ ...d, list: d.list.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
    } finally {
      setOverrides((map) => { const next = new Map(map); next.delete(id); return next })
    }
  }, [source, mutate])

  const base = data?.list ?? EMPTY_LIST
  const list = useMemo(
    () => (overrides.size ? base.map((p) => (overrides.has(p.id) ? { ...p, ...overrides.get(p.id) } : p)) : base),
    [base, overrides],
  )
  return {
    list, choices: data?.choices ?? null, loading, error, reload, update,
    /** Período inteiro na tela: totais e filtros valem para todos (`complete` inclui os contatos). */
    listComplete: complete || (dataKey === key && Boolean(data?.listComplete)),
    contatos: data?.contatos ?? EMPTY_CONTATOS, contatosError: data?.contatosError ?? null,
  }
}
