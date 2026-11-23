// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import type { Host } from '../../../host'
import { MOCK_EU, createSource } from './source'

afterEach(() => window.history.replaceState(null, '', '/'))

const real = (respostas: Record<string, unknown>, pedidos: { path: string; body?: string }[] = []) => ({
  mode: 'dataverse',
  client: {
    getAll: async (path: string) => { pedidos.push({ path }); const chave = Object.keys(respostas).find((k) => path.startsWith(k)); if (!chave) throw new Error(`caminho inesperado: ${path}`); return respostas[chave] },
    request: async (path: string, init?: { body?: string }) => { pedidos.push({ path, body: init?.body }); if (path === 'WhoAmI') return { UserId: '{AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}' }; return {} },
  },
}) as unknown as Host

describe('fonte real', () => {
  const respostas = {
    systemusers: [
      { systemuserid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullname: 'Ana Exemplo', internalemailaddress: 'ana@exemplo.test', systemuserroles_association: [{ name: 'Perfil - Base' }] },
      { systemuserid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fullname: 'Bruno Modelo', internalemailaddress: 'bruno@exemplo.test', systemuserroles_association: [{ name: 'Perfil - Financeiro - Operador' }, { name: 'Perfil - Base' }] },
    ],
    teams: [{ name: 'Equipe', teamroles_association: [{ name: 'Administrador do Sistema' }], teammembership_association: [{ systemuserid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] }],
    cr40f_acessohistoricos: [{
      cr40f_acessohistoricoid: 'h1', _cr40f_usuario_value: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', _cr40f_alteradopor_value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      cr40f_perfisantes: '[]', cr40f_perfisdepois: '[{"perfil":"financeiro","nivel":"operador"}]', createdon: '2026-11-22T12:00:00Z',
    }],
  }

  it('monta pessoas (admin por equipe), histórico com nomes e a última alteração', async () => {
    const dados = await createSource(real(respostas)).load()
    expect(dados.euId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(dados.pessoas.map((x) => [x.nome, x.admin, x.perfis.areas])).toEqual([['Ana Exemplo', true, {}], ['Bruno Modelo', false, { financeiro: 'operador' }]])
    expect(dados.pessoas[1].alteradoEm?.toISOString()).toBe('2026-11-22T12:00:00.000Z')
    expect(dados.historico[0]).toMatchObject({ usuario: 'Bruno Modelo', alteradoPor: 'Ana Exemplo', depois: { areas: { financeiro: 'operador' }, acessos: false } })
  })

  it('definir chama a Custom API com Usuario e Perfis em JSON', async () => {
    const pedidos: { path: string; body?: string }[] = []
    await createSource(real(respostas, pedidos)).definir('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { areas: { frota: 'gestor' }, acessos: false })
    const chamada = pedidos.find((x) => x.path === 'cr40f_AcessoDefinirPerfis')
    expect(JSON.parse(chamada?.body ?? '{}')).toEqual({ Usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', Perfis: '[{"perfil":"frota","nivel":"gestor"}]' })
  })
})

describe('fonte mock', () => {
  const mock = () => createSource({ mode: 'mock' } as Host)

  it('grava, registra no histórico e recusa o próprio acesso', async () => {
    const source = mock()
    const antes = await source.load()
    const alvo = antes.pessoas.find((x) => x.nome === 'Bruno Modelo')!
    await source.definir(alvo.id, { areas: { financeiro: 'gestor' }, acessos: false })
    const depois = await source.load()
    expect(depois.pessoas.find((x) => x.id === alvo.id)?.perfis.areas).toEqual({ financeiro: 'gestor' })
    expect(depois.historico[0]).toMatchObject({ usuario: 'Bruno Modelo', alteradoPor: 'Ana Exemplo' })
    await expect(source.definir(MOCK_EU, { areas: {}, acessos: false })).rejects.toThrow('PROPRIO_ACESSO: Ninguém altera o próprio acesso.')
  })

  it('?falha=salvar simula perfil ainda não publicado', async () => {
    window.history.replaceState(null, '', '/?falha=salvar')
    const source = mock()
    const alvo = (await source.load()).pessoas.find((x) => x.nome === 'Bruno Modelo')!
    await expect(source.definir(alvo.id, { areas: { frota: 'gestor' }, acessos: false })).rejects.toThrow('PERFIL_INDISPONIVEL: Perfil ainda não publicado neste ambiente: Perfil - Frota - Gestor.')
  })
})
