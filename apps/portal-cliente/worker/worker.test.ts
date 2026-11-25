// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bancoInicial, envFalso, fetchFalso, kvMemoria, LATASA, TENARIS, type Banco, type Email } from './fakeDataverse'
import worker from './index'

const ORIGEM = 'https://portal.test'
let banco: Banco, emails: Email[], kv: ReturnType<typeof kvMemoria>, env: ReturnType<typeof envFalso>, pendentes: Promise<unknown>[]
const exec = { waitUntil: (p: Promise<unknown>) => void pendentes.push(p) }

beforeEach(() => {
  banco = bancoInicial()
  emails = []
  pendentes = []
  kv = kvMemoria()
  env = envFalso(kv)
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

/** Pede o código como se o intervalo de reenvio (60 s) já tivesse passado. */
async function pedirCodigo(email: string) {
  for (const k of kv.dados.keys()) if (k.startsWith('reenvio:')) kv.dados.delete(k)
  await chamar('POST', '/auth/codigo', { email })
  return String(emails.at(-1)?.dados.codigo ?? '')
}

const SENHA = 'senha-boa-123'

/** Código do e-mail confirmado; devolve o cookie da etapa de criar a senha. */
async function confirmar(email: string) {
  const codigo = await pedirCodigo(email)
  const r = await chamar('POST', '/auth/codigo/confirmar', { email, codigo })
  expect(await r.json()).toEqual({ etapa: 'criar_senha' })
  return cookies(r)
}

/** 1º acesso completo (código do e-mail + senha criada); devolve o cookie de sessão. */
async function logar(email = 'fiscal@tenaris.com', senha = SENHA) {
  const r = await chamar('POST', '/auth/senha', { senha }, await confirmar(email))
  expect(r.status).toBe(200)
  return cookies(r)
}

const entrar = (email: string, senha: string) => chamar('POST', '/auth/entrar', { email, senha })

describe('login', () => {
  it('e-mail não cadastrado: 403 sem_acesso e nada enviado', async () => {
    const r = await chamar('POST', '/auth/codigo', { email: 'ninguem@tenaris.com' })
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ erro: 'sem_acesso' })
    expect(emails).toHaveLength(0)
  })

  it('10 respostas sem acesso do mesmo IP em 15 min: a 11ª vira 429', async () => {
    for (let i = 0; i < 10; i++) expect((await chamar('POST', '/auth/codigo', { email: `n${i}@example.com` })).status).toBe(403)
    expect((await chamar('POST', '/auth/codigo', { email: 'n10@example.com' })).status).toBe(429)
  })

  it('pedido de e-mail liberado não conta para o limite de sem acesso do IP', async () => {
    for (let i = 0; i < 9; i++) expect((await chamar('POST', '/auth/codigo', { email: `n${i}@example.com` })).status).toBe(403)
    expect((await chamar('POST', '/auth/codigo', { email: 'fiscal@tenaris.com' })).status).toBe(204)
    // Reenvio antes de 60 s: 429 aguarde, sem e-mail novo e sem contar para o IP.
    for (let i = 0; i < 2; i++) {
      const r = await chamar('POST', '/auth/codigo', { email: 'fiscal@tenaris.com' })
      expect(r.status).toBe(429)
      expect(await r.json()).toEqual({ erro: 'aguarde' })
    }
    expect(emails).toHaveLength(1)
    expect((await chamar('POST', '/auth/codigo', { email: 'n9@example.com' })).status).toBe(403)
    expect((await chamar('POST', '/auth/codigo', { email: 'n10@example.com' })).status).toBe(429)
  })

  it('e-mail cadastrado: 204, código no e-mail e só o hash no Dataverse', async () => {
    const codigo = await pedirCodigo('Fiscal@Tenaris.com ')
    expect(codigo).toMatch(/^\d{6}$/)
    expect(JSON.stringify(banco.codigoacessos)).not.toContain(`"${codigo}"`)
  })

  it('5 códigos errados: 401 ×4 e depois 429, mesmo com o código certo', async () => {
    const certo = await pedirCodigo('fiscal@tenaris.com')
    const errado = certo === '000000' ? '111111' : '000000'
    const confirmarCom = (codigo: string) => chamar('POST', '/auth/codigo/confirmar', { email: 'fiscal@tenaris.com', codigo })
    for (let i = 0; i < 4; i++) expect((await confirmarCom(errado)).status).toBe(401)
    expect((await confirmarCom(errado)).status).toBe(429)
    const r = await confirmarCom(certo)
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ erro: 'bloqueado' })
  })

  it('1º acesso: código certo, senha curta 400, senha boa grava só o hash e abre sessão de 30 dias', async () => {
    const etapa = await confirmar('fiscal@tenaris.com')
    const curta = await chamar('POST', '/auth/senha', { senha: 'curta' }, etapa)
    expect(curta.status).toBe(400)
    expect(await curta.json()).toMatchObject({ erro: 'senha_fraca' })
    const ok = await chamar('POST', '/auth/senha', { senha: SENHA }, etapa)
    expect(await ok.json()).toEqual({ nome: 'Marcos', email: 'fiscal@tenaris.com', cliente: 'Tenaris', modulos: ['validar'], prazos: { antecedenciaPedidoH: 24, prazoCancelarH: 12, contato: '' } })
    expect(ok.headers.getSetCookie().join('\n')).toMatch(/__Host-portal_sessao=[^;]+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict/)
    const gravado = String(banco.validadorclientes[0].cr40f_senhahash)
    expect(gravado).toMatch(/^pbkdf2\$100000\$/)
    expect(gravado).not.toContain(SENHA)
    expect(banco.validadorclientes[0].cr40f_senhadefinidaem).toBeTruthy()
    // A sessão volta no recarregar.
    expect(await (await chamar('GET', '/auth/sessao', undefined, cookies(ok))).json()).toMatchObject({ email: 'fiscal@tenaris.com' })
  })

  it('entrar com a senha; senha errada, sem senha criada e e-mail estranho dão o mesmo 401', async () => {
    await logar()
    const ok = await entrar('Fiscal@Tenaris.com ', SENHA)
    expect(ok.status).toBe(200)
    expect(await (await chamar('GET', '/servicos', undefined, cookies(ok))).json()).toHaveLength(banco.validacaoservicos.filter((v) => v.cr40f_status !== 100000005).length)
    for (const [email, senha] of [['fiscal@tenaris.com', 'errada-000'], ['ninguem@tenaris.com', SENHA], ['paula.ribeiro@latasa.com.br', SENHA]]) {
      const r = await entrar(email, senha)
      expect(r.status).toBe(401)
      expect(await r.json()).toEqual({ erro: 'senha_invalida' })
    }
  })

  it('5 senhas erradas bloqueiam, até com a certa', async () => {
    await logar()
    for (let i = 0; i < 4; i++) expect((await entrar('fiscal@tenaris.com', 'errada-000')).status).toBe(401)
    expect((await entrar('fiscal@tenaris.com', 'errada-000')).status).toBe(429)
    expect((await entrar('fiscal@tenaris.com', SENHA)).status).toBe(429)
  })

  it('criar senha sem passar pelo código do e-mail: 401', async () => {
    expect((await chamar('POST', '/auth/senha', { senha: SENHA })).status).toBe(401)
  })

  it('trocar a senha ("Esqueci a senha") derruba as sessões abertas com a antiga', async () => {
    const antiga = await logar()
    const nova = await logar('fiscal@tenaris.com', 'senha-nova-456')
    expect((await chamar('GET', '/servicos', undefined, antiga)).status).toBe(401)
    expect((await chamar('GET', '/servicos', undefined, nova)).status).toBe(200)
    expect((await entrar('fiscal@tenaris.com', SENHA)).status).toBe(401)
  })

  it('"Zerar senha" do shell (só limpa a data): a senha antiga não entra e a sessão aberta cai', async () => {
    const sessao = await logar()
    banco.validadorclientes[0].cr40f_senhadefinidaem = null
    expect((await chamar('GET', '/servicos', undefined, sessao)).status).toBe(401)
    expect((await entrar('fiscal@tenaris.com', SENHA)).status).toBe(401)
  })

  it('desativar o usuário ou tirar o portal do cliente derruba a sessão na hora', async () => {
    const sessao = await logar()
    banco.validadorclientes[0].cr40f_ativo = false
    expect((await chamar('GET', '/auth/sessao', undefined, sessao)).status).toBe(401)
    expect((await chamar('GET', '/servicos', undefined, sessao)).status).toBe(401)
  })

  it('usuário trocado de cliente: a sessão antiga cai', async () => {
    const sessao = await logar()
    banco.validadorclientes[0]._cr40f_cliente_value = banco.validadorclientes[1]._cr40f_cliente_value
    expect((await chamar('GET', '/servicos', undefined, sessao)).status).toBe(401)
  })

  it('usuário apagado no Dataverse: sessão cai com 401, não 500', async () => {
    const sessao = await logar()
    banco.validadorclientes.splice(0, 1)
    expect((await chamar('GET', '/auth/sessao', undefined, sessao)).status).toBe(401)
  })
})

