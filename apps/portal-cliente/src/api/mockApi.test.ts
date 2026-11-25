import { describe, expect, it } from 'vitest'
import { apagarSenhasMock, armazenamentoEmMemoria, createMockApi, CODIGO_MOCK, usuarioMock } from './mockApi'
import { ErroPortal } from './PortalApi'
import type { PassageiroPedido } from '../domain/types'

const EMAIL = 'fiscal@tenaris.com'
const SENHA = 'senha-boa-123'
const T0 = new Date('2026-10-28T13:00:00Z').getTime()

/** Mock com relógio controlável e armazenamento isolado por teste. */
function montar(armazenamento = armazenamentoEmMemoria()) {
  const relogio = { t: T0 }
  const api = createMockApi({ agora: () => new Date(relogio.t), armazenamento })
  return { api, relogio, armazenamento }
}

/** 1º acesso completo: código do e-mail e senha criada. */
async function primeiroAcesso(m = montar(), email = EMAIL) {
  await m.api.solicitarCodigo(email)
  await m.api.confirmarCodigo(email, CODIGO_MOCK)
  await m.api.criarSenha(SENHA)
  return m
}

async function logado() {
  return (await primeiroAcesso()).api
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

  it('1º acesso: código do e-mail, cria a senha e entra; depois entra só com a senha', async () => {
    const m = montar()
    await expect(m.api.entrar(EMAIL, SENHA)).rejects.toMatchObject({ codigo: 'senha_invalida' })
    await primeiroAcesso(m)
    await expect(m.api.listar()).resolves.toHaveLength(30)
    await m.api.sair()
    await expect(montar(m.armazenamento).api.entrar(EMAIL, SENHA)).resolves.toMatchObject({ nome: 'Marcos Albuquerque', cliente: 'Tenaris' })
  })

  it('senha errada e e-mail não liberado respondem igual', async () => {
    const m = await primeiroAcesso()
    await expect(m.api.entrar(EMAIL, 'outra-senha')).rejects.toMatchObject({ codigo: 'senha_invalida' })
    await expect(m.api.entrar('alguem@example.com', SENHA)).rejects.toMatchObject({ codigo: 'senha_invalida' })
  })

  it('criar senha exige o código confirmado e o mínimo de caracteres', async () => {
    const m = montar()
    await expect(m.api.criarSenha(SENHA)).rejects.toMatchObject({ codigo: 'nao_permitido' })
    await expect(m.api.confirmarCodigo(EMAIL, '000000')).rejects.toMatchObject({ codigo: 'codigo_invalido' })
    await expect(m.api.criarSenha(SENHA)).rejects.toMatchObject({ codigo: 'nao_permitido' })
    await m.api.confirmarCodigo(EMAIL, CODIGO_MOCK)
    await expect(m.api.criarSenha('curta')).rejects.toMatchObject({ codigo: 'senha_fraca' })
    await expect(m.api.criarSenha('        ')).rejects.toMatchObject({ codigo: 'senha_fraca' })
    await expect(m.api.criarSenha(SENHA)).resolves.toMatchObject({ email: EMAIL })
  })

  it('esqueci a senha troca a senha antiga', async () => {
    const m = await primeiroAcesso()
    await m.api.confirmarCodigo(EMAIL, CODIGO_MOCK)
    await m.api.criarSenha('senha-nova-456')
    await expect(m.api.entrar(EMAIL, SENHA)).rejects.toMatchObject({ codigo: 'senha_invalida' })
    await expect(m.api.entrar(EMAIL, 'senha-nova-456')).resolves.toMatchObject({ email: EMAIL })
  })

  it('a sessão volta no recarregar por 30 dias; sair ou apagar as senhas encerra', async () => {
    const m = await primeiroAcesso()
    const outra = montar(m.armazenamento)
    outra.relogio.t += 29 * 24 * 3600_000
    await expect(outra.api.sessao()).resolves.toMatchObject({ email: EMAIL })
    outra.relogio.t += 2 * 24 * 3600_000
    await expect(outra.api.sessao()).resolves.toBeNull()

    const m2 = await primeiroAcesso()
    await m2.api.sair()
    await expect(montar(m2.armazenamento).api.sessao()).resolves.toBeNull()

    const m3 = await primeiroAcesso()
    apagarSenhasMock(m3.armazenamento)
    await expect(montar(m3.armazenamento).api.sessao()).resolves.toBeNull()
  })

  it('5 erros bloqueiam por 15 minutos, até com a senha certa', async () => {
    const m = await primeiroAcesso()
    for (let i = 0; i < 4; i++) await expect(m.api.entrar(EMAIL, 'errada-000')).rejects.toMatchObject({ codigo: 'senha_invalida' })
    await expect(m.api.entrar(EMAIL, 'errada-000')).rejects.toMatchObject({ codigo: 'bloqueado' })
    await expect(m.api.entrar(EMAIL, SENHA)).rejects.toMatchObject({ codigo: 'bloqueado' })
    await expect(m.api.confirmarCodigo(EMAIL, CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'bloqueado' })
    m.relogio.t += 14 * 60_000
    await expect(m.api.entrar(EMAIL, SENHA)).rejects.toMatchObject({ codigo: 'bloqueado' })
    m.relogio.t += 2 * 60_000
    await expect(m.api.entrar(EMAIL, SENHA)).resolves.toMatchObject({ email: EMAIL })
  })

  it('código errado conta para o bloqueio; e-mail não liberado ouve sem_acesso', async () => {
    const m = montar()
    await expect(m.api.solicitarCodigo('alguem@outra.com')).rejects.toMatchObject({ codigo: 'sem_acesso' })
    await expect(m.api.confirmarCodigo('alguem@outra.com', CODIGO_MOCK)).rejects.toMatchObject({ codigo: 'codigo_invalido' })
    for (let i = 0; i < 3; i++) await expect(m.api.confirmarCodigo(EMAIL, '000000')).rejects.toMatchObject({ codigo: 'codigo_invalido' })
    await expect(m.api.confirmarCodigo(EMAIL, '000000')).rejects.toMatchObject({ codigo: 'bloqueado' })
  })
})

