import { env } from 'cloudflare:workers'
import OAuthProvider, { OAuthError } from '@cloudflare/workers-oauth-provider'
import { defaultHandler } from './auth'
import { dataverseUrl, type AppEnv } from './env'
import { EntraError, refreshForResource } from './entra'
import { DataverseMcp } from './mcp'

export { DataverseMcp }

const appEnv = env as unknown as AppEnv

export default new OAuthProvider<AppEnv>({
  apiHandlers: {
    '/mcp': DataverseMcp.serve('/mcp'),
    '/sse': DataverseMcp.serveSSE('/sse'),
  },
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  // Access token de 1 h; refresh de no máx. 90 dias (limite do Entra) e 30 dias sem uso.
  accessTokenTTL: 3600,
  refreshTokenTTL: 90 * 86400,
  refreshTokenIdleTTL: 30 * 86400,
  resourceMetadata: { resource: appEnv.MCP_RESOURCE },
  // O refresh token do Entra gira junto com o do conector: renova e regrava nas props.
  async tokenExchangeCallback({ grantType, props, env }) {
    if (grantType !== 'refresh_token') return
    try {
      const fresh = await refreshForResource(env, props.refreshToken, dataverseUrl(env, 'DEV'))
      return { newProps: { ...props, refreshToken: fresh.refreshToken ?? props.refreshToken } }
    } catch (error) {
      if (error instanceof EntraError && error.code === 'invalid_grant') {
        throw new OAuthError('invalid_grant', { description: 'A sessão Microsoft expirou; entre de novo no conector.', statusCode: 400 })
      }
      throw new OAuthError('temporarily_unavailable', { description: 'Falha ao renovar a sessão Microsoft.', statusCode: 503 })
    }
  },
})
