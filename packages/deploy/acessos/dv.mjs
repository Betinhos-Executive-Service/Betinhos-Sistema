// Cliente comum da Web API para os scripts de acessos (corte, relatório, quem-le). Sem efeito ao importar.
// Token: no CI, conta de serviço (client_credentials, como projetos/publicados.mjs); local, DV_ACCESS_TOKEN do az,
// que por padrão só vale para o DEV. Mensagens de erro saem sem GUID (o log do Actions é público).
import { createHash } from 'node:crypto'

export const HOSTS = { dev: 'org23b93544.crm2.dynamics.com', prod: 'orgf261ae8e.crm2.dynamics.com' }
const GUID_EM_TEXTO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export const limpo = (texto) => String(texto ?? '').replace(GUID_EM_TEXTO, '<id>')
export const hashCurto = (id, sal) => createHash('sha256').update(`${sal}|${String(id).toLowerCase()}`).digest('hex').slice(0, 10)

export function ambienteDoHost(url) {
  const host = new URL(url).host.toLowerCase()
  return Object.keys(HOSTS).find((k) => HOSTS[k] === host) ?? null
}

export async function tokenDoAmbiente({ env = process.env, fetch = globalThis.fetch, somenteDevLocal = true } = {}) {
  const url = String(env.DV_ENVIRONMENT_URL ?? env.DV_URL ?? '').replace(/\/+$/, '')
  if (!url) throw new Error('Defina DV_ENVIRONMENT_URL (CI) ou DV_URL (local).')
  const ambiente = ambienteDoHost(url)
  if (!ambiente) throw new Error('host não é o DEV nem o PROD; nada feito')
  if (env.DV_ACCESS_TOKEN) {
    if (somenteDevLocal && ambiente !== 'dev') throw new Error('token local só vale para o DEV; o PROD só pelo workflow')
    return { url, ambiente, token: env.DV_ACCESS_TOKEN, local: true }
  }
  const { DV_TENANT_ID: tenant, DV_CLIENT_ID: cliente, DV_CLIENT_SECRET: segredo } = env
  if (!tenant || !cliente || !segredo) throw new Error('faltam DV_TENANT_ID, DV_CLIENT_ID ou DV_CLIENT_SECRET')
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cliente, client_secret: segredo, scope: `${url}/.default` }),
  })
  if (!r.ok) throw new Error(`token da conta de serviço falhou: ${r.status}`)
  return { url, ambiente, token: JSON.parse(await r.text()).access_token, local: false }
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms))

export function criarCliente({ url, token, fetch = globalThis.fetch, espera = dormir }) {
  const api = `${url.replace(/\/+$/, '')}/api/data/v9.2`
  async function chamar(metodo, caminho, corpo, extra = {}) {
    const alvo = caminho.startsWith('http') ? caminho : `${api}/${caminho}`
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra }
    if (corpo !== undefined) headers['Content-Type'] = 'application/json'
    for (let tentativa = 1; ; tentativa++) {
      const r = await fetch(alvo, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
      // POST não se repete em 5xx: a criação pode ter passado e a repetição duplicaria o registro.
      if ((r.status === 429 || (r.status >= 500 && metodo !== 'POST')) && tentativa < 4) {
        const depois = Number(r.headers?.get?.('Retry-After'))
        await espera(depois > 0 ? depois * 1000 : 2000 * tentativa)
        continue
      }
      const texto = await r.text()
      if (!r.ok) throw new Error(`${metodo} ${limpo(caminho.replace(api + '/', '').split('?')[0])} falhou: ${r.status} ${limpo(texto.slice(0, 300))}`)
      return texto ? JSON.parse(texto) : null
    }
  }
  async function todos(caminho) {
    const linhas = []
    let proxima = caminho
    while (proxima) {
      const j = await chamar('GET', proxima, undefined, { Prefer: 'odata.maxpagesize=500' })
      linhas.push(...(j?.value ?? []))
      proxima = j?.['@odata.nextLink'] ?? null
    }
    return linhas
  }
  const um = (caminho) => chamar('GET', caminho)
  // Tabelas de ligação: o nome do conjunto vem da metadata, nunca adivinhado.
  async function ligacao(logico, campos) {
    const meta = await um(`EntityDefinitions(LogicalName='${logico}')?$select=EntitySetName`)
    return todos(`${meta.EntitySetName}?$select=${campos}`)
  }
  return { api, chamar, todos, um, ligacao }
}
