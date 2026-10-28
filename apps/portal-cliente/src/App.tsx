import { useState } from 'react'
import { BuildBadge, ToastProvider } from '@betinhos/ui'
import { ApiProvider } from './api/ApiContext'
import type { PortalApi } from './api/PortalApi'
import type { Sessao } from './domain/types'
import { Entrar } from './telas/Entrar'
import { Servicos } from './telas/Servicos'

export function App({ api, dicaCodigo }: { api: PortalApi; dicaCodigo?: string }) {
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const sair = () => {
    void api.sair()
    setSessao(null)
  }
  return (
    <ApiProvider api={api}>
      <ToastProvider>
        {sessao ? <Servicos sessao={sessao} onSair={sair} /> : <Entrar onEntrar={setSessao} dicaCodigo={dicaCodigo} />}
        <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
      </ToastProvider>
    </ApiProvider>
  )
}
