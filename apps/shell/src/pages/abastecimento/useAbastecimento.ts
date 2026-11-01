import { useCallback, useEffect, useRef, useState } from 'react'
import type { Carga, Source } from './data/source'
import type { Abastecimento } from './domain/types'

type State = Carga & { loaded: boolean; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Abastecimentos, veículos e motoristas carregados juntos, com token contra respostas fora de ordem; importação e vínculo refletem sem recarregar. */
export function useAbastecimento(source: Source, since: Date | null) {
  const [state, setState] = useState<State>({ abastecimentos: [], veiculos: [], motoristas: [], aviso: null, loaded: false, loading: true, error: null })
  const token = useRef(0)
  const sinceMs = since?.getTime() ?? null

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const c = await source.load(sinceMs == null ? null : new Date(sinceMs))
      if (current !== token.current) return
      setState({ ...c, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source, sinceMs])

  useEffect(() => { void reload() }, [reload])

  // Gravação local vence uma recarga em voo (a resposta dela pode ser anterior ao que foi salvo).
  const acrescentar = useCallback((novos: Abastecimento[]) => {
    token.current += 1
    setState((s) => ({ ...s, loading: false, abastecimentos: [...s.abastecimentos, ...novos] }))
  }, [])

  const vincular = useCallback((id: string, veiculoId: string) => {
    token.current += 1
    setState((s) => {
      const v = s.veiculos.find((x) => x.id === veiculoId)
      return { ...s, loading: false, abastecimentos: s.abastecimentos.map((a) => (a.id === id && v ? { ...a, veiculoId: v.id, placa: v.placa } : a)) }
    })
  }, [])

  return { ...state, reload, acrescentar, vincular }
}
