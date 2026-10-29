export type Row = Record<string, unknown>

type RequestOptions = RequestInit & { maxPageSize?: number }

export type DataverseClient = {
  apiUrl: string
  /** Chamada crua na Web API; `path` é relativo a /api/data/v9.2 ou um nextLink absoluto. */
  request: <T = unknown>(path: string, init?: RequestOptions) => Promise<T>
  /** Segue @odata.nextLink até o fim. */
  getAll: (path: string) => Promise<Row[]>
  create: (entitySet: string, data: Row) => Promise<string>
  update: (entitySet: string, id: string, data: Row) => Promise<void>
  remove: (entitySet: string, id: string) => Promise<void>
}

export class DataverseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'DataverseError'
  }
}

export function cleanId(value: string) {
  return value.replace(/[{}]/g, '').toLowerCase()
}

/** Mensagem de erro do Dataverse num corpo JSON ou dentro da resposta multipart de um $batch. */
export function dataverseErrorMessage(text: string) {
  try { return (JSON.parse(text) as { error?: { message?: string } }).error?.message } catch { /* multipart ou texto */ }
  const message = /"message":\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1]
  if (message === undefined) return undefined
  try { return JSON.parse(`"${message}"`) as string } catch { return message }
}

async function readError(response: Response) {
  return dataverseErrorMessage(await response.text().catch(() => '')) || `HTTP ${response.status}`
}

export type FetchFailure = { method: string; path: string; status?: number; body?: unknown; error?: unknown }

/** `fetch` que avisa `report` das respostas de erro (exceto 404, tratado pelas telas) e das falhas de rede; a resposta segue igual. */
export function reportingFetch(report: (failure: FetchFailure) => void, fetchImpl: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let response: Response
    try {
      response = await fetchImpl(input, init)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) report({ method, path, error })
      throw error
    }
    if (!response.ok && response.status !== 404) report({ method, path, status: response.status, body: await response.clone().json().catch(() => null) })
    return response
  }
}

/**
 * Só as anotações que as telas leem: texto formatado e a paginação do FetchXML (Geral). Com `*` cada lookup trazia
 * também `lookuplogicalname` e `associatednavigationproperty`, e a resposta ficava 13–25% maior (medido no DEV).
 */
const ANNOTATIONS = [
  'OData.Community.Display.V1.FormattedValue',
  'Microsoft.Dynamics.CRM.fetchxmlpagingcookie',
  'Microsoft.Dynamics.CRM.morerecords',
  'Microsoft.Dynamics.CRM.totalrecordcount',
].join(',')

export function createClient(clientUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): DataverseClient {
  const apiUrl = `${clientUrl.replace(/\/+$/, '')}/api/data/v9.2`

  async function send(path: string, init: RequestOptions = {}) {
    const { maxPageSize, ...rest } = init
    const prefer = [`odata.include-annotations="${ANNOTATIONS}"`]
    if (maxPageSize) prefer.push(`odata.maxpagesize=${maxPageSize}`)
    const response = await fetchImpl(/^https?:\/\//i.test(path) ? path : `${apiUrl}/${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: {
        Accept: 'application/json',
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0',
        Prefer: prefer.join(','),
        ...(rest.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...(rest.headers as Record<string, string> | undefined),
      },
    })
    if (!response.ok) throw new DataverseError(await readError(response), response.status)
    return response
  }

  async function request<T>(path: string, init?: RequestOptions) {
    const response = await send(path, init)
    if (response.status === 204) return undefined as T
    // A resposta de $batch é multipart; quem chama faz o parse do texto.
    if (/^multipart\//i.test(response.headers.get('Content-Type') ?? '')) return (await response.text()) as T
    return (await response.json()) as T
  }

  return {
    apiUrl,
    request,
    async getAll(path) {
      const rows: Row[] = []
      let next: string | undefined = path
      while (next) {
        const page: { value: Row[]; '@odata.nextLink'?: string } = await request(next)
        rows.push(...page.value)
        next = page['@odata.nextLink']
      }
      return rows
    },
    async create(entitySet, data) {
      const response = await send(entitySet, { method: 'POST', body: JSON.stringify(data) })
      const match = /\(([0-9a-fA-F-]{36})\)\s*$/.exec(response.headers.get('OData-EntityId') ?? '')
      if (!match) throw new DataverseError('Registro criado, mas o id não foi retornado.', response.status)
      return match[1].toLowerCase()
    },
    // If-Match: * impede que o PATCH vire upsert e crie um registro quando o id não existe.
    async update(entitySet, id, data) {
      await send(`${entitySet}(${cleanId(id)})`, { method: 'PATCH', headers: { 'If-Match': '*' }, body: JSON.stringify(data) })
    },
    async remove(entitySet, id) {
      await send(`${entitySet}(${cleanId(id)})`, { method: 'DELETE' })
    },
  }
}
