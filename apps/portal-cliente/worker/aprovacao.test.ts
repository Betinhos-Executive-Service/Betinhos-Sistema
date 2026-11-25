// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bancoInicial, envFalso, fetchFalso, kvMemoria, LATASA, OUTRO, type Banco, type Email } from './fakeDataverse'
import { alterarPendente } from './aprovacao'
import type { Dv } from './dataverse'
import worker from './index'

const ORIGEM = 'https://portal.test'
const SENHA = 'senha-boa-123'
const APROVADOR_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
const OUTRO_APROVADOR_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
let banco: Banco, emails: Email[], kv: ReturnType<typeof kvMemoria>, env: ReturnType<typeof envFalso>, pendentes: Promise<unknown>[]
const exec = { waitUntil: (p: Promise<unknown>) => void pendentes.push(p) }

beforeEach(() => {
  banco = bancoInicial()
  emails = []
  pendentes = []
  kv = kvMemoria()
  env = envFalso(kv)
  vi.stubGlobal('fetch', fetchFalso(banco, emails))
  Object.assign(banco.clientes1s.find((c) => c.cr40f_clientes1id === LATASA)!, { cr40f_portalexigeaprovacao: true })
  banco.validadorclientes.push(
    { cr40f_validadorclienteid: APROVADOR_ID, cr40f_name: 'Aline', cr40f_email: 'aline@latasa.com.br', cr40f_ativo: true, cr40f_aprovador: true, _cr40f_cliente_value: LATASA, [`_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue`]: 'Latasa' },
    { cr40f_validadorclienteid: OUTRO_APROVADOR_ID, cr40f_name: 'Beto', cr40f_email: 'beto@latasa.com.br', cr40f_ativo: true, cr40f_aprovador: true, _cr40f_cliente_value: LATASA },
  )
})
afterEach(() => vi.unstubAllGlobals())

async function chamar(metodo: string, caminho: string, corpo?: unknown, cookie = '') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: ORIGEM }
  if (cookie) headers.Cookie = cookie
  const r = await worker.fetch(new Request(ORIGEM + '/api' + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), env, exec)
  await Promise.all(pendentes)
  return r
}
const cookies = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ')

async function logar(email: string) {
  for (const k of kv.dados.keys()) if (k.startsWith('reenvio:')) kv.dados.delete(k)
  await chamar('POST', '/auth/codigo', { email })
  const codigo = String(emails.filter((e) => e.tipo === 'codigo').at(-1)?.dados.codigo ?? '')
  const etapa = cookies(await chamar('POST', '/auth/codigo/confirmar', { email, codigo }))
  return cookies(await chamar('POST', '/auth/senha', { senha: SENHA }, etapa))
}

const amanha = () => new Date(Date.now() + 24 * 3600_000).toISOString()
const pedido = (extra: object = {}) => ({ passageiros: [{ nome: 'Hiroshi Tanaka', telefone: '(12) 99999-0001', email: 'hiroshi@exemplo.com' }], origem: 'Latasa, Pinda', destino: 'GRU', saida: amanha(), ...extra })
const tiposDe = () => emails.map((e) => e.tipo)

/** Pedido feito por compras@latasa.com.br; devolve o id da reserva. */
async function pedirComoCompras() {
  const sessao = await logar('compras@latasa.com.br')
  const r = await chamar('POST', '/pedidos', pedido(), sessao)
  expect(r.status).toBe(201)
  return { sessao, id: ((await r.json()) as { id: string }).id }
}

