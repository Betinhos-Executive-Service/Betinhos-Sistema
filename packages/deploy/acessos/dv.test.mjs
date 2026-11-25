import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOSTS, ambienteDoHost, criarCliente, hashCurto, limpo, tokenDoAmbiente } from './dv.mjs'

const URL_DEV = `https://${HOSTS.dev}`
const resposta = (status, corpo, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(cabecalhos),
  text: async () => (corpo === undefined ? '' : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
})
function falso(respostas) {
  const chamadas = []
  const fetch = async (url, init = {}) => {
    chamadas.push({ url, init })
    return respostas.shift()
  }
  return { fetch, chamadas }
}

test('todos segue o nextLink e pede páginas de 500', async () => {
  const proxima = `${URL_DEV}/api/data/v9.2/roles?$skiptoken=2`
  const { fetch, chamadas } = falso([resposta(200, { value: [1], '@odata.nextLink': proxima }), resposta(200, { value: [2] })])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch })
  assert.deepEqual(await dv.todos('roles?$select=name'), [1, 2])
  assert.equal(chamadas[0].url, `${URL_DEV}/api/data/v9.2/roles?$select=name`)
  assert.equal(chamadas[1].url, proxima)
  assert.equal(chamadas[0].init.headers.Prefer, 'odata.maxpagesize=500')
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer t')
})

test('chamar repete 429 e 5xx e depois devolve o JSON', async () => {
  const esperas = []
  const { fetch } = falso([resposta(429, 'devagar', { 'Retry-After': '1' }), resposta(503, 'fora'), resposta(200, { ok: 1 })])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch, espera: async (ms) => esperas.push(ms) })
  assert.deepEqual(await dv.chamar('GET', 'WhoAmI'), { ok: 1 })
  assert.deepEqual(esperas, [1000, 4000])
})

test('chamar não repete POST em 5xx, para não duplicar a criação', async () => {
  const { fetch, chamadas } = falso([resposta(503, 'fora'), resposta(200, { ok: 1 })])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch, espera: async () => {} })
  await assert.rejects(dv.chamar('POST', 'businessunits', { a: 1 }), /503/)
  assert.equal(chamadas.length, 1)
})

test('erro sai sem GUID e 204 vira null', async () => {
  const id = '00000000-0000-0000-0000-000000000001'
  const { fetch } = falso([resposta(400, `papel ${id} recusado`), resposta(204)])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch })
  await assert.rejects(dv.chamar('DELETE', `teams(${id})/teamroles_association(${id})/$ref`), (e) => {
    assert.match(e.message, /DELETE teams\(<id>\)\/teamroles_association\(<id>\)\/\$ref falhou: 400 papel <id> recusado/)
    assert.doesNotMatch(e.message, /0000-0000/)
    return true
  })
  assert.equal(await dv.chamar('POST', 'x', { a: 1 }), null)
})

test('corpo vai em JSON com Content-Type e cabeçalho extra passa', async () => {
  const { fetch, chamadas } = falso([resposta(204)])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch })
  await dv.chamar('POST', 'teams(x)/teamroles_association/$ref', { '@odata.id': 'r' }, { MSCRMCallerID: 'u' })
  assert.equal(chamadas[0].init.body, '{"@odata.id":"r"}')
  assert.equal(chamadas[0].init.headers['Content-Type'], 'application/json')
  assert.equal(chamadas[0].init.headers.MSCRMCallerID, 'u')
})

test('ligacao pega o EntitySetName da metadata', async () => {
  const { fetch, chamadas } = falso([resposta(200, { EntitySetName: 'teamrolescollection' }), resposta(200, { value: [{ teamid: 'a' }] })])
  const dv = criarCliente({ url: URL_DEV, token: 't', fetch })
  assert.deepEqual(await dv.ligacao('teamroles', 'teamid,roleid'), [{ teamid: 'a' }])
  assert.equal(chamadas[0].url, `${URL_DEV}/api/data/v9.2/EntityDefinitions(LogicalName='teamroles')?$select=EntitySetName`)
  assert.equal(chamadas[1].url, `${URL_DEV}/api/data/v9.2/teamrolescollection?$select=teamid,roleid`)
})

test('token: host desconhecido e PROD local são recusados', async () => {
  await assert.rejects(tokenDoAmbiente({ env: { DV_URL: 'https://outro.crm2.dynamics.com', DV_ACCESS_TOKEN: 't' } }), /não é o DEV nem o PROD/)
  await assert.rejects(tokenDoAmbiente({ env: { DV_URL: `https://${HOSTS.prod}/`, DV_ACCESS_TOKEN: 't' } }), /PROD só pelo workflow/)
  const prod = await tokenDoAmbiente({ env: { DV_URL: `https://${HOSTS.prod}/`, DV_ACCESS_TOKEN: 't' }, somenteDevLocal: false })
  assert.deepEqual(prod, { url: `https://${HOSTS.prod}`, ambiente: 'prod', token: 't', local: true })
})

test('token: conta de serviço pede client_credentials com o escopo do ambiente', async () => {
  const { fetch, chamadas } = falso([resposta(200, { access_token: 'srv' })])
  const env = { DV_ENVIRONMENT_URL: `${URL_DEV}/`, DV_TENANT_ID: 'ten', DV_CLIENT_ID: 'cli', DV_CLIENT_SECRET: 'seg' }
  const s = await tokenDoAmbiente({ env, fetch })
  assert.deepEqual(s, { url: URL_DEV, ambiente: 'dev', token: 'srv', local: false })
  assert.equal(chamadas[0].url, 'https://login.microsoftonline.com/ten/oauth2/v2.0/token')
  const corpo = new URLSearchParams(String(chamadas[0].init.body))
  assert.equal(corpo.get('grant_type'), 'client_credentials')
  assert.equal(corpo.get('scope'), `${URL_DEV}/.default`)
  await assert.rejects(tokenDoAmbiente({ env: { DV_ENVIRONMENT_URL: URL_DEV }, fetch }), /faltam DV_TENANT_ID/)
})

test('hash curto, limpo e host', () => {
  const id = '00000000-0000-0000-0000-0000000000AB'
  assert.match(hashCurto(id, 'h'), /^[0-9a-f]{10}$/)
  assert.equal(hashCurto(id, 'h'), hashCurto(id.toLowerCase(), 'h'))
  assert.notEqual(hashCurto(id, 'h'), hashCurto(id, 'outro'))
  assert.equal(limpo(`x ${id} y`), 'x <id> y')
  assert.equal(ambienteDoHost(`https://${HOSTS.dev.toUpperCase()}/`), 'dev')
  assert.equal(ambienteDoHost('https://outro.crm2.dynamics.com'), null)
})
