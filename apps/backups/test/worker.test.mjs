import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usuarioDoAccess } from '../src/acesso.mjs'
import { agrupar, haQuanto, paginaHtml, tamanho } from '../src/pagina.mjs'
import worker from '../src/worker.mjs'

const b64url = (dados) => Buffer.from(dados).toString('base64url')
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1' }
const ENV = { ACCESS_EQUIPE: 'betinhos', ACCESS_AUD: 'aud-1' }
const certs = async (url) => {
  assert.equal(url, 'https://betinhos.cloudflareaccess.com/cdn-cgi/access/certs')
  return new Response(JSON.stringify({ keys: [jwk] }))
}

async function jwt(corpo, { kid = 'k1', chave = par.privateKey } = {}) {
  const base = `${b64url(JSON.stringify({ alg: 'RS256', kid }))}.${b64url(JSON.stringify({
    iss: 'https://betinhos.cloudflareaccess.com', aud: ['aud-1'], email: 'ana@gmail.com', exp: Math.floor(Date.now() / 1000) + 600, ...corpo,
  }))}`
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(base))
  return `${base}.${b64url(new Uint8Array(assinatura))}`
}

const pedido = (token, caminho = '/') => new Request(`https://backups-betinhos.x.workers.dev${caminho}`, { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} })

test('aceita token válido e devolve o e-mail', async () => {
  assert.equal(await usuarioDoAccess(pedido(await jwt({})), ENV, { fetchFn: certs }), 'ana@gmail.com')
})

test('recusa sem configuração, sem token, vencido, outra audiência, outro emissor e assinatura alheia', async () => {
  const outra = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign'])
  const casos = [
    [await jwt({}), {}],
    [null, ENV],
    [await jwt({ exp: Math.floor(Date.now() / 1000) - 10 }), ENV],
    [await jwt({ aud: ['outra'] }), ENV],
    [await jwt({ iss: 'https://x.cloudflareaccess.com' }), ENV],
    [await jwt({}, { chave: outra.privateKey }), ENV],
    [await jwt({}, { kid: 'nao-existe' }), ENV],
    ['a.b.c', ENV],
  ]
  for (const [token, env] of casos) assert.equal(await usuarioDoAccess(pedido(token), env, { fetchFn: certs }), null)
})

test('agrupa por tipo, mais nova primeiro, e ignora arquivo fora do padrão', () => {
  const g = agrupar([
    { key: 'diario/betinhos-prod-20261117-0323.zip', size: 5 * 1024 ** 2 },
    { key: 'diario/betinhos-prod-20261118-0323.zip', size: 1536 },
    { key: 'mensal/betinhos-prod-20261101-0323.zip', size: 10 },
    { key: 'outro/x.zip', size: 1 },
  ])
  assert.deepEqual(g.diario.map((i) => i.quando), ['18/11/2026 às 03:23', '17/11/2026 às 03:23'])
  assert.equal(g.mensal.length, 1)
  assert.equal(g.semanal.length, 0)
  assert.equal(tamanho(5 * 1024 ** 2), '5,0 MB')
})

const gravados = []
const bucket = {
  async list({ prefix }) {
    if (prefix === 'registros/downloads/') return { truncated: false, objects: [{ key: `registros/downloads/${String(1e13 - Date.UTC(2026, 10, 18, 12, 0)).padStart(13, '0')}-ab`, customMetadata: { email: 'bia@betinhos.com.br', chave: 'diario/betinhos-prod-20261117-0323.zip' } }] }
    return { truncated: false, objects: prefix === 'diario/' ? [{ key: 'diario/betinhos-prod-20261118-0323.zip', size: 2048 }] : [] }
  },
  async get(chave) {
    return chave === 'diario/betinhos-prod-20261118-0323.zip' ? { body: 'ZIP', size: 3 } : null
  },
  async put(chave, corpo, op) { gravados.push({ chave, ...op.customMetadata }) },
}
const ctx = { pendentes: [], waitUntil(p) { this.pendentes.push(p) } }

test('página: 403 sem login, lista e baixa com login, recusa chave fora do padrão', async () => {
  const env = { ...ENV, BACKUPS: bucket }
  const op = { fetchFn: certs }
  assert.equal((await worker.fetch(pedido(null), env, ctx, op)).status, 403)
  const token = await jwt({})
  const pagina = await worker.fetch(pedido(token), env, ctx, op)
  assert.equal(pagina.status, 200)
  const html = await pagina.text()
  assert.match(html, /18\/11\/2026 às 03:23/)
  assert.match(html, /ana@gmail\.com/)
  const zip = await worker.fetch(pedido(token, '/baixar/diario/betinhos-prod-20261118-0323.zip'), env, ctx, op)
  assert.equal(zip.status, 200)
  assert.match(zip.headers.get('Content-Disposition'), /attachment; filename="betinhos-prod-20261118-0323.zip"/)
  assert.equal(await zip.text(), 'ZIP')
  await Promise.all(ctx.pendentes)
  assert.equal(gravados.at(-1).email, 'ana@gmail.com')
  assert.match(gravados.at(-1).chave, /^diario\/betinhos-prod-20261118-0323\.zip$/)
  assert.match(html, /bia@betinhos\.com\.br<small>[^<]*cópia de 17\/11\/2026 às 03:23/)
  const n = gravados.length
  await worker.fetch(new Request('https://backups-betinhos.x.workers.dev/baixar/diario/betinhos-prod-20261118-0323.zip', { method: 'HEAD', headers: { 'Cf-Access-Jwt-Assertion': token } }), env, ctx, op)
  assert.equal(gravados.length, n)
  assert.equal((await worker.fetch(pedido(token, '/baixar/..%2Fsegredo'), env, ctx, op)).status, 404)
})

