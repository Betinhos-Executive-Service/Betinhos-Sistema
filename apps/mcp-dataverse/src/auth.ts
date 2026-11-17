import { AuthorizationError, CimdFetchError, authorizationErrorRedirect, type AuthRequest } from '@cloudflare/workers-oauth-provider'
import { SERVER_NAME, SERVER_VERSION } from './mcp'
import type { AppEnv } from './env'
import { PAGE_SECURITY_HEADERS } from './seguranca'
import { EntraError, authorizeUrl, exchangeCode, newVerifier, pkceChallenge, validateIdentity } from './entra'

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const PAGE_CSS =
  'body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a}' +
  'button{font:inherit;padding:.6rem 1.2rem;border-radius:.4rem;border:1px solid #888;cursor:pointer}' +
  'button.ok{background:#1a1a1a;color:#fff}.warn{background:#fff4d6;padding:.6rem;border-radius:.4rem}' +
  '@media(prefers-color-scheme:dark){body{background:#111;color:#eee}button{background:#222;color:#eee}button.ok{background:#eee;color:#111}.warn{background:#4a3b10}}'


function page(title: string, body: string, status = 200, headers?: Headers): Response {
  const h = new Headers(headers)
  h.set('Content-Type', 'text/html; charset=utf-8')
  for (const [k, v] of Object.entries(PAGE_SECURITY_HEADERS)) h.set(k, v)
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${PAGE_CSS}</style></head><body>${body}</body></html>`
  return new Response(html, { status, headers: h })
}

const homePage = () =>
  page(SERVER_NAME, `<h1>${SERVER_NAME}</h1><p>Servidor MCP do Dataverse da Betinhos. Versão ${escapeHtml(SERVER_VERSION)}.</p><p>Endpoint: <code>/mcp</code> (Streamable HTTP) e <code>/sse</code>.</p>`)

const errorPage = (message: string, status = 400) => page('Erro', `<h1>Não foi possível entrar</h1><p>${escapeHtml(message)}</p>`, status)

const callbackUrl = (request: Request) => `${new URL(request.url).origin}/callback`

async function showConsent(request: Request, env: AppEnv, authRequest: AuthRequest): Promise<Response> {
  const subjectless = { secret: env.COOKIE_ENCRYPTION_KEY }
  if (await env.OAUTH_PROVIDER.isConsentRemembered(request, authRequest, subjectless)) {
    return redirectToEntra(request, env, authRequest)
  }
  const [info, tx] = await Promise.all([env.OAUTH_PROVIDER.describeConsent(authRequest), env.OAUTH_PROVIDER.beginConsent(authRequest)])
  const who = info.clientDomain ? `${escapeHtml(info.clientName)} (${escapeHtml(info.clientDomain)})` : escapeHtml(info.clientName)
  const body =
    `<h1>Autorizar conector</h1><p><strong>${who}</strong> quer usar o Dataverse da Betinhos com a sua conta Microsoft.</p>` +
    `<p>Os dados voltam para: <code>${escapeHtml(info.redirectHost)}</code></p>` +
    (info.redirectIsLoopback ? '<p class="warn">Atenção: o destino é um app local neste computador.</p>' : '') +
    '<p>Em seguida você entra com a conta @betinhos.com.br. As chamadas ao Dataverse rodam com as suas permissões.</p>' +
    `<form method="post" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(tx.handle)}">` +
    '<button class="ok" name="action" value="approve">Autorizar</button> <button name="action" value="deny">Negar</button></form>'
  return page('Autorizar conector', body, 200, tx.headers)
}

async function redirectToEntra(request: Request, env: AppEnv, authRequest: AuthRequest, consentHeaders?: Headers): Promise<Response> {
  const verifier = newVerifier()
  const { state, headers } = await env.OAUTH_PROVIDER.beginUpstream(authRequest, { data: { verifier }, headers: consentHeaders })
  const url = authorizeUrl(env, { redirectUri: callbackUrl(request), state, challenge: await pkceChallenge(verifier) })
  headers.set('Location', url)
  return new Response(null, { status: 302, headers })
}

async function authorize(request: Request, env: AppEnv): Promise<Response> {
  if (request.method === 'POST') {
    // Defesa em profundidade além do cookie de transação da biblioteca: POST só da própria origem.
    const origin = request.headers.get('Origin')
    if (origin && origin !== new URL(request.url).origin) return errorPage('Origem não permitida.', 403)
    const form = await request.formData()
    const handle = String(form.get('handle') ?? '')
    if (form.get('action') === 'deny') {
      const denied = await env.OAUTH_PROVIDER.denyConsent(request, handle)
      const headers = new Headers(denied.headers)
      headers.set('Location', denied.redirectTo)
      return new Response(null, { status: 302, headers })
    }
    const approved = await env.OAUTH_PROVIDER.approveConsent(request, handle, { remember: { secret: env.COOKIE_ENCRYPTION_KEY } })
    return redirectToEntra(request, env, approved.request, approved.headers)
  }
  const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request)
  return showConsent(request, env, authRequest)
}

async function callback(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url)
  const resumed = await env.OAUTH_PROVIDER.finishUpstream<{ verifier: string }>(request)
  const entraError = url.searchParams.get('error')
  if (entraError) {
    const headers = new Headers(resumed.headers)
    headers.set('Location', authorizationErrorRedirect(resumed.request, 'access_denied', url.searchParams.get('error_description') ?? entraError))
    return new Response(null, { status: 302, headers })
  }
  const code = url.searchParams.get('code')
  if (!code) return errorPage('Resposta do Microsoft sem código de autorização.')
  try {
    const tokens = await exchangeCode(env, { code, redirectUri: callbackUrl(request), verifier: resumed.data.verifier })
    const identity = validateIdentity(env, tokens.idToken)
    if (!tokens.refreshToken) throw new EntraError('O Entra não devolveu refresh token.', 'no_refresh_token')
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: resumed.request,
      userId: identity.oid,
      metadata: { email: identity.email },
      scope: resumed.request.scope,
      props: { oid: identity.oid, email: identity.email, name: identity.name, refreshToken: tokens.refreshToken },
    })
    const headers = new Headers(resumed.headers)
    headers.set('Location', redirectTo)
    return new Response(null, { status: 302, headers })
  } catch (error) {
    if (error instanceof EntraError) return errorPage(error.message, error.status >= 400 ? error.status : 400)
    throw error
  }
}

/** Rotas do servidor de autorização: home, /authorize (consentimento + Entra) e /callback. */
export const defaultHandler: ExportedHandler<AppEnv> = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    try {
      if (pathname === '/') return homePage()
      if (pathname === '/authorize') return await authorize(request, env)
      if (pathname === '/callback') return await callback(request, env)
      return new Response('Não encontrado', { status: 404 })
    } catch (error) {
      if (error instanceof AuthorizationError) return errorPage(error.message, 400)
      if (error instanceof CimdFetchError) return errorPage('Não foi possível validar o cliente que pediu acesso.', 400)
      console.error('auth', error instanceof Error ? error.message : 'erro')
      return errorPage('Erro interno ao autenticar.', 500)
    }
  },
}