describe('multi-cliente', () => {
  it('domínio autorizado (Latasa) entra sem cadastro prévio: usuário criado com o nome do e-mail e módulos do cliente', async () => {
    const codigo = await pedirCodigo('paula.ribeiro@latasa.com.br')
    expect(codigo).toMatch(/^\d{6}$/)
    const criado = banco.validadorclientes.find((v) => v.cr40f_email === 'paula.ribeiro@latasa.com.br')!
    expect(criado).toMatchObject({ cr40f_name: 'Paula Ribeiro', cr40f_ativo: true, _cr40f_cliente_value: LATASA })
    const r = await chamar('POST', '/auth/codigo/confirmar', { email: 'paula.ribeiro@latasa.com.br', codigo })
    const s = await chamar('POST', '/auth/senha', { senha: SENHA }, cookies(r))
    expect(await s.json()).toMatchObject({ cliente: 'Latasa', modulos: ['pedir', 'meus_servicos'] })
    // Segundo pedido de código reaproveita o cadastro.
    await pedirCodigo('paula.ribeiro@latasa.com.br')
    expect(banco.validadorclientes.filter((v) => v.cr40f_email === 'paula.ribeiro@latasa.com.br')).toHaveLength(1)
  })

  it('usuário do domínio desativado pela Betinhos não volta a entrar nem ganha cadastro novo', async () => {
    await pedirCodigo('paula.ribeiro@latasa.com.br')
    banco.validadorclientes.find((v) => v.cr40f_email === 'paula.ribeiro@latasa.com.br')!.cr40f_ativo = false
    emails.length = 0
    const antes = banco.validadorclientes.length
    expect((await chamar('POST', '/auth/codigo', { email: 'paula.ribeiro@latasa.com.br' })).status).toBe(403)
    expect(emails).toHaveLength(0)
    expect(banco.validadorclientes).toHaveLength(antes)
  })

  it.each([
    ['domínio não autorizado', 'alguem@example.com'],
    ['subdomínio parecido', 'x@tasa.com'],
    ['dois clientes com o mesmo domínio', 'x@ambiguo.com'],
    ['cliente sem módulo', 'x@semmodulo.com'],
  ])('%s: 403 sem_acesso, sem e-mail e sem cadastro', async (_, email) => {
    const antes = banco.validadorclientes.length
    expect((await chamar('POST', '/auth/codigo', { email })).status).toBe(403)
    expect(emails).toHaveLength(0)
    expect(banco.validadorclientes).toHaveLength(antes)
    expect((await chamar('POST', '/auth/codigo/confirmar', { email, codigo: '123456' })).status).toBe(401)
  })

  it('cada módulo só na sessão do cliente certo: Tenaris não pede, Latasa não valida', async () => {
    const tenaris = await logar()
    expect((await chamar('GET', '/pedidos', undefined, tenaris)).status).toBe(403)
    expect((await chamar('POST', '/pedidos', {}, tenaris)).status).toBe(403)
    const latasa = await logar('compras@latasa.com.br')
    expect((await chamar('GET', '/servicos', undefined, latasa)).status).toBe(403)
    expect((await chamar('POST', '/servicos/aprovar', { ids: [] }, latasa)).status).toBe(403)
  })
})

