import type { DataverseClient, Row } from './client'
import { cleanId, DataverseError, dataverseErrorMessage } from './client'
import { createMetadata } from './metadata'

type RecordRef = { entityType: string; id: string }

export type XrmWebApi = {
  retrieveMultipleRecords: (entity: string, options?: string, maxPageSize?: number) => Promise<{ entities: Row[]; nextLink?: string }>
  retrieveRecord: (entity: string, id: string, options?: string) => Promise<Row>
  createRecord: (entity: string, data: Row) => Promise<RecordRef>
  updateRecord: (entity: string, id: string, data: Row) => Promise<RecordRef>
  deleteRecord: (entity: string, id: string) => Promise<RecordRef>
  /** Ações sem vínculo (Custom API), no mesmo contrato de `Xrm.WebApi.online.execute`. */
  online?: {
    execute: (request: ExecuteRequest) => Promise<Response>
    /** Cada item (lista aninhada ou request solto) vira um changeset: grava tudo ou nada. Fora do model-driven, só Update. */
    executeMultiple?: (requests: Array<ExecuteRequest | ExecuteRequest[]>) => Promise<Response[]>
  }
}

export type ExecuteRequest = Record<string, unknown> & {
  getMetadata: () => { boundParameter: null | string; operationType: number; operationName: string; parameterTypes: Record<string, unknown> }
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

  async function updatePart(request: ExecuteRequest, contentId: number) {
    const { operationName } = request.getMetadata()
    if (operationName !== 'Update') throw new DataverseError(`executeMultiple fora do model-driven só aceita Update: ${operationName}.`, 400)
    const url = `${client.apiUrl}/${await set(String(request.etn))}(${cleanId(String(request.id))})`
    return ['Content-Type: application/http', 'Content-Transfer-Encoding: binary', `Content-ID: ${contentId}`, '', `PATCH ${url} HTTP/1.1`, 'Content-Type: application/json', 'If-Match: *', '', JSON.stringify(request.payload)].join('\r\n')
  }

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
      online: {
        // Só ações sem vínculo: as telas em iframe (ex.: Gestão de Checklists) chamam Custom APIs assim.
        async execute(request) {
          const { boundParameter, operationName, parameterTypes } = request.getMetadata()
          if (boundParameter) return errorResponse(400, `Ação vinculada não suportada fora do model-driven: ${operationName}.`)
          const body = Object.fromEntries(Object.keys(parameterTypes).map((key) => [key, request[key]]))
          try {
            const result = await client.request<unknown>(operationName, { method: 'POST', body: JSON.stringify(body) })
            return new Response(result === undefined ? null : JSON.stringify(result), { status: result === undefined ? 204 : 200, headers: { 'Content-Type': 'application/json' } })
          } catch (error) {
            return errorResponse(error instanceof DataverseError ? error.status : 500, error instanceof Error ? error.message : String(error))
          }
        },
        // A Gestão de Checklists troca o modelo padrão num changeset; como no Xrm real, rejeita se algo falhar.
        async executeMultiple(requests) {
          const batch = `batch_${crypto.randomUUID()}`
          const changesets = await Promise.all(requests.map(async (item, index) => {
            const changeset = `changeset_${index}_${batch}`
            const parts = await Promise.all((Array.isArray(item) ? item : [item]).map((request, i) => updatePart(request, i + 1)))
            return [`--${batch}`, `Content-Type: multipart/mixed; boundary=${changeset}`, '', ...parts.map((part) => `--${changeset}\r\n${part}`), `--${changeset}--`].join('\r\n')
          }))
          const body = `${changesets.join('\r\n')}\r\n--${batch}--\r\n`
          const text = await client.request<string>('$batch', { method: 'POST', headers: { 'Content-Type': `multipart/mixed; boundary=${batch}` }, body })
          const statuses = [...text.matchAll(/^HTTP\/1\.1 (\d{3})/gm)].map((match) => Number(match[1]))
          const failed = statuses.find((status) => status >= 400)
          if (failed) throw new DataverseError(dataverseErrorMessage(text) || `HTTP ${failed}`, failed)
          return statuses.map((status) => new Response(null, { status }))
        },
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

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), { status, headers: { 'Content-Type': 'application/json' } })
}
