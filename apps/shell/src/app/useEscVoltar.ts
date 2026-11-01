import { useEffect, useRef } from 'react'

/**
 * Esc fora de um campo de texto chama `voltar` (a tela decide se pergunta "Descartar alterações?").
 * Pausado enquanto um diálogo da própria tela está aberto, para o Esc fechar só o diálogo.
 */
export function useEscVoltar(voltar: () => void, pausado: boolean) {
  const atual = useRef(voltar)
  atual.current = voltar
  useEffect(() => {
    if (pausado) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      // Sem isto o Chromium trata o mesmo Esc como pedido de fechar o diálogo que acabou de abrir (close watcher).
      event.preventDefault()
      atual.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pausado])
}
