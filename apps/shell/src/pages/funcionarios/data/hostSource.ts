import { getHostXrm } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { createXrmSource } from './dataverse'
import { createMockSource } from './mock'
import type { DataSource } from './source'
import type { XrmHost } from './xrm'

/** Dados fictícios no `pnpm dev`; no Dataverse, o Xrm do model-driven ou o mínimo que o shell montou. */
export function createFuncionariosSource(host: Host): DataSource {
  if (host.mode === 'mock') return createMockSource()
  const xrm = (getHostXrm() ?? window.Xrm) as XrmHost | undefined
  if (!xrm?.WebApi) throw new Error('A API do Dataverse não está disponível nesta janela')
  return createXrmSource(xrm)
}
