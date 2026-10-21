import { useCallback } from 'react'
import { listCache } from '../../app/listCache'
import { useProgressiveData } from '../../app/useProgressiveData'
import type { DataSource, LoadResult } from './data/source'
import { liberarFlows } from './domain/transitions'

/**
 * Carga das tabelas da Frota (a mesma da tela Frota e da ficha do veículo aberta em outra tela), em cache por sessão:
 * voltar à tela dentro do TTL não recarrega; vencida, mostra e revalida em segundo plano.
 */
export function useFrotaCarga(source: DataSource) {
  const load = useCallback(async () => {
    const result = await source.load()
    liberarFlows()
    return result
  }, [source])
  const { data, loading, error, reload, mutate } = useProgressiveData<LoadResult>({ cache: listCache(source), key: 'frota', load })
  /** Ajuste local (ex.: classificação de uma manutenção) na tela e no cache, sem recarregar tudo. */
  const setResult = useCallback((fn: (prev: LoadResult | null) => LoadResult | null) => mutate((prev) => fn(prev) ?? prev), [mutate])
  return { result: data, setResult, loading, fatal: error, reload }
}
