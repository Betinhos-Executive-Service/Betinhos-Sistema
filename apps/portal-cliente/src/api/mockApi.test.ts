import { describe, expect, it } from 'vitest'
import { armazenamentoEmMemoria, createMockApi, CODIGO_MOCK, refazerAutenticadorMock, totpDo } from './mockApi'
import { ErroPortal } from './PortalApi'

const EMAIL = 'fiscal@tenaris.com'
const T0 = new Date('2026-10-28T13:00:00Z').getTime()
const agora = () => new Date(T0)

/** Mock com relógio controlável e armazenamento isolado por teste. */
function montar(armazenamento = armazenamentoEmMemoria()) {
  const relogio = { t: T0 }
  const api = createMockApi({ agora: () => new Date(relogio.t), armazenamento })
  return { api, relogio, armazenamento }
}

/** Código do app autenticador naquele instante, gerado pela mesma biblioteca. */
const totp = (segredo: string, t: number) => totpDo(EMAIL, segredo).generate({ timestamp: t })

async function cadastrar(m = montar()) {
  const r = await m.api.entrar(EMAIL, CODIGO_MOCK)
  if (r.etapa !== 'cadastrar_autenticador') throw new Error(`esperava cadastro, veio ${r.etapa}`)
  return { ...m, segredo: r.segredo, otpauthUrl: r.otpauthUrl }
}

async function logado() {
  const m = await cadastrar()
  await m.api.confirmarAutenticador(totp(m.segredo, m.relogio.t), false)
  return m.api
}

