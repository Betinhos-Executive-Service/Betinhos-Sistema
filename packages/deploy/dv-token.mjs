// Login por código de dispositivo para rodar os scripts de provisionamento fora do Windows (Linux/macOS),
// com o mesmo cliente público do `az login`. Não imprime tokens além do `token`, que vai para stdout.
//
//   node packages/deploy/dv-token.mjs login [https://org23b93544.crm2.dynamics.com]   # você abre o link e digita o código
//   export DV_ACCESS_TOKEN=$(node packages/deploy/dv-token.mjs token https://org23b93544.crm2.dynamics.com)
//   export FLOW_ACCESS_TOKEN=$(node packages/deploy/dv-token.mjs token https://service.flow.microsoft.com)
//
// O refresh token fica em ~/.cache/betinhos-dv/refresh.json (modo 600), fora do repositório. `logout` apaga.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46' // Azure CLI (cliente público)
const AUTH = 'https://login.microsoftonline.com/organizations/oauth2/v2.0'
const DIR = join(homedir(), '.cache', 'betinhos-dv')
const FILE = join(DIR, 'refresh.json')
const DEV = 'https://org23b93544.crm2.dynamics.com'

const form = (data) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) })
// Rede instável não derruba o login: repete até 4 vezes antes de desistir.
const post = async (path, data) => {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const response = await fetch(`${AUTH}/${path}`, form(data))
      return { ok: response.ok, body: await response.json() }
    } catch (error) {
      if (tentativa >= 4) throw error
      await new Promise((resolve) => setTimeout(resolve, 1500 * tentativa))
    }
  }
}
const resourceScope = (resource) => `${resource.replace(/\/+$/, '')}/.default`

async function login(resource) {
  const code = await post('devicecode', { client_id: CLIENT_ID, scope: `${resourceScope(resource)} offline_access` })
  if (!code.ok) throw new Error(`Falha ao iniciar o login: ${code.body.error_description ?? code.body.error}`)
  console.error(`\n${code.body.message}\n`)
  const limite = Date.now() + code.body.expires_in * 1000
  let espera = (code.body.interval ?? 5) * 1000
  while (Date.now() < limite) {
    await new Promise((resolve) => setTimeout(resolve, espera))
    const token = await post('token', { client_id: CLIENT_ID, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: code.body.device_code })
    if (token.ok) {
      mkdirSync(DIR, { recursive: true, mode: 0o700 })
      writeFileSync(FILE, JSON.stringify({ refresh_token: token.body.refresh_token }), { mode: 0o600 })
      chmodSync(FILE, 0o600)
      console.error('Login concluído.')
      return
    }
    if (token.body.error === 'slow_down') espera += 5000
    else if (token.body.error !== 'authorization_pending') throw new Error(`Login recusado: ${token.body.error_description ?? token.body.error}`)
  }
  throw new Error('Código expirou antes do login.')
}

async function token(resource) {
  if (!existsSync(FILE)) throw new Error('Sem login: rode `node packages/deploy/dv-token.mjs login` primeiro.')
  const { refresh_token } = JSON.parse(readFileSync(FILE, 'utf8'))
  const response = await post('token', { client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token, scope: `${resourceScope(resource)} offline_access` })
  if (!response.ok) throw new Error(`Não foi possível renovar o token de ${resource}: ${response.body.error_description ?? response.body.error}`)
  if (response.body.refresh_token) writeFileSync(FILE, JSON.stringify({ refresh_token: response.body.refresh_token }), { mode: 0o600 })
  process.stdout.write(response.body.access_token)
}

const [comando, resource] = process.argv.slice(2)
try {
  if (comando === 'login') await login(resource ?? DEV)
  else if (comando === 'token' && resource) await token(resource)
  else if (comando === 'logout') { rmSync(FILE, { force: true }); console.error('Login removido.') }
  else { console.error('Uso: dv-token.mjs login [recurso] | token <recurso> | logout'); process.exit(2) }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
