import { dataverseUrl, type AppEnv } from './env'

/** Erro do endpoint de token ou da validação de identidade (nunca carrega token). */
export class EntraError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

const authority = (env: AppEnv) => `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}`

/** Escopos do login: identidade, refresh token e o Dataverse do DEV (o refresh vale para os outros ambientes). */
export const loginScope = (env: AppEnv) =>
  ['openid', 'profile', 'email', 'offline_access', `${dataverseUrl(env, 'DEV')}/user_impersonation`].join(' ')

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(digest))
}

export function newVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(48)))
}

export function authorizeUrl(env: AppEnv, p: { redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(`${authority(env)}/oauth2/v2.0/authorize`)
  url.search = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: p.redirectUri,
    response_mode: 'query',
    scope: loginScope(env),
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return url.toString()
}

export interface TokenResult {
  accessToken: string
  refreshToken?: string
  idToken?: string
  /** Segundos de validade do access token. */
  expiresIn: number
}

async function tokenRequest(env: AppEnv, params: Record<string, string>): Promise<TokenResult> {
  const response = await fetch(`${authority(env)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.ENTRA_CLIENT_ID,
      client_secret: env.ENTRA_CLIENT_SECRET,
      ...params,
    }),
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || typeof body.access_token !== 'string') {
    const code = typeof body.error === 'string' ? body.error : 'token_error'
    // error_description traz trace id e timestamp; basta a primeira linha.
    const description = String(body.error_description ?? '').split(/\r?\n/)[0]
    throw new EntraError(`Entra recusou a troca de token (${code}): ${description}`, code, response.status)
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    idToken: typeof body.id_token === 'string' ? body.id_token : undefined,
    expiresIn: Number(body.expires_in ?? 3600),
  }
}

export const exchangeCode = (env: AppEnv, p: { code: string; redirectUri: string; verifier: string }) =>
  tokenRequest(env, {
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
    scope: loginScope(env),
  })

/** Access token do Dataverse de um ambiente, a partir do refresh token (vale para qualquer recurso do tenant). */
export const refreshForResource = (env: AppEnv, refreshToken: string, resourceUrl: string) =>
  tokenRequest(env, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: `${resourceUrl}/.default offline_access`,
  })

export interface Identity {
  oid: string
  email: string
  name: string
}

function decodeClaims(idToken: string): Record<string, unknown> {
  const part = idToken.split('.')[1]
  if (!part) throw new EntraError('id_token inválido.', 'invalid_id_token')
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0))))
}

/**
 * Valida a identidade do id_token recebido direto do endpoint de token (canal TLS com client secret,
 * então a assinatura não precisa ser conferida): tenant, audiência e domínio do e-mail.
 */
export function validateIdentity(env: AppEnv, idToken: string | undefined): Identity {
  if (!idToken) throw new EntraError('O Entra não devolveu id_token.', 'invalid_id_token')
  const claims = decodeClaims(idToken)
  if (claims.tid !== env.ENTRA_TENANT_ID) {
    throw new EntraError('Conta de outro tenant não é aceita.', 'wrong_tenant', 403)
  }
  if (claims.aud !== env.ENTRA_CLIENT_ID) {
    throw new EntraError('id_token emitido para outro aplicativo.', 'wrong_audience', 403)
  }
  // E-mail não é verificado pelo Entra: o login vem de preferred_username/upn. Convidado (B2B) não entra.
  const email = String(claims.preferred_username ?? claims.upn ?? claims.email ?? '').toLowerCase()
  if (`${claims.preferred_username ?? ''} ${claims.upn ?? ''}`.includes('#EXT#') || Number(claims.acct) === 1) {
    throw new EntraError('Contas convidadas não são aceitas.', 'guest_not_allowed', 403)
  }
  // Lista separada por vírgula (ex.: betinhos.com.br,betinhos.onmicrosoft.com).
  const domains = env.ALLOWED_EMAIL_DOMAIN.split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
  if (!domains.some((d) => email.endsWith(`@${d}`))) {
    throw new EntraError(`Só contas ${domains.map((d) => `@${d}`).join(' ou ')} são aceitas.`, 'wrong_domain', 403)
  }
  const oid = String(claims.oid ?? claims.sub ?? '')
  if (!oid) throw new EntraError('id_token sem identificador do usuário.', 'invalid_id_token')
  return { oid, email, name: String(claims.name ?? email) }
}
