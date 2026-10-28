import { describe, expect, it } from 'vitest'
import { createMockApi, CODIGO_MOCK } from './mockApi'
import { ErroPortal } from './PortalApi'

const agora = () => new Date('2026-10-28T13:00:00Z')

async function logado() {
  const api = createMockApi({ agora })
  await api.entrar('fiscal@tenaris.com', CODIGO_MOCK)
  return api
}

describe('mockApi', () => {
  it('gera 30 serviços com a distribuição do plano', async () => {
    const lista = await (await logado()).listar()
    const conta = (st: string) => lista.filter((s) => s.status === st).length
    expect(lista).toHaveLength(30)
    expect([conta('liberado'), conta('em_duvida'), conta('respondido'), conta('aprovado'), conta('aprovado_tacito')]).toEqual([14, 4, 3, 6, 3])
  })

  it('exige sessão para listar', async () => {
    await expect(createMockApi({ agora }).listar()).rejects.toMatchObject({ codigo: 'nao_permitido' })
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

  it('bloqueia na quinta tentativa errada', async () => {
    const api = createMockApi({ agora })
    for (let i = 0; i < 4; i++) await expect(api.entrar('fiscal@tenaris.com', '000000')).rejects.toMatchObject({ codigo: 'codigo_invalido' })
    await expect(api.entrar('fiscal@tenaris.com', '000000')).rejects.toMatchObject({ codigo: 'bloqueado' })
    await expect(api.entrar('fiscal@tenaris.com', CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'bloqueado' })
  })

  it('o bloqueio dura 15 minutos', async () => {
    let t = new Date('2026-10-28T13:00:00Z').getTime()
    const api = createMockApi({ agora: () => new Date(t) })
    for (let i = 0; i < 5; i++) await api.entrar('fiscal@tenaris.com', '000000').catch(() => undefined)
    t += 14 * 60_000
    await expect(api.entrar('fiscal@tenaris.com', CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'bloqueado' })
    t += 2 * 60_000
    await expect(api.entrar('fiscal@tenaris.com', CODIGO_MOCK)).resolves.toMatchObject({ cliente: 'Tenaris' })
  })

  it('e-mail não cadastrado falha igual a código errado', async () => {
    const api = createMockApi({ agora })
    await api.solicitarCodigo('alguem@outra.com')
    await expect(api.entrar('alguem@outra.com', CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'codigo_invalido' })
  })
})