describe('pedidos', () => {
  const amanha = () => new Date(Date.now() + 48 * 3600_000).toISOString()
  const pedido = () => ({ passageiros: [{ nome: 'Hiroshi Tanaka', telefone: '(12) 99999-0001' }], origem: 'Latasa, Pinda', destino: 'GRU', saida: amanha(), observacao: 'Voo LA3421' })

  it('campo inválido: 400 com a mensagem do campo e nada criado', async () => {
    const sessao = await logar('compras@latasa.com.br')
    const semOrigem = await chamar('POST', '/pedidos', { ...pedido(), origem: ' ' }, sessao)
    expect(semOrigem.status).toBe(400)
    expect(await semOrigem.json()).toEqual({ erro: 'nao_permitido', mensagem: 'Informe o endereço de saída.' })
    const passado = await chamar('POST', '/pedidos', { ...pedido(), saida: '2020-01-01T10:00:00Z' }, sessao)
    expect(await passado.json()).toMatchObject({ mensagem: 'A saída precisa ser daqui para a frente.' })
    expect((await chamar('POST', '/pedidos', { ...pedido(), passageiros: [] }, sessao)).status).toBe(400)
    expect(banco.reservadeveculoses).toHaveLength(0)
  })

  it('pedido completo cria a reserva em Solicitado ligada ao cliente e ao usuário; repetição em 1 min dá 409', async () => {
    const sessao = await logar('compras@latasa.com.br')
    const mesmo = pedido()
    const r = await chamar('POST', '/pedidos', mesmo, sessao)
    expect(r.status).toBe(201)
    const criado = (await r.json()) as Record<string, unknown>
    expect(criado).toMatchObject({ numero: 'RV-48500', status: 'solicitado', passageiros: ['Hiroshi Tanaka'], pessoas: [{ nome: 'Hiroshi Tanaka', telefone: '(12) 99999-0001' }], origem: 'Latasa, Pinda', destino: 'GRU', observacao: 'Voo LA3421' })
    expect(criado.voucherUrl).toBeUndefined()
    const usuario = banco.validadorclientes.find((v) => v.cr40f_email === 'compras@latasa.com.br')!
    expect(banco.servicosporpassageiros).toHaveLength(1)
    expect(banco.reservadeveculoses[0]).toMatchObject({
      cr40f_status: 202410004, _cr40f_cliente_value: LATASA, _cr40f_portalusuario_value: usuario.cr40f_validadorclienteid,
      cr40f_portalpedido: JSON.stringify({ passageiros: ['Hiroshi Tanaka'], observacao: 'Voo LA3421' }),
      cr40f_passageirosetelefonedecontato: 'Hiroshi Tanaka – (12) 99999-0001', cr40f_observaointerna: 'Pedido pelo portal por Compras (compras@latasa.com.br): Voo LA3421',
    })
    expect(banco.reservadeveculoses[0].cr40f_id).toBe('RV-48500') // numerado pelo Dataverse, nunca pelo Worker
    const repetido = await chamar('POST', '/pedidos', mesmo, sessao)
    expect(repetido.status).toBe(409)
    expect(await repetido.json()).toMatchObject({ erro: 'duplicado' })
    expect(banco.reservadeveculoses).toHaveLength(1)
  })

  it('Meus serviços lista só os pedidos do usuário e reflete a programação feita no shell', async () => {
    const paula = await logar('paula@latasa.com.br')
    const compras = await logar('compras@latasa.com.br')
    expect((await chamar('POST', '/pedidos', pedido(), paula)).status).toBe(201)
    expect(await (await chamar('GET', '/pedidos', undefined, compras)).json()).toEqual([])
    let [meu] = (await (await chamar('GET', '/pedidos', undefined, paula)).json()) as Array<Record<string, unknown>>
    expect(meu).toMatchObject({ status: 'solicitado' })
    // A operação programa no shell: status Programado, veículo e voucher.
    Object.assign(banco.reservadeveculoses[0], { cr40f_status: 202410005, new_linkdovoucher: 'https://v/RV-48500.pdf', 'cr40f_tipodeveiculo@OData.Community.Display.V1.FormattedValue': 'Sedan executivo', '_cr40f_motorista_value@OData.Community.Display.V1.FormattedValue': 'Carlos Souza', '_cr40f_veiculo_value@OData.Community.Display.V1.FormattedValue': 'ABC1D23' })
    ;[meu] = (await (await chamar('GET', '/pedidos', undefined, paula)).json()) as Array<Record<string, unknown>>
    expect(meu).toMatchObject({ status: 'programado', voucherUrl: 'https://v/RV-48500.pdf', veiculo: 'Sedan executivo', motorista: 'Carlos Souza', placa: 'ABC1D23' })
  })

  it('Meus serviços também lista, só para leitura, o pedido em que o e-mail do usuário é passageiro', async () => {
    const paula = await logar('paula@latasa.com.br')
    const compras = await logar('compras@latasa.com.br')
    const comCompras = { ...pedido(), passageiros: [{ nome: 'Equipe Compras', telefone: '(12) 99999-0002', email: 'Compras@Latasa.com.br' }] }
    const criado = (await (await chamar('POST', '/pedidos', comCompras, paula)).json()) as { id: string; comoPassageiro?: boolean }
    expect(criado.comoPassageiro).toBeUndefined()
    const lista = (await (await chamar('GET', '/pedidos', undefined, compras)).json()) as Array<Record<string, unknown>>
    expect(lista).toEqual([expect.objectContaining({ id: criado.id, comoPassageiro: true })])
    expect((await chamar('POST', `/pedidos/${criado.id}/cancelar`, {}, compras)).status).toBe(404)
  })

  it('cancelar: só o dono e só em Solicitado; nota na observação interna', async () => {
    const paula = await logar('paula@latasa.com.br')
    const compras = await logar('compras@latasa.com.br')
    const criado = (await (await chamar('POST', '/pedidos', pedido(), paula)).json()) as { id: string }
    expect((await chamar('POST', `/pedidos/${criado.id}/cancelar`, {}, compras)).status).toBe(404)
    const r = await chamar('POST', `/pedidos/${criado.id}/cancelar`, {}, paula)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ id: criado.id, status: 'cancelado' })
    const reg = banco.reservadeveculoses[0]
    expect(reg.cr40f_status).toBe(202410002)
    expect(String(reg.cr40f_observaointerna)).toMatch(/^Pedido pelo portal por .*\nCancelado pelo cliente no portal por .* \(paula@latasa\.com\.br\) em \d\d\/\d\d\/\d{4}/)
    // Em execução (já com a operação): recusa com a mensagem para a tela.
    reg.cr40f_status = 202410006
    const tarde = await chamar('POST', `/pedidos/${criado.id}/cancelar`, {}, paula)
    expect(tarde.status).toBe(409)
    expect(await tarde.json()).toMatchObject({ mensagem: expect.stringContaining('Fale com a Betinhos.') })
  })

  it('prazos do cliente: a sessão leva a regra, pedir fora do prazo é 400 e 0 libera', async () => {
    const latasa = banco.clientes1s.find((c) => c.cr40f_clientes1id === LATASA)!
    Object.assign(latasa, { cr40f_portalantecedenciapedido: 48, cr40f_portalcontato: '(12) 90000-0000' })
    const sessao = await logar('paula@latasa.com.br')
    expect(await (await chamar('GET', '/auth/sessao', undefined, sessao)).json()).toMatchObject({ prazos: { antecedenciaPedidoH: 48, prazoCancelarH: 12, contato: '(12) 90000-0000' } })
    const cedo = await chamar('POST', '/pedidos', { ...pedido(), saida: new Date(Date.now() + 30 * 3600_000).toISOString() }, sessao)
    expect(cedo.status).toBe(400)
    expect(await cedo.json()).toMatchObject({ mensagem: expect.stringContaining('(12) 90000-0000') })
    expect(banco.reservadeveculoses).toHaveLength(0)
    latasa.cr40f_portalantecedenciapedido = 0
    expect((await chamar('POST', '/pedidos', { ...pedido(), saida: new Date(Date.now() + 3600_000).toISOString() }, sessao)).status).toBe(201)
  })

  it('cancelar: Confirmado dentro do prazo cancela e avisa a operação; fora do prazo 409 com o contato', async () => {
    Object.assign(banco.clientes1s.find((c) => c.cr40f_clientes1id === LATASA)!, { cr40f_portalprazocancelar: 6, cr40f_portalcontato: '(12) 90000-0000' })
    const sessao = await logar('paula@latasa.com.br')
    const criado = (await (await chamar('POST', '/pedidos', pedido(), sessao)).json()) as { id: string }
    const reg = banco.reservadeveculoses[0]
    reg.cr40f_status = 202410005 // Programado
    reg.cr40f_dataehorriodesada = new Date(Date.now() + 5 * 3600_000).toISOString()
    const fora = await chamar('POST', `/pedidos/${criado.id}/cancelar`, {}, sessao)
    expect(fora.status).toBe(409)
    expect(await fora.json()).toMatchObject({ mensagem: expect.stringMatching(/6 h antes da saída.*\(12\) 90000-0000/) })
    expect(reg.cr40f_status).toBe(202410005)
    reg.cr40f_dataehorriodesada = new Date(Date.now() + 8 * 3600_000).toISOString()
    expect((await chamar('POST', `/pedidos/${criado.id}/cancelar`, {}, sessao)).status).toBe(200)
    await Promise.all(pendentes)
    expect(reg.cr40f_status).toBe(202410002)
    expect(emails.filter((e) => e.tipo === 'cancelamento_operacao')).toEqual([{ tipo: 'cancelamento_operacao', para: [], dados: expect.objectContaining({ numero: 'RV-48500', solicitante: 'Paula', cliente: 'Latasa', situacao: 'Programado', passageiros: 'Hiroshi Tanaka' }) }])
  })

  it('cancelar em Solicitado dentro do prazo não avisa a operação (ela ainda não viu o pedido)', async () => {
    const sessao = await logar('paula@latasa.com.br')
    const criado = (await (await chamar('POST', '/pedidos', pedido(), sessao)).json()) as { id: string }
    expect((await chamar('POST', `/pedidos/${criado.id}/cancelar`, {}, sessao)).status).toBe(200)
    await Promise.all(pendentes)
    expect(emails.some((e) => e.tipo === 'cancelamento_operacao')).toBe(false)
  })

  it('coluna de prazo ainda não criada (400) vale o padrão; outra falha na leitura barra o pedido', async () => {
    const sessao = await logar('paula@latasa.com.br')
    const real = fetch
    vi.stubGlobal('fetch', async (e: RequestInfo | URL, i?: RequestInit) => (String(e).includes('cr40f_portalprazocancelar') ? new Response('coluna', { status: 400 }) : real(e, i)))
    expect((await chamar('POST', '/pedidos', pedido(), sessao)).status).toBe(201)
    vi.stubGlobal('fetch', async (e: RequestInfo | URL, i?: RequestInit) => (String(e).includes('cr40f_portalprazocancelar') ? new Response('fora', { status: 503 }) : real(e, i)))
    expect((await chamar('POST', '/pedidos', { ...pedido(), destino: 'Outro' }, sessao)).status).toBeGreaterThanOrEqual(500)
  })
})

