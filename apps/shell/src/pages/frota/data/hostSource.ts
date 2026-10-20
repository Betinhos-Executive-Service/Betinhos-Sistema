import { getHostXrm } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { staleOnWrite } from '../../../app/listCache'
import { createXrmSource } from './dataverse'
import { createMockSource } from './mock'
import type { DataSource } from './source'
import type { XrmHost } from './xrm'

// Uma fonte por sessão (`host`): a carga fica em cache entre a tela Frota e a ficha do veículo em Documentos.
const porHost = new WeakMap<Host, DataSource>()
const GRAVACOES = ['update', 'runFlow', 'salvarItemPlano', 'inativarItemPlano', 'salvarBaseline', 'openForm'] as const

/** Dados fictícios no `pnpm dev`; no Dataverse, o Xrm do model-driven ou o mínimo que o shell montou. */
export function createFrotaSource(host: Host): DataSource {
  const cached = porHost.get(host)
  if (cached) return cached
  let source: DataSource
  if (host.mode === 'mock') source = createMockSource()
  else {
    const xrm = (getHostXrm() ?? window.Xrm) as XrmHost | undefined
    if (!xrm?.WebApi) throw new Error('A API do Dataverse não está disponível nesta janela.')
    source = createXrmSource(xrm)
  }
  // Gravação (inclusive pelo formulário nativo) faz a carga revalidar na próxima abertura.
  const wrapped = staleOnWrite(source, 'frota', GRAVACOES)
  porHost.set(host, wrapped)
  return wrapped
}
