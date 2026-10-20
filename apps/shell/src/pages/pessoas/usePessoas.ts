import { useCallback } from 'react'
import type { ListCache } from '../../app/listCache'
import { useProgressiveData } from '../../app/useProgressiveData'
import type { Source } from './data/source'
import type { ChoiceSet, Pessoa } from './domain/types'

type Data = { list: Pessoa[]; choices: ChoiceSet }
const EMPTY: Pessoa[] = []

/**
 * Cadastro com a primeira página antes do resto e cache por sessão (voltar à tela não recarrega dentro do TTL);
 * `upsert` reflete o que foi salvo na lista e no cache sem recarregar.
 */
export function usePessoas(source: Source, cache: ListCache) {
  const load = useCallback(async (partial: (data: Data) => void) => {
    const choices = source.choices()
    const list = await source.load((first) => { choices.then((c) => partial({ list: first, choices: c }), () => undefined) })
    return { list, choices: await choices }
  }, [source])
  const { data, complete, loading, error, reload, mutate } = useProgressiveData<Data>({ cache, key: 'pessoas', load })

  const upsert = useCallback((p: Pessoa) => mutate((d) => ({
    ...d,
    list: d.list.some((x) => x.id === p.id) ? d.list.map((x) => (x.id === p.id ? p : x)) : [p, ...d.list],
  })), [mutate])

  return { list: data?.list ?? EMPTY, choices: data?.choices ?? null, complete, loading, error, reload, upsert }
}
