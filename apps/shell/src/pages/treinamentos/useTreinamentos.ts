import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { Linha } from './domain/lista'
import type { ProgressoConta } from './domain/tabela'
import { erroTexto, type Funcionario } from './domain/treinamentos'

type State = {
  items: Linha[]
  funcionarios: Funcionario[]
  /** Conclusões por treinamento; vazio enquanto carrega ou se a consulta falhar (a lista segue sem a barra). */
  progresso: Record<string, ProgressoConta>
  /** `false` até a primeira carga terminar. */
  loaded: boolean
  loading: boolean
  error: string | null
}

/** Treinamentos e funcionários, com token contra respostas fora de ordem. */
export function useTreinamentos(source: Source) {
  const [state, setState] = useState<State>({ items: [], funcionarios: [], progresso: {}, loaded: false, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      // O progresso é complemento da lista: se falhar, a tabela aparece sem a barra em vez de bloquear a carga.
      const [items, funcionarios, progresso] = await Promise.all([source.treinamentos(), source.funcionarios(), source.progresso().catch(() => ({}))])
      if (current === token.current) setState({ items, funcionarios, progresso, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current === token.current) setState((s) => ({ ...s, loading: false, error: erroTexto(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  /** Campo gravado inline (ex.: anexos): atualiza o item sem recarregar a lista. */
  const patch = useCallback((id: string, parcial: Partial<Linha>) => setState((s) => ({ ...s, items: s.items.map((t) => (t.id === id ? { ...t, ...parcial } : t)) })), [])

  return { ...state, reload, patch }
}
