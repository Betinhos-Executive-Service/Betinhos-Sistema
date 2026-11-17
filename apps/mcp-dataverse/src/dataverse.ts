import { EntraError, refreshForResource } from './entra'
import { MemoryStore, type CacheStore } from './store'
import { dataverseUrl, type Ambiente, type AppEnv } from './env'

export const API_VERSION = 'v9.2'
/** Margem antes do vencimento em que o access token em cache deixa de valer. */
const TOKEN_MARGIN_MS = 5 * 60_000
/** Validade do cache de metadata (nome lógico -> EntitySetName). */
export const ENTITY_TTL_MS = 6 * 3600_000
/** Timeout de cada chamada ao Dataverse. */
export const CALL_TIMEOUT_MS = 25_000
/** Novas tentativas para 429/503/504 e o teto de espera (por tentativa e somado). */
const MAX_RETRIES = 2
const MAX_WAIT_MS = 10_000
const MAX_TOTAL_WAIT_MS = 15_000

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAME_RE = /^[a-z0-9_]+$/i
/** Entrada que vira trecho de URL: GUID, nome lógico/EntitySet e nome de ação/relação (com ponto). */
export const isGuid = (v: string) => GUID_RE.test(v)
export const isLogicalName = (v: string) => NAME_RE.test(v)
export const isQualifiedName = (v: string) => /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i.test(v)

export const ANNOTATIONS =
  'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname"'

/** Erro da Web API do Dataverse: código HTTP, código e mensagem do Dataverse. */
export class DataverseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Entrada que originou o erro (ex.: nome de tabela digitado), para a dica de correção. */
    readonly meta: { tabela?: string } = {},
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
    return GUID_RE.test(value)
      ? value
      : `'${value.replace(/'/g, "''")}'`
  }
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Segundos de `Retry-After` (número ou data HTTP) em ms; undefined se ausente ou inválido. */
export function retryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const raw = headers.get('Retry-After')
  if (!raw) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(raw)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}

const sameEnvironment = (url: string, base: string) => {
  try {
    const u = new URL(url)
    return u.origin === new URL(base).origin && /^\/api\/(data|search)\//.test(u.pathname)
  } catch {
    return false
  }
}

export interface SessionOptions {
  /** Cache persistente (SQLite do Durable Object). Padrão: memória. */
  store?: CacheStore
  sleep?: (ms: number) => Promise<void>
}

/** Sessão de um usuário: tokens por ambiente, cache de metadata e chamadas à Web API (retry e timeout). */
export class DataverseSession {
  private tokens = new Map<Ambiente, { token: string; expiresAt: number }>()
  private pendingTokens = new Map<Ambiente, Promise<string>>()
  private entities = new Map<string, EntityInfo>()
  private refreshToken: string
  private originalRefreshToken: string
  private store: CacheStore
  private sleep: (ms: number) => Promise<void>
  /** Status HTTP da última resposta do Dataverse (0 = sem resposta) e nº de chamadas, para o log de cada ferramenta. */
  lastStatus = 0
  calls = 0

  constructor(
    private env: AppEnv,
    refreshToken: string,
    private now: () => number = Date.now,
    options: SessionOptions = {},
  ) {
    this.store = options.store ?? new MemoryStore(now)
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    // Token girado numa sessão anterior (antes da hibernação) vale só se o do grant ainda for o mesmo.
    this.refreshToken = refreshToken
    try {
      const saved = JSON.parse(this.store.get('rt') ?? 'null') as { from: string; rt: string } | null
      if (saved?.from === refreshToken && saved.rt) this.refreshToken = saved.rt
    } catch {
      // cache corrompido: ignora
    }
    this.originalRefreshToken = refreshToken
  }
  baseUrl(ambiente: Ambiente) {
    return dataverseUrl(this.env, ambiente)
  }

  apiUrl(ambiente: Ambiente, path = '') {
    return `${this.baseUrl(ambiente)}/api/data/${API_VERSION}/${path.replace(/^\//, '')}`
  }