describe('mockApi multi-cliente', () => {
  it('autoriza por cadastro ou por domínio; recusa domínio estranho e cliente sem módulo', () => {
    expect(usuarioMock('fiscal@tenaris.com')).toMatchObject({ cliente: 'Tenaris', modulos: ['validar'] })
    expect(usuarioMock('paula.ribeiro@latasa.com.br')).toEqual({ nome: 'Paula Ribeiro', cliente: 'Latasa', modulos: ['pedir', 'meus_servicos'] })
    expect(usuarioMock('alguem@example.com')).toBeNull()
    expect(usuarioMock('x@semmodulo.com.br')).toBeNull()
  })

  const latasa = (email = 'compras@latasa.com.br') => primeiroAcesso(montar(), email)

  it('Latasa não lista validações; Tenaris não pede', async () => {
    const { api } = await latasa()
    await expect(api.listar()).rejects.toMatchObject({ codigo: 'nao_permitido' })
    await expect((await logado()).meusServicos()).rejects.toMatchObject({ codigo: 'nao_permitido' })
  })

  it('pedido entra como Solicitado em Meus serviços; o mesmo pedido em 1 minuto é duplicado; depois passa', async () => {
    const { api, relogio } = await latasa()
    const antes = (await api.meusServicos()).length
    const novo = { passageiros: [{ nome: 'Hiroshi Tanaka', telefone: '(12) 99999-0001' }], origem: 'Latasa', destino: 'GRU', saida: new Date(T0 + 86400_000).toISOString() }
    const criado = await api.pedir(novo)
    expect(criado).toMatchObject({ status: 'solicitado', numero: /^RV-/ })
    expect((await api.meusServicos())[0]).toEqual(criado)
    expect(await api.meusServicos()).toHaveLength(antes + 1)
    await expect(api.pedir(novo)).rejects.toMatchObject({ codigo: 'duplicado' })
    relogio.t += 61_000
    await expect(api.pedir(novo)).resolves.toMatchObject({ status: 'solicitado' })
    await expect(api.pedir({ ...novo, origem: '' })).rejects.toMatchObject({ message: 'Informe o endereço de saída.' })
    await expect(api.cancelarPedido(criado.id)).resolves.toMatchObject({ id: criado.id, status: 'cancelado' })
    await expect(api.cancelarPedido(criado.id)).rejects.toMatchObject({ message: expect.stringContaining('fale com a Betinhos') })
  })

  it('busca de passageiros: só pessoas do cliente, por parte do nome, sem acento nem caixa', async () => {
    const { api } = await latasa()
    expect((await api.buscarPassageiros('')).map((p) => p.nome)).toEqual(['Carla Menezes', 'Hiroshi Tanaka', 'Juliana Prado', 'Rafael Duarte'])
    expect(await api.buscarPassageiros('TANAKA')).toEqual([expect.objectContaining({ id: 'pes-3', nome: 'Hiroshi Tanaka', email: 'hiroshi.tanaka@exemplo.com.br' })])
    expect(await api.buscarPassageiros('zzz')).toEqual([])
    await expect((await logado()).buscarPassageiros('a')).rejects.toMatchObject({ codigo: 'nao_permitido' })
  })

  it('sugestão de endereço: mínimo de 3 letras, sem acento nem caixa, no máximo 6, só com sessão', async () => {
    const { api } = await latasa()
    expect(await api.buscarEnderecos('av')).toEqual([])
    const r = await api.buscarEnderecos('AEROPORTO')
    expect(r.length).toBeGreaterThan(0)
    expect(r.length).toBeLessThanOrEqual(6)
    expect(r.every((e) => e.rotulo && e.endereco)).toBe(true)
    expect(await api.buscarEnderecos('zzzzzz')).toEqual([])
    await expect((await logado()).buscarEnderecos('aeroporto')).rejects.toMatchObject({ codigo: 'nao_permitido' })
  })

  it('pedido com pessoa nova cadastra; repetir nome e contato reaproveita; id existente corrige o contato; id alheio é recusado', async () => {
    const { api, relogio } = await latasa()
    const saida = new Date(T0 + 86400_000).toISOString()
    const pedido = (passageiros: PassageiroPedido[], origem = 'Latasa') => ({ passageiros, origem, destino: 'GRU', saida })
    const criado = await api.pedir(pedido([{ nome: 'Nilza Prado', email: 'nilza@exemplo.com.br' }]))
    expect(criado.pessoas).toEqual([expect.objectContaining({ nome: 'Nilza Prado', email: 'nilza@exemplo.com.br' })])
    const idNilza = criado.pessoas[0].id!
    expect(await api.buscarPassageiros('nilza')).toHaveLength(1)
    relogio.t += 61_000
    const de_novo = await api.pedir(pedido([{ nome: 'nilza prado', email: 'NILZA@exemplo.com.br' }], 'Outro'))
    expect(de_novo.pessoas[0].id).toBe(idNilza)
    expect(await api.buscarPassageiros('nilza')).toHaveLength(1)
    relogio.t += 61_000
    await api.pedir(pedido([{ id: 'pes-2', nome: 'Rafael Duarte', telefone: '(12) 98888-7777' }], 'Terceiro'))
    expect((await api.buscarPassageiros('rafael'))[0].telefone).toBe('(12) 98888-7777')
    await expect(api.pedir(pedido([{ id: 'pes-999', nome: 'X', email: 'x@y.co' }], 'Quarto'))).rejects.toMatchObject({ message: 'Passageiro não encontrado.' })
    await expect(api.pedir(pedido([{ nome: 'Sem contato' }], 'Quinto'))).rejects.toMatchObject({ message: 'Informe celular ou e-mail.' })
  })

  it('outro e-mail do mesmo domínio começa sem pedidos', async () => {
    const { api } = await latasa('paula.ribeiro@latasa.com.br')
    expect(await api.meusServicos()).toEqual([])
  })
})
