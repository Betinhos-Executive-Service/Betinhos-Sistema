import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { Dados } from './domain/types'

export const INTERVALO_MS = 60_000

type Estado = { chave: string; dados: Dados | null; carregando: boolean; erro: string | null; atualizadoEm: Date | null }
const mensagem = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga por janela, recarga a cada 60 s com a aba visível e proteção contra resposta fora de ordem. */
export function useDashboard(source: Source, desde: string, ate: string) {
  const chave = `${desde}|${ate}`
  const [estado, setEstado] = useState<Estado>({ chave: '', dados: null, carregando: true, erro: null, atualizadoEm: null })
  const token = useRef(0)
  const ultima = useRef(0)

  const atualizar = useCallback(async () => {
    const atual = ++token.current
    setEstado((s) => ({ ...s, carregando: true, erro: null }))
    try {
      const dados = await source.carregar(desde, ate)
      if (atual !== token.current) return
      ultima.current = Date.now()
      setEstado({ chave, dados, carregando: false, erro: null, atualizadoEm: new Date() })
    } catch (reason) {
      if (atual !== token.current) return
      setEstado((s) => ({ ...s, carregando: false, erro: mensagem(reason) }))
    }
  }, [source, desde, ate, chave])

  useEffect(() => { void atualizar() }, [atualizar])

  useEffect(() => {
    const visivel = () => document.visibilityState === 'visible'
    const id = window.setInterval(() => { if (visivel()) void atualizar() }, INTERVALO_MS)
    const aoVoltar = () => { if (visivel() && Date.now() - ultima.current >= INTERVALO_MS) void atualizar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [atualizar])

  return { dados: estado.chave === chave ? estado.dados : null, carregando: estado.carregando, erro: estado.erro, atualizadoEm: estado.atualizadoEm, atualizar }
}
