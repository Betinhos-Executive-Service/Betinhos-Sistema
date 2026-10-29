// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { totp } from './cripto'
import { bancoInicial, envFalso, fetchFalso, kvMemoria, type Banco, type Email } from './fakeDataverse'
import worker from './index'

const ORIGEM = 'https://portal.test'
let banco: Banco, emails: Email[], env: ReturnType<typeof envFalso>, pendentes: Promise<unknown>[]
const exec = { waitUntil: (p: Promise<unknown>) => void pendentes.push(p) }

beforeEach(() => {
  banco = bancoInicial()
  emails = []
  pendentes = []
  env = envFalso(kvMemoria())
  vi.stubGlobal('fetch', fetchFalso(banco, emails))
})
afterEach(() => vi.unstubAllGlobals())

async function chamar(metodo: string, caminho: string, corpo?: unknown, cookie = '', origem: string | null = ORIGEM) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (origem) headers.Origin = origem
  if (cookie) headers.Cookie = cookie
  const r = await worker.fetch(new Request(ORIGEM + '/api' + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), env, exec)
  await Promise.all(pendentes)
  return r
}

/** Cookies `nome=valor` da resposta, para mandar na próxima chamada. */
const cookies = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ')

async function pedirCodigo(email: string) {
  await chamar('POST', '/auth/codigo', { email })
  return String(emails.at(-1)?.dados.codigo ?? '')
}

/** Login completo com cadastro do autenticador; devolve o cookie de sessão. */
async function logar(email = 'fiscal@tenaris.com') {
  const codigo = await pedirCodigo(email)
  const r = await chamar('POST', '/auth/entrar', { email, codigo })
  const { segredo } = (await r.json()) as { segredo: string }
  const t = await chamar('POST', '/auth/totp', { codigo: await totp(segredo, Math.floor(Date.now() / 30000)), lembrar: false }, cookies(r))
  expect(t.status).toBe(200)
  return cookies(t)
}

describe('login', () => {
  it('e-mail não cadastrado: 204 e nada enviado', async () => {
    const r = await chamar('POST', '/auth/codigo', { email: 'ninguem@tenaris.com' })
    expect(r.status).toBe(204)
    expect(emails).toHaveLength(0)
  })

  it('e-mail cadastrado: 204, código no e-mail e só o hash no Dataverse', async () => {
    const codigo = await pedirCodigo('Fiscal@Tenaris.com ')
    expect(codigo).toMatch(/^\d{6}$/)
    expect(JSON.stringify(banco.codigoacessos)).not.toContain(`"${codigo}"`)
  })

  it('5 códigos errados: 401 ×4 e depois 429, mesmo com o código certo', async () => {
    const certo = await pedirCodigo('fiscal@tenaris.com')
    const errado = certo === '000000' ? '111111' : '000000'
    for (let i = 0; i < 4; i++) expect((await chamar('POST', '/auth/entrar', { email: 'fiscal@tenaris.com', codigo: errado })).status).toBe(401)
    expect((await chamar('POST', '/auth/entrar', { email: 'fiscal@tenaris.com', codigo: errado })).status).toBe(429)
    const r = await chamar('POST', '/auth/entrar', { email: 'fiscal@tenaris.com', codigo: certo })
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ erro: 'bloqueado' })
  })

  it('1º acesso: QR + TOTP errado 401; certo entra e grava o segredo cifrado', async () => {
    const codigo = await pedirCodigo('fiscal@tenaris.com')
    const r = await chamar('POST', '/auth/entrar', { email: 'fiscal@tenaris.com', codigo })
    const corpo = (await r.json()) as { etapa: string; segredo: string; otpauthUrl: string }
    expect(corpo.etapa).toBe('cadastrar_autenticador')
    expect(corpo.otpauthUrl).toContain(`secret=${corpo.segredo}`)
    const ruim = await chamar('POST', '/auth/totp', { codigo: '000000' }, cookies(r))
    expect(ruim.status).toBe(401)
    expect(await ruim.json()).toEqual({ erro: 'totp_invalido' })
    const ok = await chamar('POST', '/auth/totp', { codigo: await totp(corpo.segredo, Math.floor(Date.now() / 30000)), lembrar: true }, cookies(r))
    expect(await ok.json()).toEqual({ nome: 'Marcos', email: 'fiscal@tenaris.com', cliente: 'Tenaris' })
    const setCookie = ok.headers.getSetCookie().join('\n')
    expect(setCookie).toMatch(/__Host-portal_sessao=[^;]+; Path=\/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict/)
    const gravado = String(banco.validadorclientes[0].cr40f_segredototp)
    expect(gravado).not.toContain(corpo.segredo)
    expect(banco.validadorclientes[0].cr40f_totpcadastradoem).toBeTruthy()
    expect(banco.dispositivoconfiavels).toHaveLength(1)

    // Computador lembrado: próximo login só com o código do e-mail.
    const dispositivo = cookies(ok).split('; ').find((c) => c.startsWith('__Host-portal_dispositivo='))!
    const codigo2 = await pedirCodigo('fiscal@tenaris.com')
    const r2 = await chamar('POST', '/auth/entrar', { email: 'fiscal@tenaris.com', codigo: codigo2 }, dispositivo)
    expect(((await r2.json()) as { etapa: string }).etapa).toBe('ok')
  })

  it('TOTP sem passar pelo código do e-mail: 401', async () => {
    expect((await chamar('POST', '/auth/totp', { codigo: '123456' })).status).toBe(401)
  })
})

