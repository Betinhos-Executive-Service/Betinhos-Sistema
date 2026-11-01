import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { Linha } from './domain/lista'
import { erroTexto, type Funcionario } from './domain/treinamentos'

type State = {
  items: Linha[]
  funcionarios: Funcionario[]
  /** `false` até a primeira carga terminar. */
  loaded: boolean
  loading: boolean
  error: string | null
}

/** Treinamentos e funcionários, com token contra respostas fora de ordem. */
export function useTreinamentos(source: Source) {
  const [state, setState] = useState<State>({ items: [], funcionarios: [], loaded: false, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [items, funcionarios] = await Promise.all([source.treinamentos(), source.funcionarios()])
      if (current === token.current) setState({ items, funcionarios, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current === token.current) setState((s) => ({ ...s, loading: false, error: erroTexto(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  /** Campo gravado inline (ex.: anexos): atualiza o item sem recarregar a lista. */
  const patch = useCallback((id: string, parcial: Partial<Linha>) => setState((s) => ({ ...s, items: s.items.map((t) => (t.id === id ? { ...t, ...parcial } : t)) })), [])

  return { ...state, reload, patch }
}
