// Os testes de origem (tela-gestao-checklists) simulam o Dataverse com um `window.Xrm.WebApi` falso.
// Este cliente traduz as chamadas de data/dataverse.ts para esse Xrm, para os testes seguirem iguais.
import { beforeEach } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import { configurarDataverse, entityName } from '../data/dataverse'

type WebApiFalso = Record<string, (...args: any[]) => Promise<any>>
const webApi = () => (globalThis as any).window?.Xrm?.WebApi as WebApiFalso

const cliente: DataverseClient = {
  apiUrl: '/api/data/v9.2',
  async request<T>(path: string) {
    if (path.startsWith('EntityDefinitions')) return (await (await fetch(`/api/data/v9.2/${path}`)).json()) as T
    const [, set, id, query = ''] = /^(\w+)(?:\(([^)]+)\))?(\?.*)?$/.exec(path) ?? []
    if (id) return (await webApi().retrieveRecord(entityName(set), id, query)) as T
    const page = await webApi().retrieveMultipleRecords(entityName(set), query)
    return { value: page.entities, '@odata.nextLink': page.nextLink } as T
  },
  async getAll() { throw new Error('não usado') },
  async create(set, data) { return (await webApi().createRecord(entityName(set), data)).id },
  async update(set, id, data) { await webApi().updateRecord(entityName(set), id, data) },
  async remove(set, id) { await webApi().deleteRecord(entityName(set), id) },
}

export function usarXrmFalso() { beforeEach(() => configurarDataverse(cliente)) }
