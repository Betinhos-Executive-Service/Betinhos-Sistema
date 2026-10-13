// useDocumentos.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocsSource } from './data/source'
import type { DocsData } from './domain/types'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga única de tipos, donos, documentos e destinatários; token contra respostas fora de ordem. Mantém a carga anterior se a nova falhar. */
export function useDocumentos(source: DocsSource | null) {
  const [state, setState] = useState<{ data: DocsData | null; loading: boolean; error: string | null }>({ data: null, loading: Boolean(source), error: null })
  const token = useRef(0)
  const reload = useCallback(async () => {
    if (!source) return
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await source.carregar()
      if (current === token.current) setState({ data, loading: false, error: null })
    } catch (reason) {
      if (current === token.current) setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])
  useEffect(() => { void reload() }, [reload])
  return { ...state, reload }
}
