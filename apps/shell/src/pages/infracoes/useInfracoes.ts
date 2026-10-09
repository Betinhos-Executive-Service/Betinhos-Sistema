import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import { byCodigo } from './domain/filters'
import type { Infracao, MultaUso } from './domain/types'

type State = {
  list: Infracao[]
  /** `false` até a primeira carga do catálogo terminar. */
  loaded: boolean
  multas: MultaUso[]
  loading: boolean
  error: string | null
  /** Falha só no uso: o catálogo continua utilizável. */
  multasError: string | null
}
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Catálogo e uso carregados juntos, com token contra respostas fora de ordem; `upsert` reflete o que foi salvo sem recarregar. */
export function useInfracoes(source: Source) {
  const [state, setState] = useState<State>({ list: [], loaded: false, multas: [], loading: true, error: null, multasError: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    const [list, multas] = await Promise.allSettled([source.load(), source.multas()])
    if (current !== token.current) return
    setState((s) => ({
      list: list.status === 'fulfilled' ? [...list.value].sort(byCodigo) : s.list,
      loaded: s.loaded || list.status === 'fulfilled',
      multas: multas.status === 'fulfilled' ? multas.value : s.multas,
      loading: false,
      error: list.status === 'rejected' ? message(list.reason) : null,
      multasError: multas.status === 'rejected' ? message(multas.reason) : null,
    }))
  }, [source])

  useEffect(() => { void reload() }, [reload])

  const upsert = useCallback((i: Infracao) => setState((s) => ({
    ...s,
    list: (s.list.some((x) => x.id === i.id) ? s.list.map((x) => (x.id === i.id ? i : x)) : [...s.list, i]).sort(byCodigo),
  })), [])

  return { ...state, reload, upsert }
}
