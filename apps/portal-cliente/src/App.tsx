import { useEffect, useState } from 'react'
import { BuildBadge, ToastProvider } from '@betinhos/ui'
import { ApiProvider } from './api/ApiContext'
import type { PortalApi } from './api/PortalApi'
import type { Sessao } from './domain/types'
import { Entrar } from './telas/Entrar'
import { Portal } from './telas/Portal'

export function App({ api, dicaCodigo }: { api: PortalApi; dicaCodigo?: string }) {
  // undefined = conferindo o cookie de 30 dias; null = precisa entrar.
  const [sessao, setSessao] = useState<Sessao | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    api.sessao().catch(() => null).then((s) => vivo && setSessao(s))
    return () => {
      vivo = false
    }
  }, [api])
  const sair = () => {
    void api.sair()
    setSessao(null)
  }
  return (
    <ApiProvider api={api}>
      <ToastProvider>
        {sessao ? <Portal sessao={sessao} onSair={sair} /> : sessao === null && <Entrar onEntrar={setSessao} dicaCodigo={dicaCodigo} />}
        <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
      </ToastProvider>
    </ApiProvider>
  )
}