describe('mockApi', () => {
  it('gera 30 serviços com a distribuição do plano', async () => {
    const lista = await (await logado()).listar()
    const conta = (st: string) => lista.filter((s) => s.status === st).length
    expect(lista).toHaveLength(30)
    expect([conta('liberado'), conta('em_duvida'), conta('respondido'), conta('aprovado'), conta('aprovado_tacito')]).toEqual([14, 4, 3, 6, 3])
  })

  it('exige sessão para listar', async () => {
    await expect(montar().api.listar()).rejects.toMatchObject({ codigo: 'nao_permitido' })
  })

  it('aprovar muda o status, grava quem aprovou e ignora quem já estava aprovado', async () => {
    const api = await logado()
    const lista = await api.listar()
    const pendente = lista.find((s) => s.status === 'liberado')!
    const aprovado = lista.find((s) => s.status === 'aprovado')!
    const resultado = await api.aprovar([pendente.id, aprovado.id])
    expect(resultado).toHaveLength(1)
    expect(resultado[0]).toMatchObject({ id: pendente.id, status: 'aprovado', aprovadoPor: 'Marcos Albuquerque' })
  })

  it('dúvida exige texto e abre a conversa com o motivo', async () => {
    const api = await logado()
    const alvo = (await api.listar()).find((s) => s.status === 'liberado')!
    await expect(api.abrirDuvida(alvo.id, 'espera', '   ')).rejects.toBeInstanceOf(ErroPortal)
    const s = await api.abrirDuvida(alvo.id, 'espera', 'Espera de 2h?')
    expect(s.status).toBe('em_duvida')
    expect(s.mensagens.at(-1)).toMatchObject({ lado: 'cliente', motivo: 'espera', texto: 'Espera de 2h?' })
  })

  it('responder acrescenta a mensagem do cliente e volta para em dúvida', async () => {
    const api = await logado()
    const alvo = (await api.listar()).find((s) => s.status === 'respondido')!
    const s = await api.responder(alvo.id, 'Obrigado, e o pedágio?')
    expect(s.status).toBe('em_duvida')
    expect(s.mensagens).toHaveLength(alvo.mensagens.length + 1)
  })

  it('1º acesso devolve QR (otpauth SHA-1, 30 s, 6 dígitos) e o segredo; o 2º pede só o código', async () => {
    const m = await cadastrar()
    expect(m.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Betinhos:fiscal%40tenaris\.com\?/)
    expect(m.otpauthUrl).toContain(`secret=${m.segredo}`)
    expect(m.otpauthUrl).toMatch(/algorithm=SHA1.*digits=6.*period=30/)
    await m.api.confirmarAutenticador(totp(m.segredo, m.relogio.t), false)
    await m.api.sair()
    // Novo carregamento da página, mesmo armazenamento.
    const outra = montar(m.armazenamento)
    await expect(outra.api.entrar(EMAIL, CODIGO_MOCK)).resolves.toEqual({ etapa: 'autenticador' })
    await expect(outra.api.confirmarAutenticador(totp(m.segredo, outra.relogio.t), false)).resolves.toMatchObject({ nome: 'Marcos Albuquerque' })
  })

  it('TOTP errado não entra e não grava o autenticador', async () => {
    const m = await cadastrar()
    await expect(m.api.confirmarAutenticador('000000', false)).rejects.toMatchObject({ codigo: 'totp_invalido' })
    await expect(m.api.listar()).rejects.toMatchObject({ codigo: 'nao_permitido' })
    // Sem confirmar, o próximo login ainda é cadastro.
    const outra = montar(m.armazenamento)
    await expect(outra.api.entrar(EMAIL, CODIGO_MOCK)).resolves.toMatchObject({ etapa: 'cadastrar_autenticador' })
  })

  it('aceita o código de 30 s atrás (janela ±1) e recusa o de 60 s atrás', async () => {
    const m = await cadastrar()
    await expect(m.api.confirmarAutenticador(totp(m.segredo, m.relogio.t - 60_000), false)).rejects.toMatchObject({ codigo: 'totp_invalido' })
    await expect(m.api.confirmarAutenticador(totp(m.segredo, m.relogio.t - 30_000), false)).resolves.toMatchObject({ cliente: 'Tenaris' })
  })

  it('confirmar sem passar pelo código do e-mail é recusado', async () => {
    await expect(montar().api.confirmarAutenticador('123456', false)).rejects.toMatchObject({ codigo: 'nao_permitido' })
  })

  it('lembrar dispensa o TOTP por 30 dias, só para o mesmo e-mail', async () => {
    const m = await cadastrar()
    await m.api.confirmarAutenticador(totp(m.segredo, m.relogio.t), true)
    const outra = montar(m.armazenamento)
    outra.relogio.t += 29 * 24 * 3600_000
    await expect(outra.api.entrar(EMAIL, CODIGO_MOCK)).resolves.toMatchObject({ etapa: 'ok', sessao: { nome: 'Marcos Albuquerque' } })
    await expect(outra.api.entrar('financeiro@tenaris.com', CODIGO_MOCK)).resolves.toMatchObject({ etapa: 'cadastrar_autenticador' })
    outra.relogio.t += 2 * 24 * 3600_000
    await expect(outra.api.entrar(EMAIL, CODIGO_MOCK)).resolves.toEqual({ etapa: 'autenticador' })
  })

  it('refazer autenticador volta ao cadastro com segredo novo', async () => {
    const m = await cadastrar()
    await m.api.confirmarAutenticador(totp(m.segredo, m.relogio.t), true)
    refazerAutenticadorMock(m.armazenamento)
    const r = await montar(m.armazenamento).api.entrar(EMAIL, CODIGO_MOCK)
    if (r.etapa !== 'cadastrar_autenticador') throw new Error(r.etapa)
    expect(r.segredo).not.toBe(m.segredo)
  })

  it('5 TOTP errados bloqueiam por 15 minutos', async () => {
    const m = await cadastrar()
    for (let i = 0; i < 4; i++) await expect(m.api.confirmarAutenticador('000000', false)).rejects.toMatchObject({ codigo: 'totp_invalido' })
    await expect(m.api.confirmarAutenticador('000000', false)).rejects.toMatchObject({ codigo: 'bloqueado' })
    await expect(m.api.confirmarAutenticador(totp(m.segredo, m.relogio.t), false)).rejects.toMatchObject({ codigo: 'bloqueado' })
    m.relogio.t += 14 * 60_000
    await expect(m.api.entrar(EMAIL, CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'bloqueado' })
    m.relogio.t += 2 * 60_000
    await expect(m.api.entrar(EMAIL, CODIGO_MOCK)).resolves.toMatchObject({ etapa: 'cadastrar_autenticador' })
  })

  it('bloqueia na quinta tentativa errada', async () => {
    const api = createMockApi({ agora, armazenamento: armazenamentoEmMemoria() })
    for (let i = 0; i < 4; i++) await expect(api.entrar('fiscal@tenaris.com', '000000')).rejects.toMatchObject({ codigo: 'codigo_invalido' })
    await expect(api.entrar('fiscal@tenaris.com', '000000')).rejects.toMatchObject({ codigo: 'bloqueado' })
    await expect(api.entrar('fiscal@tenaris.com', CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'bloqueado' })
  })

  it('o bloqueio dura 15 minutos', async () => {
    let t = new Date('2026-10-28T13:00:00Z').getTime()
    const api = createMockApi({ agora: () => new Date(t), armazenamento: armazenamentoEmMemoria() })
    for (let i = 0; i < 5; i++) await api.entrar('fiscal@tenaris.com', '000000').catch(() => undefined)
    t += 14 * 60_000
    await expect(api.entrar('fiscal@tenaris.com', CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'bloqueado' })
    t += 2 * 60_000
    await expect(api.entrar('fiscal@tenaris.com', CODIGO_MOCK)).resolves.toMatchObject({ etapa: 'cadastrar_autenticador' })
  })

  it('e-mail não cadastrado falha igual a código errado', async () => {
    const api = createMockApi({ agora, armazenamento: armazenamentoEmMemoria() })
    await api.solicitarCodigo('alguem@outra.com')
    await expect(api.entrar('alguem@outra.com', CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'codigo_invalido' })
  })
})
