import { getHostXrm } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { staleOnWrite } from '../../../app/listCache'
import { createXrmSource } from './dataverse'
import { createMockSource } from './mock'
import type { DataSource } from './source'
import type { XrmHost } from './xrm'

// Uma fonte por sessão (`host`): o cache da lista vale entre uma abertura da tela e outra.
const porHost = new WeakMap<Host, DataSource>()

/** Dados fictícios no `pnpm dev`; no Dataverse, o Xrm do model-driven ou o mínimo que o shell montou. */
export function createFuncionariosSource(host: Host): DataSource {
  const cached = porHost.get(host)
  if (cached) return cached
  let source: DataSource
  if (host.mode === 'mock') source = createMockSource()
  else {
    const xrm = (getHostXrm() ?? window.Xrm) as XrmHost | undefined
    if (!xrm?.WebApi) throw new Error('A API do Dataverse não está disponível nesta janela')
    source = createXrmSource(xrm)
  }
  // Gravação em qualquer lugar (lista ou ficha aberta em Documentos) faz a lista revalidar na próxima abertura.
  const wrapped = staleOnWrite(source, 'funcionarios', ['save', 'uploadImage', 'removeImage', 'uploadAditivo', 'saveLogins'])
  porHost.set(host, wrapped)
  return wrapped
}
