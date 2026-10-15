// useDocumentos.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocsSource } from './data/source'
import type { DocsData } from './domain/types'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

type Estado = { data: DocsData | null; loading: boolean; error: string | null }

/**
 * Carga de tipos, donos, documentos e destinatários.
 * Trocar de `source` descarta dados e erro antigos e invalida respostas em voo do source anterior.
 * Recarregar o mesmo source mantém a carga anterior se a nova falhar.
 */
export function useDocumentos(source: DocsSource | null) {
  const [state, setState] = useState<Estado>({ data: null, loading: Boolean(source), error: null })
  const token = useRef(0)

  const carregar = useCallback(async (alvo: DocsSource) => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await alvo.carregar()
      if (current === token.current) setState({ data, loading: false, error: null })
    } catch (reason) {
      if (current === token.current) setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [])

  useEffect(() => {
    token.current++
    if (!source) {
      setState({ data: null, loading: false, error: null })
      return
    }
    setState({ data: null, loading: true, error: null })
    void carregar(source)
  }, [source, carregar])

  const reload = useCallback(async () => {
    if (source) await carregar(source)
  }, [source, carregar])

  return { ...state, reload }
}
