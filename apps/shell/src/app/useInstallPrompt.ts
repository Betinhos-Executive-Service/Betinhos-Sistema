import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & { prompt: () => Promise<unknown> }

/**
 * Instalação do app (Chrome/Edge): devolve a ação quando o navegador oferece instalar.
 * No iPhone não há evento; a instalação é por Compartilhar > Adicionar à Tela de Início.
 */
export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (incoming: Event) => {
      incoming.preventDefault()
      setEvent(incoming as InstallPromptEvent)
    }
    const onInstalled = () => setEvent(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!event) return null
  return () => {
    void event.prompt()
    setEvent(null)
  }
}