describe('passageiros do pedido', () => {
  const amanha = () => new Date(Date.now() + 48 * 3600_000).toISOString()
  const pedido = (passageiros: unknown[], extra: Record<string, unknown> = {}) => ({ passageiros, origem: 'Latasa, Pinda', destino: 'GRU', saida: amanha(), ...extra })
  const pessoa = (nome: string, cliente = LATASA, extra: Record<string, unknown> = {}) => {
    const reg = { cr40f_bancodedadosid: `bbbbbbbb-0000-0000-0000-${String(banco.bancodedadoses.length + 1).padStart(12, '0')}`, cr40f_nomedopassageiro: nome, cr40f_telefone: '12999990001', cr40f_email: null, _cr40f_cliente_value: cliente, ...extra }
    banco.bancodedadoses.push(reg)
    return reg
  }

  it('busca: só pessoas do cliente da sessão, por parte do nome, em ordem e no máximo 20', async () => {
    const sessao = await logar('compras@latasa.com.br')
    pessoa('Carla Menezes'); pessoa('Ana Souza'); pessoa('Marcos Ana'); pessoa('Ana de Outro Cliente', TENARIS)
    for (let i = 0; i < 25; i++) pessoa(`Zé ${i}`)
    const r = await chamar('GET', '/passageiros?q=ana', undefined, sessao)
    expect(r.status).toBe(200)
    const lista = (await r.json()) as Array<Record<string, unknown>>
    expect(lista.map((p) => p.nome)).toEqual(['Ana Souza', 'Marcos Ana'])
    expect(lista[0]).toMatchObject({ telefone: '12999990001' })
    expect(JSON.stringify(lista)).not.toContain('Outro Cliente')
    const todos = (await (await chamar('GET', '/passageiros', undefined, sessao)).json()) as unknown[]
    expect(todos).toHaveLength(20)
  })

  it('busca exige módulo Pedir e sessão', async () => {
    expect((await chamar('GET', '/passageiros?q=a')).status).toBe(401)
    expect((await chamar('GET', '/passageiros?q=a', undefined, await logar())).status).toBe(403)
  })

  it('endereços: exige sessão e módulo Pedir; sem TOMTOM_KEY responde [] sem erro', async () => {
    expect((await chamar('GET', '/enderecos?q=paulista')).status).toBe(401)
    expect((await chamar('GET', '/enderecos?q=paulista', undefined, await logar())).status).toBe(403)
    const r = await chamar('GET', '/enderecos?q=avenida paulista', undefined, await logar('compras@latasa.com.br'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual([])
  })

  it('passageiro novo vira pessoa do cliente e vínculo com ordem; a leitura volta por Serviços por Passageiro', async () => {
    const sessao = await logar('compras@latasa.com.br')
    const r = await chamar('POST', '/pedidos', pedido([{ nome: 'Ana Souza', telefone: '(12) 99999-0001' }, { nome: 'Bia Lima', email: 'bia@exemplo.com' }], { tipoVeiculo: 202410003 }), sessao)
    expect(r.status).toBe(201)
    expect(banco.bancodedadoses).toHaveLength(2)
    expect(banco.bancodedadoses[0]).toMatchObject({ cr40f_nomedopassageiro: 'Ana Souza', cr40f_telefone: '(12) 99999-0001', _cr40f_cliente_value: LATASA, cr40f_status: 202410000 })
    expect(banco.servicosporpassageiros.map((v) => [v._cr40f_bancodedados_value, v.cr40f_ordemdeselecao, v._cr40f_geral_value])).toEqual([
      [banco.bancodedadoses[0].cr40f_bancodedadosid, 1, banco.reservadeveculoses[0].cr40f_reservadeveculosid],
      [banco.bancodedadoses[1].cr40f_bancodedadosid, 2, banco.reservadeveculoses[0].cr40f_reservadeveculosid],
    ])
    expect(banco.reservadeveculoses[0]).toMatchObject({ cr40f_tipodeveiculo: 202410003, cr40f_passageirosetelefonedecontato: 'Ana Souza – (12) 99999-0001; Bia Lima – bia@exemplo.com' })
    expect(JSON.parse(String(banco.reservadeveculoses[0].cr40f_portalpedido))).toMatchObject({ passageiros: ['Ana Souza', 'Bia Lima'], tipoVeiculo: 202410003 })
    const [meu] = (await (await chamar('GET', '/pedidos', undefined, sessao)).json()) as Array<Record<string, unknown>>
    expect(meu).toMatchObject({ passageiros: ['Ana Souza', 'Bia Lima'], tipoVeiculo: 202410003, pessoas: [{ nome: 'Ana Souza', telefone: '(12) 99999-0001' }, { nome: 'Bia Lima', email: 'bia@exemplo.com' }] })
    expect((meu.pessoas as Array<{ id?: string }>)[0].id).toBe(banco.bancodedadoses[0].cr40f_bancodedadosid)
  })

  it('pessoa existente: usa o id, não duplica e corrige o contato que mudou', async () => {
    const sessao = await logar('compras@latasa.com.br')
    const ana = pessoa('Ana Souza')
    const r = await chamar('POST', '/pedidos', pedido([{ id: ana.cr40f_bancodedadosid, nome: 'Ana Souza', telefone: '12988887777', email: 'ana@exemplo.com' }]), sessao)
    expect(r.status).toBe(201)
    expect(banco.bancodedadoses).toHaveLength(1)
    expect(banco.bancodedadoses[0]).toMatchObject({ cr40f_telefone: '12988887777', cr40f_email: 'ana@exemplo.com' })
    expect(banco.servicosporpassageiros).toHaveLength(1)
  })

  it('pessoa com id de outro cliente: 400 e nada criado nem alterado', async () => {
    const sessao = await logar('compras@latasa.com.br')
    const alheia = pessoa('Olga Tenaris', TENARIS)
    const r = await chamar('POST', '/pedidos', pedido([{ id: alheia.cr40f_bancodedadosid, nome: 'Olga Tenaris', telefone: '12911112222' }]), sessao)
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ erro: 'nao_permitido', mensagem: 'Passageiro não encontrado.' })
    expect(banco.reservadeveculoses).toHaveLength(0)
    expect(alheia.cr40f_telefone).toBe('12999990001')
    expect((await chamar('POST', '/pedidos', pedido([{ id: 'não-é-guid', nome: 'X', email: 'x@y.co' }]), sessao)).status).toBe(400)
  })

  it('sem id: reaproveita a pessoa do cliente com o mesmo nome (sem caixa) e o mesmo celular ou e-mail; senão cria', async () => {
    const sessao = await logar('compras@latasa.com.br')
    pessoa('Ana Souza')
    expect((await chamar('POST', '/pedidos', pedido([{ nome: 'ana souza', telefone: '(12) 99999-0001' }]), sessao)).status).toBe(201)
    expect(banco.bancodedadoses).toHaveLength(1)
    // Mesmo nome, contato diferente: outra pessoa.
    expect((await chamar('POST', '/pedidos', pedido([{ nome: 'Ana Souza', telefone: '12977776666' }], { origem: 'Outro lugar' }), sessao)).status).toBe(201)
    expect(banco.bancodedadoses).toHaveLength(2)
  })

  it('validação do contato e repetição vêm do domínio: 400 sem reserva', async () => {
    const sessao = await logar('compras@latasa.com.br')
    const semContato = await chamar('POST', '/pedidos', pedido([{ nome: 'Ana' }]), sessao)
    expect(semContato.status).toBe(400)
    expect(await semContato.json()).toMatchObject({ mensagem: 'Informe celular ou e-mail.' })
    expect((await chamar('POST', '/pedidos', pedido([{ nome: 'Ana', telefone: '123' }]), sessao)).status).toBe(400)
    const repetido = await chamar('POST', '/pedidos', pedido([{ nome: 'Ana', email: 'a@b.co' }, { nome: 'ana', email: 'c@d.co' }]), sessao)
    expect(await repetido.json()).toMatchObject({ mensagem: 'Este passageiro já está no pedido.' })
    expect((await chamar('POST', '/pedidos', pedido(Array.from({ length: 5 }, (_, i) => ({ nome: `P${i}`, email: 'a@b.co' }))), sessao)).status).toBe(201) // corta em 4, como o domínio
    expect(banco.servicosporpassageiros).toHaveLength(4)
  })

  it('tipo de veículo fora da lista: 400; sem tipo não grava a coluna', async () => {
    const sessao = await logar('compras@latasa.com.br')
    const ruim = await chamar('POST', '/pedidos', pedido([{ nome: 'Ana', email: 'a@b.co' }], { tipoVeiculo: 7 }), sessao)
    expect(ruim.status).toBe(400)
    expect(await ruim.json()).toMatchObject({ mensagem: 'Tipo de veículo inválido.' })
    expect((await chamar('POST', '/pedidos', pedido([{ nome: 'Ana', email: 'a@b.co' }], { tipoVeiculo: 'Van' }), sessao)).status).toBe(400)
    expect((await chamar('POST', '/pedidos', pedido([{ nome: 'Ana', email: 'a@b.co' }]), sessao)).status).toBe(201)
    expect(banco.reservadeveculoses[0]).not.toHaveProperty('cr40f_tipodeveiculo')
  })

  it('vínculo recusado pelo Dataverse: apaga a reserva, devolve erro e libera a nova tentativa', async () => {
    const sessao = await logar('compras@latasa.com.br')
    const falhas = { vinculo: true }
    vi.stubGlobal('fetch', fetchFalso(banco, emails, falhas))
    const corpo = pedido([{ nome: 'Ana', email: 'a@b.co' }])
    const r = await chamar('POST', '/pedidos', corpo, sessao)
    expect(r.status).toBe(502)
    expect(await r.json()).toMatchObject({ erro: 'falha' })
    expect(banco.reservadeveculoses).toHaveLength(0)
    falhas.vinculo = false
    expect((await chamar('POST', '/pedidos', corpo, sessao)).status).toBe(201) // sem trava de duplicado
    expect(banco.reservadeveculoses).toHaveLength(1)
  })

  it('sem permissão para apagar a reserva: cancela com nota', async () => {
    const sessao = await logar('compras@latasa.com.br')
    vi.stubGlobal('fetch', fetchFalso(banco, emails, { vinculo: true, apagar: true }))
    expect((await chamar('POST', '/pedidos', pedido([{ nome: 'Ana', email: 'a@b.co' }]), sessao)).status).toBe(502)
    expect(banco.reservadeveculoses[0]).toMatchObject({ cr40f_status: 202410002 })
    expect(String(banco.reservadeveculoses[0].cr40f_observaointerna)).toMatch(/falha ao registrar os passageiros/)
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
    // Contrato do flow (packages/deploy/flows/portal-cliente-emails.json): sem nome/cliente/linkPortal ele responde 400.
    const d = resumos[0].dados as { liberadosHoje: unknown[]; vencendo: unknown[] }
    expect(d).toMatchObject({ nome: expect.stringMatching(/\S/), cliente: expect.stringMatching(/\S/), linkPortal: 'https://cliente.exemplo/' })
    for (const l of d.liberadosHoje) expect(l).toMatchObject({ numero: expect.any(String), data: expect.stringMatching(/^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})?$/), trajeto: expect.stringContaining(' → '), valor: expect.any(Number) })
    for (const v of d.vencendo) expect(v).toMatchObject({ numero: expect.any(String), prazo: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/) })
    expect(d.liberadosHoje.length + d.vencendo.length).toBeGreaterThan(0)
  })

  it('código de acesso segue o contrato do flow (nome, codigo, validadeMinutos)', async () => {
    emails.length = 0
    await logar('fiscal@tenaris.com')
    const c = emails.find((e) => e.tipo === 'codigo')
    expect(c?.dados).toMatchObject({ nome: expect.stringMatching(/\S/), codigo: expect.stringMatching(/^\d{6}$/), validadeMinutos: 10 })
  })

  it('cliente sem o módulo Validar não recebe resumo, mesmo com validação liberada por engano', async () => {
    await logar('compras@latasa.com.br')
    banco.validacaoservicos.push({ ...banco.validacaoservicos[1], cr40f_validacaoservicoid: '22222222-2222-2222-2222-222222222299', _cr40f_cliente_value: LATASA })
    emails.length = 0
    vi.setSystemTime(new Date('2026-10-29T11:00:00Z'))
    await worker.scheduled({ scheduledTime: Date.parse('2026-10-29T11:00:00Z') }, env, exec)
    await Promise.all(pendentes)
    vi.useRealTimers()
    expect(emails.filter((e) => e.tipo === 'resumo_diario').flatMap((e) => e.para)).toEqual(['fiscal@tenaris.com'])
  })
})

