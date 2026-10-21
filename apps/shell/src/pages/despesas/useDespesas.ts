import { useCallback } from 'react'
import type { ListCache } from '../../app/listCache'
import { useProgressiveData } from '../../app/useProgressiveData'
import type { Source } from './data/source'
import type { Despesa, DespesaChoices } from './domain/types'

type Data = { list: Despesa[]; choices: DespesaChoices }
const EMPTY: Despesa[] = []

/** Carga por período com a primeira página antes e cache por período; a recarga mais recente vence. */
export function useDespesas(source: Source, since: Date | null, cache: ListCache) {
  const sinceKey = since?.getTime() ?? null
  const load = useCallback(async (partial: (data: Data) => void) => {
    const choices = source.choices()
    const list = await source.load(sinceKey == null ? null : new Date(sinceKey), (first) => { choices.then((c) => partial({ list: first, choices: c }), () => undefined) })
    return { list, choices: await choices }
  }, [source, sinceKey])
  const { data, complete, loading, error, reload } = useProgressiveData<Data>({ cache, key: `despesas:${sinceKey ?? 'all'}`, group: 'despesas:', load })
  return { list: data?.list ?? EMPTY, choices: data?.choices ?? null, complete, loading, error, reload }
}
