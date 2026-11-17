import { vi } from 'vitest'
import type { AppEnv } from './env'

export const env = {
  ENTRA_TENANT_ID: 'tenant-1',
  ENTRA_CLIENT_ID: 'client-1',
  ENTRA_CLIENT_SECRET: 'segredo-de-teste',
  COOKIE_ENCRYPTION_KEY: 'x'.repeat(32),
  MCP_RESOURCE: 'https://mcp.test/mcp',
  ALLOWED_EMAIL_DOMAIN: 'betinhos.com.br',
  DV_URL_DEV: 'https://dev.crm.test',
  DV_URL_TEST: 'https://test.crm.test',
  DV_URL_PROD: 'https://prod.crm.test/',
} as unknown as AppEnv

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

export interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: any
}

/** Troca o fetch global por um roteador; devolve as chamadas feitas (sem expor tokens nos testes). */
export function mockFetch(route: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const body = typeof init.body === 'string' ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : undefined
      const call: Call = {
        url: String(input),
        method: init.method ?? 'GET',
        headers: Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {})),
        body: body && body.startsWith('{') ? JSON.parse(body) : body,
      }
      calls.push(call)
      return route(call)
    }),
  )
  return calls
}

export const tokenReply = (extra: Record<string, unknown> = {}) =>
  json({ access_token: 'at-1', refresh_token: 'rt-2', expires_in: 3600, ...extra })

export const entityRow = (logical: string, set: string) => ({
  LogicalName: logical,
  EntitySetName: set,
  PrimaryIdAttribute: `${logical}id`,
  PrimaryNameAttribute: `${logical}_name`,
})

/** Roteador padrão: token do Entra + metadata de uma tabela `cr40f_reserva`. */
export function baseRoute(extra: (call: Call) => Response | undefined) {
  return (call: Call): Response => {
    if (call.url.includes('login.microsoftonline.com')) return tokenReply()
    if (call.url.includes("EntityDefinitions(LogicalName='cr40f_reserva')")) return json(entityRow('cr40f_reserva', 'cr40f_reservas'))
    return extra(call) ?? json({ error: { code: '0x1', message: `rota não mockada: ${call.url}` } }, 500)
  }
}
