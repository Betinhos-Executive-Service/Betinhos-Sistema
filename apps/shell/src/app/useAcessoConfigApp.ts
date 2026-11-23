import { useEffect, useState } from 'react'
import type { Host } from '../host'
import { acessoPorPapeis, SEM_ACESSO, type Acesso } from '../pages/app-motoristas/domain/acesso'
import { nomesDosPapeis } from './acessos'

const TUDO: Acesso = { gestor: true, admin: true }

/** Uma leitura de papéis por sessão: o menu (App.tsx) e a tela pedem o mesmo acesso. Falha não fica guardada. */
const leituras = new WeakMap<Host, Promise<Acesso>>()

function lerAcesso(host: Extract<Host, { mode: 'dataverse' }>): Promise<Acesso> {
  let leitura = leituras.get(host)
  if (!leitura) {
    leitura = nomesDosPapeis(host.client).then(acessoPorPapeis)
    leitura.catch(() => leituras.delete(host))
    leituras.set(host, leitura)
  }
  return leitura
}

/** `null` enquanto lê; no mock (pnpm dev) tudo liberado; erro na leitura = sem acesso (o servidor recusa de qualquer jeito). */
export function useAcessoConfigApp(host: Host): Acesso | null {
  const [lido, setLido] = useState<Acesso | null>(null)
  useEffect(() => {
    if (host.mode !== 'dataverse') return
    let vivo = true
    lerAcesso(host).then((a) => { if (vivo) setLido(a) }, () => { if (vivo) setLido(SEM_ACESSO) })
    return () => { vivo = false }
  }, [host])
  return host.mode === 'dataverse' ? lido : TUDO
}
