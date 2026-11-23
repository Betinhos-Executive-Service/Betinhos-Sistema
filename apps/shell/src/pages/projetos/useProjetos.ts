import { useCallback, useEffect, useRef, useState } from 'react'
import type { Carga, Source } from './data/source'
import type { Atualizacao, Projeto } from './domain/types'

type State = Carga & {
  /** `false` até a primeira carga terminar. */
  loaded: boolean
  loading: boolean
  error: string | null
}
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const byNome = (a: Projeto, b: Projeto) => a.nome.localeCompare(b.nome, 'pt-BR')

/** Projetos e atualizações carregados juntos, com token contra respostas fora de ordem; upserts refletem o que foi salvo sem recarregar. */
export function useProjetos(source: Source) {
  const [state, setState] = useState<State>({ projetos: [], atualizacoes: [], loaded: false, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const c = await source.load()
      if (current !== token.current) return
      setState({ projetos: [...c.projetos].sort(byNome), atualizacoes: c.atualizacoes, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  // Gravação local vence uma recarga em voo (a resposta dela pode ser anterior ao que foi salvo).
  const upsert = useCallback((p: Projeto) => {
    token.current += 1
    setState((s) => ({ ...s, loading: false, projetos: (s.projetos.some((x) => x.id === p.id) ? s.projetos.map((x) => (x.id === p.id ? p : x)) : [...s.projetos, p]).sort(byNome) }))
  }, [])

  const addAtualizacao = useCallback((a: Atualizacao) => {
    token.current += 1
    setState((s) => ({ ...s, loading: false, atualizacoes: [...s.atualizacoes.filter((x) => x.id !== a.id), a] }))
  }, [])

  return { ...state, reload, upsert, addAtualizacao }
}
