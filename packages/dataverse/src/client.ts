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

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch { /* corpo não é JSON */ }
  return `HTTP ${response.status}`
}

export function createClient(clientUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): DataverseClient {
  const apiUrl = `${clientUrl.replace(/\/+$/, '')}/api/data/v9.2`

  async function send(path: string, init: RequestOptions = {}) {
    const { maxPageSize, ...rest } = init
    const prefer = ['odata.include-annotations="*"']
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
    async update(entitySet, id, data) {
      await send(`${entitySet}(${cleanId(id)})`, { method: 'PATCH', body: JSON.stringify(data) })
    },
    async remove(entitySet, id) {
      await send(`${entitySet}(${cleanId(id)})`, { method: 'DELETE' })
    },
  }
}
