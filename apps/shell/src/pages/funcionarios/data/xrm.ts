export type XrmWebApi = {
  retrieveMultipleRecords: (entity: string, options?: string, maxPageSize?: number) => Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>
  retrieveRecord: (entity: string, id: string, options?: string) => Promise<Record<string, unknown>>
  createRecord: (entity: string, data: Record<string, unknown>) => Promise<{ id: string }>
  updateRecord: (entity: string, id: string, data: Record<string, unknown>) => Promise<unknown>
  deleteRecord: (entity: string, id: string) => Promise<unknown>
}

export type XrmHost = {
  WebApi?: XrmWebApi
  Navigation?: {
    openForm?: (options: { entityName: string; entityId?: string }) => Promise<unknown>
  }
  Utility?: { getGlobalContext: () => { getClientUrl: () => string } }
}

/** Mensagem legível de erros do Xrm.WebApi / fetch. */
export function errorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : String(error)
  return message.replace(/\.+$/, '')
}
