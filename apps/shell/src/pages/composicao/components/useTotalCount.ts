import { useEffect, useState } from 'react'
import { countCompositions } from '../data/dataverse'
import type { ViewQuery } from '../data/views'

/** Total real da consulta no Dataverse; null enquanto calcula ou quando a view não permite contar. */
export function useTotalCount(view: ViewQuery | undefined, enabled: boolean, refreshKey: number) {
  const [total, setTotal] = useState<number | null>(null)
  // Só zera quando a consulta muda; numa releitura (refreshKey) o total anterior fica até chegar o novo, sem piscar.
  useEffect(() => { setTotal(null) }, [enabled, view])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void countCompositions(view).then((value) => { if (alive) setTotal(value) })
    return () => { alive = false }
  }, [enabled, refreshKey, view])
  return total
}
