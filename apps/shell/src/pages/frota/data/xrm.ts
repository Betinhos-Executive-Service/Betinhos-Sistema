export type XrmWebApi = {
  retrieveMultipleRecords: (entity: string, options?: string, maxPageSize?: number) => Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>
  retrieveRecord: (entity: string, id: string, options?: string) => Promise<Record<string, unknown>>
  updateRecord: (entity: string, id: string, data: Record<string, unknown>) => Promise<unknown>
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

/** Mensagem legível de erros do Xrm.WebApi / fetch. */
export function errorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : String(error)
  return message.replace(/\.+$/, '')
}
