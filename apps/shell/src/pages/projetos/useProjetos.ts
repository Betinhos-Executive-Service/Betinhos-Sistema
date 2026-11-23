import { useCallback, useEffect, useRef, useState } from 'react'
import type { Carga, Source } from './data/source'
import type { Atualizacao, Etapa, Projeto } from './domain/types'

type State = Carga & {
  /** `false` até a primeira carga terminar. */
  loaded: boolean
  loading: boolean
  error: string | null
}
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const byNome = (a: Projeto, b: Projeto) => a.nome.localeCompare(b.nome, 'pt-BR')
const trocar = <T extends { id: string }>(lista: T[], item: T) => (lista.some((x) => x.id === item.id) ? lista.map((x) => (x.id === item.id ? item : x)) : [...lista, item])

/** Projetos, etapas e atualizações carregados juntos, com token contra respostas fora de ordem; upserts refletem o que foi salvo sem recarregar. */
export function useProjetos(source: Source) {
  const [state, setState] = useState<State>({ projetos: [], etapas: [], atualizacoes: [], loaded: false, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const c = await source.load()
      if (current !== token.current) return
      setState({ projetos: [...c.projetos].sort(byNome), etapas: c.etapas, atualizacoes: c.atualizacoes, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  // Gravação local vence uma recarga em voo (a resposta dela pode ser anterior ao que foi salvo).
  const upsert = useCallback((p: Projeto) => {
    token.current += 1
    setState((s) => ({ ...s, loading: false, projetos: trocar(s.projetos, p).sort(byNome) }))
  }, [])

  const upsertEtapa = useCallback((e: Etapa) => {
    token.current += 1
    setState((s) => ({ ...s, loading: false, etapas: trocar(s.etapas, e) }))
  }, [])

  const addAtualizacao = useCallback((a: Atualizacao) => {
    token.current += 1
    setState((s) => ({ ...s, loading: false, atualizacoes: trocar(s.atualizacoes, a) }))
  }, [])

  return { ...state, reload, upsert, upsertEtapa, addAtualizacao }
}
