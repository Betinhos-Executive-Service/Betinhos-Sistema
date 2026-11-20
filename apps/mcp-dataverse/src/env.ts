import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import type { DataverseMcp } from './mcp'

/** Ambientes do Dataverse atendidos pelo conector. */
export const AMBIENTES = ['DEV', 'TEST', 'PROD'] as const
export type Ambiente = (typeof AMBIENTES)[number]

/** Bindings, vars e secrets do Worker (ver wrangler.jsonc). */
export interface AppEnv {
  OAUTH_KV: KVNamespace
  OAUTH_PROVIDER: OAuthHelpers
  /** Limite de chamadas de ferramenta por usuário (binding `ratelimits`; ausente = sem limite). */
  RL_USER?: RateLimit
  MCP_OBJECT: DurableObjectNamespace<DataverseMcp>
  // vars
  ENTRA_TENANT_ID: string
  ENTRA_CLIENT_ID: string
  MCP_RESOURCE: string
  ALLOWED_EMAIL_DOMAIN: string
  DV_URL_DEV: string
  DV_URL_TEST: string
  DV_URL_PROD: string
  // secrets
  ENTRA_CLIENT_SECRET: string
  COOKIE_ENCRYPTION_KEY: string
}

/** Dados guardados (cifrados pelo OAuthProvider) no grant de cada pessoa. */
export interface Props extends Record<string, unknown> {
  oid: string
  email: string
  name: string
  refreshToken: string
}

export function dataverseUrl(env: AppEnv, ambiente: Ambiente): string {
  const url = { DEV: env.DV_URL_DEV, TEST: env.DV_URL_TEST, PROD: env.DV_URL_PROD }[ambiente]
  return url.replace(/\/+$/, '')
}