  /** Access token do ambiente: memória, depois cache persistido, depois refresh (uma troca por vez por ambiente). */
  private async accessToken(ambiente: Ambiente, force = false): Promise<string> {
    if (!force) {
      const cached = this.tokens.get(ambiente) ?? this.loadToken(ambiente)
      if (cached && cached.expiresAt - TOKEN_MARGIN_MS > this.now()) return cached.token
    }
    let pending = this.pendingTokens.get(ambiente)
    if (!pending) {
      pending = this.refresh(ambiente).finally(() => this.pendingTokens.delete(ambiente))
      this.pendingTokens.set(ambiente, pending)
    }
    return pending
  }

  private loadToken(ambiente: Ambiente) {
    try {
      const saved = JSON.parse(this.store.get(`tok:${ambiente}`) ?? 'null') as { token: string; expiresAt: number } | null
      if (saved?.token) {
        this.tokens.set(ambiente, saved)
        return saved
      }
    } catch {
      // cache corrompido: ignora
    }
    return undefined
  }

  private async refresh(ambiente: Ambiente): Promise<string> {
    let result
    try {
      result = await refreshForResource(this.env, this.refreshToken, this.baseUrl(ambiente))
    } catch (error) {
      if (error instanceof EntraError && ['invalid_grant', 'interaction_required', 'consent_required'].includes(error.code)) {
        throw new EntraError(
          'A sessão Microsoft expirou ou foi revogada. Reconecte o conector (claude.ai > Configurações > Conectores: desconectar e conectar de novo).',
          'reauth_required',
          401,
        )
      }
      throw error
    }
    // O Entra pode girar o refresh token; guarde o novo (também fora da memória) para as próximas trocas.
    if (result.refreshToken && result.refreshToken !== this.refreshToken) {
      this.refreshToken = result.refreshToken
      this.store.set('rt', JSON.stringify({ from: this.originalRefreshToken, rt: result.refreshToken }), 30 * 24 * 3600_000)
    }
    const entry = { token: result.accessToken, expiresAt: this.now() + result.expiresIn * 1000 }
    this.tokens.set(ambiente, entry)
    this.store.set(`tok:${ambiente}`, JSON.stringify(entry), result.expiresIn * 1000)
    return result.accessToken
  }