describe('pedido com aprovação ligada', () => {
  it('nasce Pendente e inativo, mostra Aguardando ao solicitante e avisa cada aprovador', async () => {
    const { sessao, id } = await pedirComoCompras()
    expect(banco.reservadeveculoses[0]).toMatchObject({ cr40f_status: 202410004, cr40f_portalaprovacao: 100000000, statecode: 1 })
    const avisos = emails.filter((e) => e.tipo === 'aprovacao_pendente')
    expect(avisos.map((e) => e.para).sort()).toEqual([['aline@latasa.com.br'], ['beto@latasa.com.br']])
    expect(avisos[0].dados).toMatchObject({ nome: expect.stringMatching(/\S/), solicitante: 'Compras', numero: expect.any(String), data: expect.any(String), trajeto: 'Latasa, Pinda → GRU', passageiros: 'Hiroshi Tanaka', linkPortal: 'https://cliente.exemplo/' })
    const lista = (await (await chamar('GET', '/pedidos', undefined, sessao)).json()) as Array<{ id: string; aprovacao?: string }>
    expect(lista).toMatchObject([{ id, aprovacao: 'pendente' }])
  })

  it('cliente sem aprovador entra direto e ativo', async () => {
    banco.validadorclientes.forEach((v) => { v.cr40f_aprovador = false })
    await pedirComoCompras()
    expect(banco.reservadeveculoses[0].cr40f_portalaprovacao).toBeUndefined()
    expect(banco.reservadeveculoses[0].statecode).toBeUndefined()
    expect(tiposDe()).not.toContain('aprovacao_pendente')
  })

  it('erro passageiro ao ler se o cliente exige aprovação não deixa o pedido entrar sem aprovação', async () => {
    vi.stubGlobal('fetch', fetchFalso(banco, emails, { exigeAprovacao: true }))
    const sessao = await logar('compras@latasa.com.br')
    expect((await chamar('POST', '/pedidos', pedido(), sessao)).status).toBe(500)
    expect(banco.reservadeveculoses).toHaveLength(0)
  })

  it('cliente que não exige aprovação não muda nada', async () => {
    banco.clientes1s.find((c) => c.cr40f_clientes1id === LATASA)!.cr40f_portalexigeaprovacao = false
    await pedirComoCompras()
    expect(banco.reservadeveculoses[0].cr40f_portalaprovacao).toBeUndefined()
  })

  it('aprovador que é o único aprovador entra direto (ninguém mais poderia aprovar)', async () => {
    banco.validadorclientes.splice(banco.validadorclientes.findIndex((v) => v.cr40f_validadorclienteid === OUTRO_APROVADOR_ID), 1)
    const sessao = await logar('aline@latasa.com.br')
    expect((await chamar('POST', '/pedidos', pedido(), sessao)).status).toBe(201)
    expect(banco.reservadeveculoses[0].cr40f_portalaprovacao).toBeUndefined()
  })
})

describe('aprovações', () => {
  it('lista os pendentes do cliente e o aprovador não vê os próprios', async () => {
    const { id } = await pedirComoCompras()
    const aline = await logar('aline@latasa.com.br')
    expect(((await (await chamar('GET', '/aprovacoes', undefined, aline)).json()) as Array<{ id: string; solicitante: string }>)).toMatchObject([{ id, solicitante: 'Compras' }])
    expect((await (await chamar('POST', '/pedidos', pedido({ destino: 'CGH' }), aline)).json()) as object).toBeTruthy()
    const lista = (await (await chamar('GET', '/aprovacoes', undefined, aline)).json()) as Array<{ id: string }>
    expect(lista.map((p) => p.id)).toEqual([id]) // o pedido da própria Aline não entra
  })

  it('usuário que não é aprovador recebe 403 na lista e na decisão', async () => {
    const { sessao, id } = await pedirComoCompras()
    expect((await chamar('GET', '/aprovacoes', undefined, sessao)).status).toBe(403)
    expect((await chamar('POST', `/aprovacoes/${id}`, { decisao: 'aprovar' }, sessao)).status).toBe(403)
  })

  it('aprovador não decide o próprio pedido (403) e pedido de outro cliente não existe para ele', async () => {
    const aline = await logar('aline@latasa.com.br')
    const proprio = (await (await chamar('POST', '/pedidos', pedido(), aline)).json()) as { id: string }
    expect((await chamar('POST', `/aprovacoes/${proprio.id}`, { decisao: 'aprovar' }, aline)).status).toBe(403)
    banco.reservadeveculoses.push({ cr40f_reservadeveculosid: 'cccccccc-0000-0000-0000-000000000009', cr40f_status: 202410004, cr40f_portalaprovacao: 100000000, _cr40f_cliente_value: OUTRO, _cr40f_portalusuario_value: 'x', statecode: 1 })
    expect((await chamar('POST', '/aprovacoes/cccccccc-0000-0000-0000-000000000009', { decisao: 'aprovar' }, aline)).status).toBe(403)
    expect(banco.reservadeveculoses.at(-1)).toMatchObject({ cr40f_portalaprovacao: 100000000, statecode: 1 })
  })

  it('aprovar reativa a reserva, registra quem decidiu e avisa o solicitante', async () => {
    const { sessao, id } = await pedirComoCompras()
    emails.length = 0
    const aline = await logar('aline@latasa.com.br')
    const r = await chamar('POST', `/aprovacoes/${id}`, { decisao: 'aprovar' }, aline)
    expect(r.status).toBe(200)
    expect(banco.reservadeveculoses[0]).toMatchObject({ cr40f_status: 202410004, cr40f_portalaprovacao: 100000001, statecode: 0, cr40f_portalaprovadopor: 'Aline (aline@latasa.com.br)' })
    const res = emails.find((e) => e.tipo === 'aprovacao_resultado')
    expect(res).toMatchObject({ para: ['compras@latasa.com.br'], dados: { resultado: 'aprovado', aprovador: 'Aline', nome: 'Compras' } })
    expect((await chamar('POST', `/aprovacoes/${id}`, { decisao: 'aprovar' }, aline)).status).toBe(409)
    const lista = (await (await chamar('GET', '/pedidos', undefined, sessao)).json()) as Array<{ aprovacao?: string; status: string }>
    expect(lista[0]).toMatchObject({ aprovacao: 'aprovado', status: 'solicitado' })
  })

  it('recusar exige motivo de 5 caracteres, cancela com o motivo e mantém inativo', async () => {
    const { sessao, id } = await pedirComoCompras()
    emails.length = 0
    const aline = await logar('aline@latasa.com.br')
    expect((await chamar('POST', `/aprovacoes/${id}`, { decisao: 'recusar', motivo: 'ok' }, aline)).status).toBe(400)
    expect(banco.reservadeveculoses[0].cr40f_portalaprovacao).toBe(100000000)
    expect((await chamar('POST', `/aprovacoes/${id}`, { decisao: 'recusar', motivo: 'Fora do orçamento do mês' }, aline)).status).toBe(200)
    expect(banco.reservadeveculoses[0]).toMatchObject({ cr40f_status: 202410002, cr40f_portalaprovacao: 100000002, cr40f_portalmotivorecusa: 'Fora do orçamento do mês', statecode: 1 })
    expect(emails.find((e) => e.tipo === 'aprovacao_resultado')?.dados).toMatchObject({ resultado: 'recusado', motivo: 'Fora do orçamento do mês' })
    const lista = (await (await chamar('GET', '/pedidos', undefined, sessao)).json()) as Array<{ aprovacao?: string; status: string; motivoRecusa?: string }>
    expect(lista[0]).toMatchObject({ status: 'cancelado', aprovacao: 'recusado', motivoRecusa: 'Fora do orçamento do mês' })
  })

  it('pedido cancelado pelo solicitante antes da aprovação some da lista e não gera e-mail de resultado', async () => {
    const { sessao, id } = await pedirComoCompras()
    emails.length = 0
    expect((await chamar('POST', `/pedidos/${id}/cancelar`, undefined, sessao)).status).toBe(200)
    expect(banco.reservadeveculoses[0]).toMatchObject({ cr40f_status: 202410002, statecode: 1 })
    const aline = await logar('aline@latasa.com.br')
    expect(await (await chamar('GET', '/aprovacoes', undefined, aline)).json()).toEqual([])
    expect((await chamar('POST', `/aprovacoes/${id}`, { decisao: 'aprovar' }, aline)).status).toBe(409)
    expect(tiposDe().filter((t) => t === 'aprovacao_resultado')).toEqual([])
  })

  it('a sessão do aprovador traz aprovador: true', async () => {
    const aline = await logar('aline@latasa.com.br')
    expect(await (await chamar('GET', '/auth/sessao', undefined, aline)).json()).toMatchObject({ aprovador: true })
    const compras = await logar('compras@latasa.com.br')
    expect(((await (await chamar('GET', '/auth/sessao', undefined, compras)).json()) as { aprovador?: boolean }).aprovador).toBeUndefined()
  })
})