test('DEV_SEM_LOGIN só vale em localhost', async () => {
  const env = { DEV_SEM_LOGIN: '1', BACKUPS: bucket }
  assert.equal((await worker.fetch(new Request('http://localhost:52431/'), env, ctx)).status, 200)
  assert.equal((await worker.fetch(pedido(null), env, ctx)).status, 403)
})

test('kid novo fora do cache: busca as chaves de novo (troca de chave do Access)', async () => {
  await usuarioDoAccess(pedido(await jwt({})), ENV, { fetchFn: certs })
  const nova = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk2 = { ...(await crypto.subtle.exportKey('jwk', nova.publicKey)), kid: 'k2' }
  const certs2 = async () => new Response(JSON.stringify({ keys: [jwk, jwk2] }))
  assert.equal(await usuarioDoAccess(pedido(await jwt({}, { kid: 'k2', chave: nova.privateKey })), ENV, { fetchFn: certs2 }), 'ana@gmail.com')
})

test('destaque: em dia, parado há mais de 2 dias e vazio; uso do espaço', () => {
  const grupos = agrupar([{ key: 'diario/betinhos-prod-20261118-0323.zip', size: 512 * 1024 ** 2 }, { key: 'semanal/betinhos-prod-20261118-0323.zip', size: 512 * 1024 ** 2 }])
  const feita = Date.UTC(2026, 10, 18, 6, 23)
  const emDia = paginaHtml({ grupos, email: 'a', versao: 'v', agora: feita + 5 * 3600_000 })
  assert.match(emDia, /Backup em dia/)
  assert.match(emDia, /Baixar backup completo · 512,0 MB/)
  assert.doesNotMatch(emDia, /planilha de operação<\/a>/)
  assert.match(emDia, /Espaço usado: 1,0 GB de 10 GB/)
  assert.match(emDia, /Cópias anteriores<span class="n">0</)
  assert.match(paginaHtml({ grupos, email: 'a', versao: 'v', downloads: [{ ms: feita, email: 'x', chave: 'mensal/betinhos-prod-20261101-0323.zip' }] }), /cópia de 01\/11\/2026 às 03:23/)
  assert.doesNotMatch(emDia, /role="alert"/)
  const parado = paginaHtml({ grupos, email: 'a', versao: 'v', agora: feita + 3 * 86400_000 })
  assert.match(parado, /Backup parado/)
  assert.match(parado, /role="alert"/)
  const vazio = paginaHtml({ grupos: agrupar([]), email: 'a', versao: 'v' })
  assert.match(vazio, /Nenhuma cópia ainda/)
  assert.doesNotMatch(vazio, /class="botao"/)
  assert.match(vazio, /Espaço usado: 0 MB/)
  assert.equal(haQuanto(30_000), 'agora há pouco')
  assert.equal(haQuanto(50 * 3600_000), 'há 2 dias')
})

test('planilha de operação: botão principal, completo secundário e os dois na lista de anteriores', () => {
  const grupos = agrupar([
    { key: 'diario/betinhos-prod-20261118-0323.zip', size: 20 * 1024 ** 2 },
    { key: 'diario/betinhos-prod-operacao-20261118-0323.zip', size: 300 * 1024 },
    { key: 'diario/betinhos-prod-20261117-0323.zip', size: 20 * 1024 ** 2 },
    { key: 'diario/betinhos-prod-operacao-20261117-0323.zip', size: 300 * 1024 },
    { key: 'semanal/betinhos-prod-operacao-20261117-0323.zip', size: 300 * 1024 },
  ])
  assert.equal(grupos.diario.filter((i) => i.operacao).length, 2)
  const html = paginaHtml({ grupos, email: 'a', versao: 'v', agora: Date.UTC(2026, 10, 18, 8), downloads: [{ ms: 1, email: 'x', chave: 'diario/betinhos-prod-operacao-20261117-0323.zip' }] })
  assert.match(html, /<a class="botao" href="\/baixar\/diario\/betinhos-prod-operacao-20261118-0323\.zip" download>.*Baixar planilha de operação<\/a>/)
  assert.match(html, /<a class="botao sec" href="\/baixar\/diario\/betinhos-prod-20261118-0323\.zip" download>.*Baixar backup completo · 20,0 MB/)
  assert.match(html, /Cópias anteriores<span class="n">1</)
  assert.match(html, /17\/11\/2026 às 03:23<span class="tag">Semanal<\/span>/)
  assert.match(html, /aria-label="Baixar planilha de operação de 17\/11\/2026 às 03:23"/)
  assert.match(html, /aria-label="Baixar backup completo de 17\/11\/2026 às 03:23"/)
  assert.match(html, /planilha de operação de 17\/11\/2026 às 03:23/)
})