  /** Chamada autenticada. `pathOrUrl` relativo à Web API ou URL absoluta do mesmo ambiente. */
  async api(ambiente: Ambiente, method: string, pathOrUrl: string, options: ApiOptions = {}): Promise<ApiResult> {
    const url = /^https:\/\//i.test(pathOrUrl) ? pathOrUrl : this.apiUrl(ambiente, pathOrUrl)
    if (!sameEnvironment(url, this.baseUrl(ambiente))) {
      throw new DataverseError(400, 'url_invalida', 'A URL não pertence ao ambiente escolhido.')
    }
    const safe = method === 'GET' || method === 'HEAD'
    let renewed = false
    let retries = 0
    let waited = 0
    for (;;) {
      const token = await this.accessToken(ambiente, renewed)
      this.calls++
      let response: Response
      try {
        response = await fetch(url, {
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
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        })
      } catch (error) {
        this.lastStatus = 0
        if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
          throw new DataverseError(504, 'timeout', `O Dataverse não respondeu em ${CALL_TIMEOUT_MS / 1000} s; reduza a consulta ou tente de novo.`)
        }
        throw new DataverseError(502, 'rede', 'Falha de rede ao chamar o Dataverse.')
      }
      this.lastStatus = response.status
      if (response.status === 401 && !renewed) {
        renewed = true // renova o token uma vez
        await response.body?.cancel()
        continue
      }
      if ([429, 503, 504].includes(response.status) && retries < MAX_RETRIES && (response.status !== 504 || safe)) {
        const wait = retryAfterMs(response.headers, this.now()) ?? 1000 * 2 ** retries
        if (wait <= MAX_WAIT_MS && waited + wait <= MAX_TOTAL_WAIT_MS) {
          await response.body?.cancel()
          retries++
          waited += wait
          await this.sleep(wait)
          continue
        }
      }
      if (!response.ok) throw await toError(response)
      const text = await response.text()
      return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers }
    }
  }

  /** Valor em cache (JSON) ou o resultado de `load`, guardado por `ttlMs`. `force` ignora o cache. */
  async cached<T>(key: string, ttlMs: number, load: () => Promise<T>, force = false): Promise<T> {
    if (!force) {
      const hit = this.store.get(key)
      if (hit !== undefined) {
        try {
          return JSON.parse(hit) as T
        } catch {
          // entrada corrompida: recarrega
        }
      }
    }
    const value = await load()
    this.store.set(key, JSON.stringify(value), ttlMs)
    return value
  }

  /** Valor em cache (JSON) sem carregar nada; undefined se ausente. */
  peek<T>(key: string): T | undefined {
    const hit = this.store.get(key)
    if (hit === undefined) return undefined
    try {
      return JSON.parse(hit) as T
    } catch {
      return undefined
    }
  }

  /** Esquema mudou (tabela criada, alterada ou excluída): descarta metadata em cache do ambiente. */
  invalidateSchema(ambiente: Ambiente) {
    for (const key of this.entities.keys()) if (key.startsWith(`${ambiente}:`)) this.entities.delete(key)
    for (const prefix of ['ent:', 'desc:', 'tables:']) this.store.deletePrefix(`${prefix}${ambiente}`)
  }

  /** Resolve nome lógico ou EntitySetName para a tabela (cache em memória e no store, por ambiente). */
  async entity(ambiente: Ambiente, nameOrSet: string): Promise<EntityInfo> {
    const name = nameOrSet.toLowerCase()
    if (!isLogicalName(name)) throw new DataverseError(400, 'nome_invalido', `Nome de tabela inválido: use o nome lógico (letras minúsculas, números e _), não o rótulo (recebido "${nameOrSet.slice(0, 60)}").`, { tabela: nameOrSet })
    const key = `${ambiente}:${name}`
    const hit = this.entities.get(key)
    if (hit) return hit
    const saved = this.store.get(`ent:${key}`)
    if (saved) {
      try {
        const info = JSON.parse(saved) as EntityInfo
        this.entities.set(key, info)
        return info
      } catch {
        // entrada corrompida: busca de novo
      }
    }
    const cols = 'LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute'
    let row: any
    try {
      row = (await this.api(ambiente, 'GET', `EntityDefinitions(LogicalName='${name}')?$select=${cols}`)).data
    } catch (error) {
      if (!(error instanceof DataverseError) || error.status !== 404) throw error
      const found = (
        await this.api(ambiente, 'GET', `EntityDefinitions${buildQuery({ $select: cols, $filter: `EntitySetName eq '${name}'` })}`)
      ).data?.value
      row = found?.[0]
    }
    if (!row) throw new DataverseError(404, 'tabela_nao_encontrada', `Tabela "${nameOrSet}" não encontrada em ${ambiente}.`, { tabela: nameOrSet })
    const info: EntityInfo = {
      logicalName: row.LogicalName,
      entitySet: row.EntitySetName,
      primaryId: row.PrimaryIdAttribute,
      primaryName: row.PrimaryNameAttribute,
    }
    this.remember(ambiente, info)
    return info
  }

  /** Guarda a tabela sob o nome lógico e o EntitySetName (memória e store). */
  remember(ambiente: Ambiente, info: EntityInfo) {
    const json = JSON.stringify(info)
    for (const name of new Set([info.logicalName.toLowerCase(), info.entitySet.toLowerCase()])) {
      this.entities.set(`${ambiente}:${name}`, info)
      this.store.set(`ent:${ambiente}:${name}`, json, ENTITY_TTL_MS)
    }
  }
}

/** Ruído do Dataverse sem valor para o modelo: índice e id da organização. */
const NOISE_RE = /\s*[\[(]?\s*(?:orgIndex|org\s*id|organization\s*id)\s*[:=]\s*[\w-]+\s*[\])]?/gi

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
  message = message.replace(NOISE_RE, '').trim()
  if (response.status === 429) {
    const wait = retryAfterMs(response.headers)
    message = `Limite de proteção do Dataverse (429)${wait !== undefined ? `; tente de novo em ${Math.ceil(wait / 1000)} s` : ''}. ${message}`
  }
  return new DataverseError(response.status, code, message)
}

/** GUID do cabeçalho OData-EntityId (`.../accounts(<guid>)`). */
export function idFromEntityHeader(headers: Headers): string | undefined {
  return headers.get('OData-EntityId')?.match(/\(([^)]+)\)\s*$/)?.[1]
}
