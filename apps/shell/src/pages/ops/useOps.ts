import { useCallback, useRef } from 'react'
import type { ListCache } from '../../app/listCache'
import { useProgressiveData } from '../../app/useProgressiveData'
import type { Source } from './data/source'
import { OP_STATUS } from './domain/status'
import type { Op, OpChoices } from './domain/types'

type Data = { list: Op[]; choices: OpChoices }
const EMPTY: Op[] = []

/**
 * Carga por período (primeira página antes, valores dos serviços por último), cache por período e cancelamento;
 * a recarga mais recente vence.
 */
export function useOps(source: Source, since: Date | null, cache: ListCache) {
  // Cancelamentos confirmados: uma recarga iniciada antes deles não traz o status antigo de volta.
  const cancelled = useRef(new Map<string, number>())
  const sinceKey = since?.getTime() ?? null

  const load = useCallback(async (partial: (data: Data) => void) => {
    const reconcile = (list: Op[]) => {
      if (!cancelled.current.size) return list
      const now = Date.now()
      return list.map((op) => {
        const at = cancelled.current.get(op.id)
        if (at == null) return op
        if (now - at > 120_000 || (op.alteradoEm && op.alteradoEm.getTime() >= at - 5_000)) { cancelled.current.delete(op.id); return op }
        return { ...op, status: OP_STATUS.cancelada }
      })
    }
    const choices = source.choices()
    const list = await source.load(sinceKey == null ? null : new Date(sinceKey), (rows) => { choices.then((c) => partial({ list: reconcile(rows), choices: c }), () => undefined) })
    return { list: reconcile(list), choices: await choices }
  }, [source, sinceKey])
  const { data, complete, loading, error, reload, mutate } = useProgressiveData<Data>({ cache, key: `ops:${sinceKey ?? 'all'}`, group: 'ops:', load })

  const cancel = useCallback(async (id: string) => {
    await source.cancel(id)
    const at = Date.now()
    cancelled.current.set(id, at)
    mutate((d) => ({ ...d, list: d.list.map((op) => (op.id === id ? { ...op, status: OP_STATUS.cancelada, alteradoEm: new Date(at) } : op)) }))
  }, [source, mutate])

  return { list: data?.list ?? EMPTY, choices: data?.choices ?? null, complete, loading, error, reload, cancel }
}
