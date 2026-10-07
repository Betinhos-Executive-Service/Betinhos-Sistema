import type { DataverseClient, Row } from './client'
import { cleanId } from './client'
import { createMetadata } from './metadata'

type RecordRef = { entityType: string; id: string }

export type XrmWebApi = {
  retrieveMultipleRecords: (entity: string, options?: string, maxPageSize?: number) => Promise<{ entities: Row[]; nextLink?: string }>
  retrieveRecord: (entity: string, id: string, options?: string) => Promise<Row>
  createRecord: (entity: string, data: Row) => Promise<RecordRef>
  updateRecord: (entity: string, id: string, data: Row) => Promise<RecordRef>
  deleteRecord: (entity: string, id: string) => Promise<RecordRef>
}

export type XrmHost = {
  WebApi?: XrmWebApi
  Navigation?: Record<string, unknown>
  Utility?: {
    getGlobalContext: () => {
      getClientUrl: () => string
      getCurrentAppProperties?: () => Promise<{ appId?: string }>
    }
    showProgressIndicator?: (message: string) => void
    closeProgressIndicator?: () => void
  }
}

declare global { interface Window { Xrm?: XrmHost } }

/** Xrm do model-driven quando a tela roda dentro dele (direto ou em iframe). */
export function getHostXrm(): XrmHost | undefined {
  try { if (window.parent !== window && window.parent?.Xrm) return window.parent.Xrm } catch { /* O pai pode ser de outra origem. */ }
  return window.Xrm
}

export function isLocalHost() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1'
}

/**
 * Xrm mínimo sobre a Web API, para telas legadas que chamam `parent.Xrm.WebApi`
 * quando o shell é aberto por URL direta, fora do model-driven.
 */
export function createXrmShim(client: DataverseClient, clientUrl: string): XrmHost {
  const metadata = createMetadata(client)
  const set = async (entity: string) => (await metadata.entity(entity)).entitySetName

  return {
    WebApi: {
      async retrieveMultipleRecords(entity, options = '', maxPageSize) {
        const page = await client.request<{ value: Row[]; '@odata.nextLink'?: string }>(`${await set(entity)}${options}`, { maxPageSize })
        return { entities: page.value, nextLink: page['@odata.nextLink'] }
      },
      async retrieveRecord(entity, id, options = '') {
        return client.request<Row>(`${await set(entity)}(${cleanId(id)})${options}`)
      },
      async createRecord(entity, data) {
        return { entityType: entity, id: await client.create(await set(entity), data) }
      },
      async updateRecord(entity, id, data) {
        await client.update(await set(entity), id, data)
        return { entityType: entity, id: cleanId(id) }
      },
      async deleteRecord(entity, id) {
        await client.remove(await set(entity), id)
        return { entityType: entity, id: cleanId(id) }
      },
    },
    // Scripts de comando do model-driven (ex.: gerador de recibo) usam estes avisos simples.
    Navigation: {
      openAlertDialog: async (options: { text?: string }) => { window.alert(options?.text ?? '') },
    },
    Utility: {
      getGlobalContext: () => ({ getClientUrl: () => clientUrl }),
      showProgressIndicator: () => { /* sem indicador fora do model-driven */ },
      closeProgressIndicator: () => { /* sem indicador fora do model-driven */ },
    },
  }
}
