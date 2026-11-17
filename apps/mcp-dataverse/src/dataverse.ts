import { refreshForResource } from './entra'
import { dataverseUrl, type Ambiente, type AppEnv } from './env'

export const API_VERSION = 'v9.2'
/** Margem antes do vencimento em que o access token em cache deixa de valer. */
const TOKEN_MARGIN_MS = 5 * 60_000

export const ANNOTATIONS =
  'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname"'

/** Erro da Web API do Dataverse: código HTTP, código e mensagem do Dataverse. */
export class DataverseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
  toString() {
    return `Dataverse HTTP ${this.status}${this.code ? ` [${this.code}]` : ''}: ${this.message}`
  }
}

export interface EntityInfo {
  logicalName: string
  entitySet: string
  primaryId: string
  primaryName: string
}

export interface ApiOptions {
  body?: unknown
  headers?: Record<string, string>
}

export interface ApiResult {
  status: number
  /** Corpo JSON (null se vazio). */
  data: any
  headers: Headers
}

/** Monta `?$a=b&$c=d` com %20 (e não +), ignorando valores vazios. */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

/** Literal OData: texto entre aspas simples (dobrando as aspas), GUID/número/booleano sem aspas. */
export function odataLiteral(value: unknown): string {
  if (typeof value === 'string') {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ? value
      : `'${value.replace(/'/g, "''")}'`
  }
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Sessão de um usuário: tokens por ambiente (cache em memória) e chamadas à Web API. */
export class DataverseSession {
  private tokens = new Map<Ambiente, { token: string; expiresAt: number }>()
  private entities = new Map<string, EntityInfo>()
  private refreshToken: string

  constructor(
    private env: AppEnv,
    refreshToken: string,
    private now: () => number = Date.now,
  ) {
    this.refreshToken = refreshToken
  }

  baseUrl(ambiente: Ambiente) {
    return dataverseUrl(this.env, ambiente)
  }

  apiUrl(ambiente: Ambiente, path = '') {
    return `${this.baseUrl(ambiente)}/api/data/${API_VERSION}/${path.replace(/^\//, '')}`
  }

  private async accessToken(ambiente: Ambiente, force = false): Promise<string> {
    const cached = this.tokens.get(ambiente)
    if (!force && cached && cached.expiresAt - TOKEN_MARGIN_MS > this.now()) return cached.token
    const result = await refreshForResource(this.env, this.refreshToken, this.baseUrl(ambiente))
    // O Entra pode girar o refresh token; guarde o novo para as próximas trocas.
    if (result.refreshToken) this.refreshToken = result.refreshToken
    this.tokens.set(ambiente, { token: result.accessToken, expiresAt: this.now() + result.expiresIn * 1000 })
    return result.accessToken
  }

  /** Chamada autenticada. `pathOrUrl` relativo à Web API ou URL absoluta do mesmo ambiente. */
  async api(ambiente: Ambiente, method: string, pathOrUrl: string, options: ApiOptions = {}): Promise<ApiResult> {
    const url = /^https:\/\//i.test(pathOrUrl) ? pathOrUrl : this.apiUrl(ambiente, pathOrUrl)
    if (!url.startsWith(`${this.baseUrl(ambiente)}/`)) {
      throw new DataverseError(400, 'url_invalida', 'A URL não pertence ao ambiente escolhido.')
    }
    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken(ambiente, attempt > 0)
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          Prefer: ANNOTATIONS,
          ...(options.body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      })
      if (response.status === 401 && attempt === 0) continue // renova o token uma vez
      if (!response.ok) throw await toError(response)
      const text = await response.text()
      return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers }
    }
  }

  /** Resolve nome lógico ou EntitySetName para a tabela (com cache por ambiente). */
  async entity(ambiente: Ambiente, nameOrSet: string): Promise<EntityInfo> {
    const key = `${ambiente}:${nameOrSet.toLowerCase()}`
    const hit = this.entities.get(key)
    if (hit) return hit
    const cols = 'LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute'
    const name = nameOrSet.toLowerCase()
    let row: any
    try {
      row = (await this.api(ambiente, 'GET', `EntityDefinitions(LogicalName='${name.replace(/'/g, "''")}')?$select=${cols}`)).data
    } catch (error) {
      if (!(error instanceof DataverseError) || error.status !== 404) throw error
      const found = (
        await this.api(
          ambiente,
          'GET',
          `EntityDefinitions${buildQuery({ $select: cols, $filter: `EntitySetName eq '${name.replace(/'/g, "''")}'` })}`,
        )
      ).data?.value
      row = found?.[0]
    }
    if (!row) throw new DataverseError(404, 'tabela_nao_encontrada', `Tabela "${nameOrSet}" não encontrada em ${ambiente}.`)
    const info: EntityInfo = {
      logicalName: row.LogicalName,
      entitySet: row.EntitySetName,
      primaryId: row.PrimaryIdAttribute,
      primaryName: row.PrimaryNameAttribute,
    }
    this.entities.set(key, info)
    this.entities.set(`${ambiente}:${info.logicalName}`, info)
    this.entities.set(`${ambiente}:${info.entitySet.toLowerCase()}`, info)
    return info
  }
}

async function toError(response: Response): Promise<DataverseError> {
  const text = await response.text()
  let code = ''
  let message = text.slice(0, 500) || response.statusText
  try {
    const error = JSON.parse(text)?.error
    if (error) {
      code = String(error.code ?? '')
      message = String(error.message ?? message)
    }
  } catch {
    // corpo não JSON: usa o texto cru
  }
  return new DataverseError(response.status, code, message)
}

/** GUID do cabeçalho OData-EntityId (`.../accounts(<guid>)`). */
export function idFromEntityHeader(headers: Headers): string | undefined {
  return headers.get('OData-EntityId')?.match(/\(([^)]+)\)\s*$/)?.[1]
}
