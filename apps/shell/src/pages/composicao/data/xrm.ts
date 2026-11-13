export type XrmWebApi = {
  retrieveMultipleRecords: (entity: string, options?: string, maxPageSize?: number) => Promise<{ entities: Record<string, unknown>[]; nextLink?: string; fetchXmlPagingCookie?: string }>
  retrieveRecord: (entity: string, id: string, options?: string) => Promise<Record<string, unknown>>
  createRecord: (entity: string, data: Record<string, unknown>) => Promise<{ id: string }>
  deleteRecord: (entity: string, id: string) => Promise<unknown>
  updateRecord: (entity: string, id: string, data: Record<string, unknown>) => Promise<unknown>
  online?: { execute: (request: Record<string, unknown> & { getMetadata: () => unknown }) => Promise<{ ok: boolean; status: number; json: () => Promise<Record<string, unknown>> }> }
}

export type XrmHost = {
  WebApi?: XrmWebApi
  Navigation?: {
    openForm?: (options: { entityName: string; entityId: string }) => Promise<unknown>
    navigateTo?: (page: { pageType: 'webresource'; webresourceName: string; data: string } | { pageType: 'entityrecord'; entityName: string; entityId: string }, options: { target: number; position?: number; width?: { value: number; unit: '%' | 'px' } }) => Promise<unknown>
    openConfirmDialog: (strings: { title: string; text: string; confirmButtonLabel?: string; cancelButtonLabel?: string }) => Promise<{ confirmed: boolean }>
  }
  Utility?: { getGlobalContext: () => { getClientUrl: () => string } }
}

// `Window.Xrm` já é declarado por @betinhos/dataverse; aqui só o recorte que a Composição usa.

export function getXrmHost(): XrmHost | undefined {
  // No shell a página é a de cima; o shell define `window.Xrm` (model-driven ou shim).
  return window.Xrm as unknown as XrmHost | undefined
}