describe('serviços', () => {
  it('sem cookie: 401', async () => {
    expect((await chamar('GET', '/servicos')).status).toBe(401)
  })

  it('cookie adulterado: 401', async () => {
    const sessao = await logar()
    expect((await chamar('GET', '/servicos', undefined, sessao.slice(0, -3) + 'AAA')).status).toBe(401)
  })

  it('POST sem Origin da própria origem: 403 (CSRF)', async () => {
    const sessao = await logar()
    expect((await chamar('POST', '/servicos/aprovar', { ids: [] }, sessao, null)).status).toBe(403)
    expect((await chamar('POST', '/servicos/aprovar', { ids: [] }, sessao, 'https://mal.example')).status).toBe(403)
  })

  it('lista só os do cliente e sem Retirado; só o nome do passageiro', async () => {
    const lista = (await (await chamar('GET', '/servicos', undefined, await logar())).json()) as Array<{ numero: string; passageiros: string[] }>
    expect(lista.map((s) => s.numero).sort()).toEqual(['10801', '10802', '10803'])
    expect(lista[0].passageiros).toEqual(['Ana'])
  })

  it('validador de outro cliente pedindo id da Tenaris: 404 e nada muda', async () => {
    const sessaoOutro = await logar('olga@outro.com')
    const id = '22222222-2222-2222-2222-222222222222'
    expect((await chamar('POST', `/servicos/${id}/duvida`, { motivo: 'valor', texto: 'ok?' }, sessaoOutro)).status).toBe(404)
    expect(await (await chamar('POST', '/servicos/aprovar', { ids: [id] }, sessaoOutro)).json()).toEqual([])
    expect(await (await chamar('GET', '/servicos', undefined, sessaoOutro)).json()).toEqual([])
    expect(banco.validacaoservicos[1].cr40f_status).toBe(100000000)
  })

  it('aprovar em lote ignora o que não pode; dúvida exige motivo e muda o status', async () => {
    const sessao = await logar()
    const aprovados = (await (await chamar('POST', '/servicos/aprovar', { ids: ['22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222224'] }, sessao)).json()) as Array<{ status: string }>
    expect(aprovados.map((s) => s.status)).toEqual(['aprovado'])
    const id = '22222222-2222-2222-2222-222222222221'
    expect((await chamar('POST', `/servicos/${id}/duvida`, { texto: 'sem motivo' }, sessao)).status).toBe(400)
    const s = (await (await chamar('POST', `/servicos/${id}/duvida`, { motivo: 'espera', texto: 'Por que 2 h?' }, sessao)).json()) as { status: string; mensagens: Array<{ motivo: string; lado: string }> }
    expect(s.status).toBe('em_duvida')
    expect(s.mensagens).toMatchObject([{ motivo: 'espera', lado: 'cliente' }])
  })
})

describe('cron', () => {
  it('aprova automaticamente só o Liberado vencido e manda o resumo', async () => {
    vi.setSystemTime(new Date('2026-10-29T11:00:00Z'))
    await worker.scheduled({ scheduledTime: Date.parse('2026-10-29T11:00:00Z') }, env, exec)
    await Promise.all(pendentes)
    vi.useRealTimers()
    expect(banco.validacaoservicos.map((v) => v.cr40f_status)).toEqual([100000004, 100000000, 100000001, 100000005])
    const resumos = emails.filter((e) => e.tipo === 'resumo_diario')
    expect(resumos).toHaveLength(1)
    expect(resumos[0].para).toEqual(['fiscal@tenaris.com'])
  })
})
