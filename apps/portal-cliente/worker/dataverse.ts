// Web API do Dataverse com usuário de aplicação (OAuth client credentials). Token em cache no KV.
import type { Env } from './env'
import type { Registro } from './mapear'

export type Dv = {
  get(caminho: string): Promise<Registro>
  lista(caminho: string): Promise<Registro[]>
  patch(caminho: string, corpo: Registro): Promise<void>
  post(caminho: string, corpo: Registro): Promise<void>
}

const CHAVE_TOKEN = 'dv:token'

async function token(env: Env, f: typeof fetch): Promise<string> {
  const cache = await env.KV.get(CHAVE_TOKEN)
  if (cache) return cache
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.DV_CLIENT_ID,
    client_secret: env.DV_CLIENT_SECRET,
    scope: `${env.DV_URL.replace(/\/$/, '')}/.default`,
  })
  const r = await f(`https://login.microsoftonline.com/${env.DV_TENANT}/oauth2/v2.0/token`, { method: 'POST', body: corpo })
  if (!r.ok) throw new Error(`token Dataverse: HTTP ${r.status}`)
  const { access_token, expires_in } = (await r.json()) as { access_token: string; expires_in: number }
  // Guarda até 5 min antes de expirar (TTL mínimo do KV é 60 s).
  await env.KV.put(CHAVE_TOKEN, access_token, { expirationTtl: Math.max(60, expires_in - 300) })
  return access_token
}

export function criarDv(env: Env, f: typeof fetch = fetch): Dv {
  async function chamar(metodo: string, caminho: string, corpo?: Registro): Promise<Response> {
    // URL montada só na chamada: rota sem Dataverse (ex.: 401 sem sessão) não depende dos secrets.
    if (!env.DV_URL) throw new Error('secret DV_URL ausente')
    const r = await f(`${env.DV_URL.replace(/\/$/, '')}/api/data/v9.2/${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${await token(env, f)}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    if (r.status === 401) await env.KV.delete(CHAVE_TOKEN)
    if (!r.ok) throw new Error(`Dataverse ${metodo} ${caminho.split('?')[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`)
    return r
  }
  return {
    get: async (c) => (await (await chamar('GET', c)).json()) as Registro,
    lista: async (c) => ((await (await chamar('GET', c)).json()) as { value: Registro[] }).value,
    patch: async (c, corpo) => void (await chamar('PATCH', c, corpo)),
    post: async (c, corpo) => void (await chamar('POST', c, corpo)),
  }
}

export type TipoEmail = 'codigo' | 'resumo_diario' | 'resposta_betinhos'

export async function enviarEmail(env: Env, tipo: TipoEmail, para: string[], dados: Registro, f: typeof fetch = fetch): Promise<void> {
  const r = await f(env.EMAIL_FLOW_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, para, dados }) })
  if (!r.ok) throw new Error(`flow de e-mail (${tipo}): HTTP ${r.status}`)
}