describe('identidade do cliente', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
  const latasa = () => banco.clientes1s.find((c) => c.cr40f_clientes1id === LATASA)!
  const comMarca = () => Object.assign(latasa(), { cr40f_portallogo_timestamp: '639000', logoBytes: PNG })

  it('?c=<nome normalizado> devolve nome do cadastro e endereço do logo; nada além disso', async () => {
    comMarca()
    const r = await chamar('GET', '/marca?c=Latasa')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ nome: 'Latasa', logoUrl: `/api/marca/logo/${LATASA}?v=639000` })
  })

  it('e-mail de domínio cadastrado devolve a marca, sem exigir sessão', async () => {
    comMarca()
    const r = await chamar('GET', '/marca?email=x%40LATASA.com.br')
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ nome: 'Latasa' })
  })

  it.each([
    ['domínio público', 'x@gmail.com'],
    ['domínio sem cliente', 'x@example.com'],
    ['subdomínio parecido', 'x@tasa.com'],
    ['e-mail incompleto', 'x@'],
  ])('%s: 404, sem revelar nada', async (_, email) => {
    comMarca()
    banco.clientes1s.push({ ...latasa(), cr40f_clientes1id: '88888888-8888-8888-8888-888888888888', cr40f_portaldominios: 'gmail.com' })
    expect((await chamar('GET', `/marca?email=${encodeURIComponent(email)}`)).status).toBe(404)
  })

  it('cliente sem logo, sem módulo, desabilitado ou chave desconhecida: 404 igual', async () => {
    expect((await chamar('GET', '/marca?c=latasa')).status).toBe(404)
    comMarca()
    latasa().cr40f_portalhabilitado = false
    expect((await chamar('GET', '/marca?c=latasa')).status).toBe(404)
    expect((await chamar('GET', '/marca?email=x@latasa.com.br')).status).toBe(404)
    latasa().cr40f_portalhabilitado = true
    latasa().cr40f_portalmodulos = null
    expect((await chamar('GET', '/marca?c=latasa')).status).toBe(404)
    expect((await chamar('GET', '/marca?c=nao-existe')).status).toBe(404)
    expect((await chamar('GET', '/marca')).status).toBe(404)
  })

  it('logo: baixa a imagem com o tipo pelo conteúdo e cache; recusa conteúdo desconhecido, id inválido e cliente barrado', async () => {
    comMarca()
    const r = await chamar('GET', `/marca/logo/${LATASA}`)
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('image/png')
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(PNG)
    latasa().logoBytes = new TextEncoder().encode('<html>não é imagem</html>')
    expect((await chamar('GET', `/marca/logo/${LATASA}`)).status).toBe(404)
    expect((await chamar('GET', '/marca/logo/nao-e-guid')).status).toBe(404)
    comMarca()
    latasa().cr40f_portalhabilitado = false
    expect((await chamar('GET', `/marca/logo/${LATASA}`)).status).toBe(404)
  })

  it('SVG e WebP não são servidos: 404', async () => {
    for (const bytes of [new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'), new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')]) {
      comMarca().logoBytes = bytes
      expect((await chamar('GET', `/marca/logo/${LATASA}`)).status).toBe(404)
    }
  })

  it('o logo PNG sai com nosniff e CSP que bloqueia tudo', async () => {
    comMarca()
    const r = await chamar('GET', `/marca/logo/${LATASA}`)
    expect(r.headers.get('Content-Type')).toBe('image/png')
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(r.headers.get('Content-Security-Policy')).toBe("default-src 'none'")
  })

  it('a sessão leva a marca do cliente; sem logo cadastrado, vem sem marca', async () => {
    const semMarca = await logar('compras@latasa.com.br')
    expect(await (await chamar('GET', '/auth/sessao', undefined, semMarca)).json()).not.toHaveProperty('marca')
    comMarca()
    const r = await chamar('GET', '/auth/sessao', undefined, semMarca)
    expect(await r.json()).toMatchObject({ marca: { nome: 'Latasa' } })
  })
})
