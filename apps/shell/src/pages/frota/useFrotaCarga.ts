import { useCallback, useEffect, useState } from 'react'
import type { DataSource, LoadResult } from './data/source'
import { errorMessage } from './data/xrm'
import { liberarFlows } from './domain/transitions'

/** Carga das tabelas da Frota (a mesma da tela Frota e da ficha do veículo aberta em outra tela). Carrega ao montar. */
export function useFrotaCarga(source: DataSource) {
  const [result, setResult] = useState<LoadResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setFatal(null)
    try {
      setResult(await source.load())
      liberarFlows()
    } catch (reason) {
      setFatal(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  return { result, setResult, loading, fatal, reload }
}
