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

/** Mensagem legível de erros do Xrm.WebApi / fetch. */
export function errorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : String(error)
  return message.replace(/\.+$/, '')
}

/** Erro de Custom API com o status HTTP: 400 é a recusa de regra do plugin (texto escrito para o usuário); o resto é falha técnica. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Só a recusa de regra (HTTP 400) aparece como veio; qualquer outro erro vira a mensagem genérica da ação. */
export function mensagemDaAcao(error: unknown, generica: string) {
  return error instanceof ApiError && error.status === 400 ? error.message : generica
}
