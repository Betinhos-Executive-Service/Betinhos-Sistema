import { useCallback, useEffect, useRef, useState } from 'react'
import type { Carga, Source } from './data/source'
import type { Linha, PortalConfig, Validador } from './domain/types'

type State = Carga & { loaded: boolean; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Linhas, clientes e validadores carregados juntos, com token contra respostas fora de ordem; gravações refletem sem recarregar. */
export function useValidacoes(source: Source) {
  const [state, setState] = useState<State>({ linhas: [], clientes: [], validadores: [], configs: [], loaded: false, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const c = await source.load()
      if (current !== token.current) return
      setState({ ...c, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  // Gravação local vence uma recarga em voo (a resposta dela pode ser anterior ao que foi salvo).
  const patchLinhas = useCallback((ids: string[], patch: Partial<Linha>) => {
    token.current += 1
    const alvo = new Set(ids)
    setState((s) => ({ ...s, loading: false, linhas: s.linhas.map((l) => (alvo.has(l.id) ? { ...l, ...patch } : l)) }))
  }, [])

  const upsertValidador = useCallback((v: Validador) => {
    token.current += 1
    setState((s) => ({ ...s, loading: false, validadores: s.validadores.some((x) => x.id === v.id) ? s.validadores.map((x) => (x.id === v.id ? v : x)) : [...s.validadores, v] }))
  }, [])

  const upsertConfig = useCallback((config: PortalConfig) => {
    token.current += 1
    setState((s) => ({
      ...s, loading: false,
      configs: s.configs.some((c) => c.cliente.id === config.cliente.id) ? s.configs.map((c) => (c.cliente.id === config.cliente.id ? config : c)) : [...s.configs, config],
    }))
  }, [])

  return { ...state, reload, patchLinhas, upsertValidador, upsertConfig }
}