describe('avisos do cron de 10 minutos', () => {
  const rodar = async (agora: number) => {
    await worker.scheduled({ scheduledTime: agora, cron: '*/10 * * * *' }, env, exec)
    await Promise.all(pendentes)
  }
  const confirmar = (extra: object = {}) => {
    banco.reservadeveculoses.push({ cr40f_reservadeveculosid: 'dddddddd-0000-0000-0000-000000000001', cr40f_id: 'RV-1', cr40f_status: 202410001, cr40f_dataehorriodesada: '2026-12-01T12:00:00Z', cr40f_endereodesada: 'A', cr40f_destino: 'B', _cr40f_portalusuario_value: '33333333-3333-3333-3333-333333333333', ...extra })
  }

  it('Confirmado avisa solicitante e passageiros com e-mail, uma vez só, mesmo se o status voltar e for confirmado de novo', async () => {
    banco.bancodedadoses.push({ cr40f_bancodedadosid: 'p1', cr40f_nomedopassageiro: 'Ana', cr40f_email: 'ana@exemplo.com' }, { cr40f_bancodedadosid: 'p2', cr40f_nomedopassageiro: 'Sem Email' })
    banco.servicosporpassageiros.push({ cr40f_servicosporpassageiroid: 's1', _cr40f_geral_value: 'dddddddd-0000-0000-0000-000000000001', _cr40f_bancodedados_value: 'p1', cr40f_ordemdeselecao: 1 }, { cr40f_servicosporpassageiroid: 's2', _cr40f_geral_value: 'dddddddd-0000-0000-0000-000000000001', _cr40f_bancodedados_value: 'p2', cr40f_ordemdeselecao: 2 })
    confirmar()
    await rodar(Date.now())
    const conf = emails.filter((e) => e.tipo === 'pedido_confirmado')
    expect(conf).toHaveLength(1)
    expect([...conf[0].para].sort()).toEqual(['ana@exemplo.com', 'fiscal@tenaris.com'])
    expect(conf[0].dados).toMatchObject({ numero: 'RV-1', origem: 'A', destino: 'B', passageiros: 'Ana, Sem Email' })
    banco.reservadeveculoses[0].cr40f_status = 202410005
    banco.reservadeveculoses[0].cr40f_status = 202410001
    await rodar(Date.now())
    expect(emails.filter((e) => e.tipo === 'pedido_confirmado')).toHaveLength(1)
  })

  it('pedido sem solicitante do portal e sem e-mail de ninguém não envia e fica marcado', async () => {
    confirmar({ _cr40f_portalusuario_value: '' })
    await rodar(Date.now())
    banco.reservadeveculoses[0]._cr40f_portalusuario_value = '33333333-3333-3333-3333-333333333333'
    expect(emails.filter((e) => e.tipo === 'pedido_confirmado')).toHaveLength(0)
  })

  it('Confirmado com saída já passada não envia e-mail', async () => {
    confirmar({ cr40f_dataehorriodesada: '2026-11-01T12:00:00Z' })
    await rodar(Date.now())
    expect(emails.filter((e) => e.tipo === 'pedido_confirmado')).toHaveLength(0)
  })

  it('pendente há 2 h gera um lembrete por aprovador e não repete', async () => {
    const { id } = await pedirComoCompras()
    emails.length = 0
    const reserva = banco.reservadeveculoses.find((r) => r.cr40f_reservadeveculosid === id)!
    reserva.createdon = new Date(Date.now() - 3 * 3600_000).toISOString()
    await rodar(Date.now())
    expect(emails.filter((e) => e.tipo === 'aprovacao_lembrete').map((e) => e.para[0]).sort()).toEqual(['aline@latasa.com.br', 'beto@latasa.com.br'])
    await rodar(Date.now())
    expect(emails.filter((e) => e.tipo === 'aprovacao_lembrete')).toHaveLength(2)
  })

  it('se o flow de e-mails falha, o lembrete não fica marcado e sai na rodada seguinte', async () => {
    const { id } = await pedirComoCompras()
    emails.length = 0
    banco.reservadeveculoses.find((r) => r.cr40f_reservadeveculosid === id)!.createdon = new Date(Date.now() - 3 * 3600_000).toISOString()
    vi.stubGlobal('fetch', fetchFalso(banco, emails, { email: true }))
    await rodar(Date.now())
    expect(emails).toHaveLength(0)
    vi.stubGlobal('fetch', fetchFalso(banco, emails))
    await rodar(Date.now())
    expect(emails.filter((e) => e.tipo === 'aprovacao_lembrete')).toHaveLength(2)
  })

  it('antes de 2 h não há lembrete', async () => {
    await pedirComoCompras()
    emails.length = 0
    await rodar(Date.now())
    expect(tiposDe()).toEqual([])
  })

  it('12 h antes da saída avisa a operação uma vez, sem destinatário (o flow usa a caixa compartilhada)', async () => {
    const { id } = await pedirComoCompras()
    emails.length = 0
    const reserva = banco.reservadeveculoses.find((r) => r.cr40f_reservadeveculosid === id)!
    reserva.cr40f_dataehorriodesada = new Date(Date.now() + 11 * 3600_000).toISOString()
    await rodar(Date.now())
    const aviso = emails.filter((e) => e.tipo === 'aviso_operacao')
    expect(aviso).toHaveLength(1)
    expect(aviso[0].para).toEqual([])
    expect(aviso[0].dados).toMatchObject({ numero: expect.any(String), solicitante: 'Compras', trajeto: 'Latasa, Pinda → GRU' })
    await rodar(Date.now())
    expect(emails.filter((e) => e.tipo === 'aviso_operacao')).toHaveLength(1)
  })

  it('saída já passada não avisa a operação', async () => {
    const { id } = await pedirComoCompras()
    emails.length = 0
    banco.reservadeveculoses.find((r) => r.cr40f_reservadeveculosid === id)!.cr40f_dataehorriodesada = new Date(Date.now() - 3600_000).toISOString()
    await rodar(Date.now())
    expect(emails.filter((e) => e.tipo === 'aviso_operacao')).toHaveLength(0)
  })
})

describe('alterarPendente', () => {
  it('se a gravação falha depois de reativar, volta a inativar a reserva e repassa o erro', async () => {
    const corpos: object[] = []
    const dv = { patch: async (_: string, c: object) => { corpos.push(c); if ('x' in c) throw new Error('falhou') } } as unknown as Dv
    await expect(alterarPendente(dv, 'reservas(1)', { x: 1 }, false)).rejects.toThrow('falhou')
    expect(corpos).toEqual([{ statecode: 0, statuscode: 1 }, { x: 1 }, { statecode: 1, statuscode: 2 }])
  })
})
