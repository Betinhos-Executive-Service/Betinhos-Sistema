export type XrmWebApi = {
  retrieveMultipleRecords: (entity: string, options?: string, maxPageSize?: number) => Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>
  retrieveRecord: (entity: string, id: string, options?: string) => Promise<Record<string, unknown>>
  updateRecord: (entity: string, id: string, data: Record<string, unknown>) => Promise<unknown>
  createRecord: (entity: string, data: Record<string, unknown>) => Promise<{ id: string }>
}

/** Recorte do Xrm que a Frota usa; o shell entrega o do model-driven ou o mínimo sobre a Web API. */
export type XrmHost = {
  WebApi?: XrmWebApi
  Navigation?: {
    openForm?: (options: { entityName: string; entityId?: string }) => Promise<unknown>
    navigateTo?: (page: { pageType: 'entityrecord'; entityName: string; entityId?: string }, options: { target: 2; position: 1; width: { value: number; unit: '%' } }) => Promise<unknown>
  }
  Utility?: { getGlobalContext: () => { getClientUrl: () => string } }
}

/** Mensagem do erro exatamente como veio (Xrm.WebApi, fetch ou Custom API), inclusive o ponto final. */
export function rawErrorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : String(error)
}

/** Mensagem legível de erros do Xrm.WebApi / fetch, sem o ponto final (para compor frases). */
export function errorMessage(error: unknown) {
  return rawErrorMessage(error).replace(/\.+$/, '')
}
