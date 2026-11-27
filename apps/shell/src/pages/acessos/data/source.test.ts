// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import type { Host } from '../../../host'
import { AcessoError } from '../../funcionarios/data/acesso'
import { MOCK_EU, MOCK_ENCERRADA, createSource, montarEncerrados } from './source'

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

  it('temFicha cruza o e-mail sem diferenciar maiúsculas e, sem ler as fichas, ninguém some', async () => {
    const com = await createSource(real({ ...respostas, cr40f_funcionarioses: [{ cr40f_emailmicrosoft: ' ANA@exemplo.test ' }] })).load()
    expect(com.pessoas.map((x) => [x.nome, x.temFicha])).toEqual([['Ana Exemplo', true], ['Bruno Modelo', false]])
    const sem = await createSource(real(respostas)).load()
    expect(sem.pessoas.every((x) => !x.temFicha)).toBe(true)
  })

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

  it('definir só manda RetirarAmplo ou DevolverAmplo quando pedidos', async () => {
    const pedidos: { path: string; body?: string }[] = []
    const source = createSource(real(respostas, pedidos))
    await source.definir('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { areas: {}, acessos: false }, { retirarAmplo: true })
    await source.definir('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { areas: {}, acessos: false }, { devolverAmplo: true })
    const corpos = pedidos.filter((x) => x.path === 'cr40f_AcessoDefinirPerfis').map((x) => JSON.parse(x.body ?? '{}'))
    expect(corpos[0]).toMatchObject({ RetirarAmplo: true })
    expect(corpos[0]).not.toHaveProperty('DevolverAmplo')
    expect(corpos[1]).toMatchObject({ DevolverAmplo: true })
  })

  it('prévia e uso vão por POST numa chamada só; RetirarAmplo e Tabelas só quando pedidos', async () => {
    const pedidos: { path: string; init: { method?: string; body?: string } }[] = []
    const resposta = (path: string, init: { body?: string }) => ({ Resultado: JSON.parse(init.body ?? '{}').Tabelas ? '{"uso":[{"tabela":"cr40f_a","registros":3,"limitado":false,"incerto":false}]}' : '{"admin":{"antes":true,"depois":false},"perdas":[],"colunas":[],"grupos":[],"apps":[],"flows":[],"conexoes":[]}' })
    const host = { mode: 'dataverse', client: { getAll: async () => [], request: async (path: string, init: { method?: string; body?: string }) => { pedidos.push({ path, init }); return resposta(path, init) } } } as unknown as Host
    const source = createSource(host)
    const previa = await source.previa('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { areas: { frota: 'gestor' }, acessos: false }, true)
    expect(previa.admin).toEqual({ antes: true, depois: false })
    const tabelas = Array.from({ length: 60 }, (_, i) => `cr40f_t${i}`)
    const uso = await source.uso('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { areas: {}, acessos: false }, false, tabelas)
    expect(uso).toHaveLength(1)
    expect(pedidos.map((x) => [x.path, x.init.method])).toEqual([['cr40f_AcessoPrevia', 'POST'], ['cr40f_AcessoPrevia', 'POST']])
    expect(JSON.parse(pedidos[0].init.body!)).toEqual({ Usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', Perfis: '[{"perfil":"frota","nivel":"gestor"}]', RetirarAmplo: true })
    expect(JSON.parse(pedidos[1].init.body!)).toEqual({ Usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', Perfis: '[]', Tabelas: JSON.stringify(tabelas) })
  })

  it('resposta da prévia sem o formato vira falha', async () => {
    const host = { mode: 'dataverse', client: { getAll: async () => [], request: async () => ({ Resultado: '{"perdas":[]}' }) } } as unknown as Host
    await expect(createSource(host).previa('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { areas: {}, acessos: false }, false)).rejects.toThrow()
  })
})

describe('encerrar e reativar (fonte real)', () => {
  const sistema = (resposta: (path: string) => unknown, pedidos: { path: string; body?: string }[] = []) => ({
    mode: 'dataverse',
    client: { getAll: async () => [], request: async (path: string, init?: { body?: string }) => { pedidos.push({ path, body: init?.body }); return resposta(path) } },
  }) as unknown as Host

  it('chama as Custom APIs e devolve as etapas', async () => {
    const pedidos: { path: string; body?: string }[] = []
    const source = createSource(sistema(() => ({ Etapas: '[{"etapa":"papeis","estado":"feita","detalhe":"2 retirado(s)"}]' }), pedidos))
    expect(await source.encerrar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bruno')).toEqual([{ etapa: 'papeis', estado: 'feita', detalhe: '2 retirado(s)' }])
    await source.reativar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    expect(pedidos.map((x) => [x.path, JSON.parse(x.body ?? '{}')])).toEqual([
      ['cr40f_AcessoEncerrar', { Usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', Confirmacao: 'Bruno' }],
      ['cr40f_AcessoReativar', { Usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
    ])
  })

  it('recusa vira AcessoError com código, mensagem do servidor e etapas', async () => {
    const source = createSource(sistema(() => { throw new Error('Error: SEM_PERMISSAO: Esta pessoa tem o acesso amplo: só o Administrador do Sistema encerra. | etapas=[{"etapa":"confirmacao","estado":"erro","detalhe":"x"}]') }))
    const erro = await source.encerrar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bruno').catch((e) => e)
    expect(erro).toBeInstanceOf(AcessoError)
    expect(erro).toMatchObject({ codigo: 'SEM_PERMISSAO', message: 'Esta pessoa tem o acesso amplo: só o Administrador do Sistema encerra.', etapas: [{ etapa: 'confirmacao', estado: 'erro', detalhe: 'x' }] })
    const outra = await createSource(sistema(() => { throw new Error('NADA_A_REATIVAR: Não há encerramento de acesso a reativar para esta pessoa.') })).reativar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').catch((e) => e)
    expect(outra).toMatchObject({ codigo: 'NADA_A_REATIVAR', etapas: [] })
  })

  it('montarEncerrados: só conta bloqueada cujo último histórico é encerrar, com data e quem fez', () => {
    const encerrar = '{"acao":"encerrar","papeis":[{"id":"p","nome":"Perfil - Base"}],"perfisColuna":[],"equipes":[]}'
    const desativados = [
      { systemuserid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fullname: 'Bruno Modelo', internalemailaddress: 'bruno@exemplo.test' },
      { systemuserid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', fullname: 'Carla Amostra', internalemailaddress: 'carla@exemplo.test' },
      { systemuserid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', fullname: 'Diego Teste', internalemailaddress: 'diego@exemplo.test' },
    ]
    const ativos = [{ systemuserid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullname: 'Ana Exemplo' }]
    const h = (usuario: string, amplo: string | null, createdon: string) => ({ _cr40f_usuario_value: usuario, _cr40f_alteradopor_value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cr40f_amplo: amplo, createdon })
    const historico = [
      h('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', encerrar, '2026-11-25T12:00:00Z'),
      h('cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, '2026-11-24T12:00:00Z'), // bloqueada, mas o último registro não é encerrar
      h('cccccccc-cccc-4ccc-8ccc-cccccccccccc', encerrar, '2026-11-20T12:00:00Z'),
      // Diego sem histórico: bloqueada por outro motivo
    ]
    expect(montarEncerrados(desativados, ativos, historico)).toEqual([{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nome: 'Bruno Modelo', email: 'bruno@exemplo.test', encerradoEm: new Date('2026-11-25T12:00:00Z'), encerradoPor: 'Ana Exemplo', fichaId: null }])
  })

  it('encerrados lê contas bloqueadas, nomes e histórico e não toca em `load`', async () => {
    const caminhos: string[] = []
    const host = { mode: 'dataverse', client: { getAll: async (p: string) => { caminhos.push(p); return [] }, request: async () => ({}) } } as unknown as Host
    expect(await createSource(host).encerrados()).toEqual([])
    expect(caminhos.some((c) => c.startsWith('systemusers') && decodeURIComponent(c).includes('isdisabled eq true'))).toBe(true)
    expect(caminhos.filter((c) => c.startsWith('systemusers') && decodeURIComponent(c).includes('isdisabled eq false'))).toHaveLength(1)
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

  it('encerrar tira a pessoa da lista, entra em encerrados e no histórico; reativar desfaz', async () => {
    const source = mock()
    const alvo = (await source.load()).pessoas.find((x) => x.nome === 'Bruno Modelo')!
    expect((await source.encerrados()).map((e) => e.id)).toEqual([MOCK_ENCERRADA.id])
    const etapas = await source.encerrar(alvo.id, ' bruno ')
    expect(etapas.some((e) => e.etapa === 'bloqueio' && e.estado === 'feita')).toBe(true)
    const depois = await source.load()
    expect(depois.pessoas.some((x) => x.id === alvo.id)).toBe(false)
    expect(depois.historico[0]).toMatchObject({ usuario: 'Bruno Modelo', amplo: { acao: 'encerrar' } })
    expect((await source.encerrados())[0]).toMatchObject({ id: alvo.id, encerradoPor: 'Ana Exemplo' })
    await expect(source.encerrar(alvo.id, 'Bruno')).rejects.toMatchObject({ codigo: 'JA_ENCERRADO' })
    await source.reativar(alvo.id)
    const volta = await source.load()
    expect(volta.pessoas.find((x) => x.id === alvo.id)?.perfis.areas).toEqual({ financeiro: 'operador' })
    expect(volta.historico[0].amplo?.acao).toBe('reativar')
    expect((await source.encerrados()).map((e) => e.id)).toEqual([MOCK_ENCERRADA.id])
    await expect(source.reativar(alvo.id)).rejects.toMatchObject({ codigo: 'NADA_A_REATIVAR' })
  })

  it('encerrar recusa o próprio acesso, confirmação errada e ?falha=salvar', async () => {
    const source = mock()
    const alvo = (await source.load()).pessoas.find((x) => x.nome === 'Bruno Modelo')!
    await expect(source.encerrar(MOCK_EU, 'Ana')).rejects.toMatchObject({ codigo: 'PROPRIO_ACESSO' })
    await expect(source.encerrar(alvo.id, 'Carlos')).rejects.toMatchObject({ codigo: 'CONFIRMACAO_INVALIDA' })
    window.history.replaceState(null, '', '/?falha=salvar')
    await expect(source.encerrar(alvo.id, 'Bruno')).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })
    await expect(source.reativar(MOCK_ENCERRADA.id)).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })
    expect((await source.load()).pessoas.some((x) => x.id === alvo.id)).toBe(true)
  })
})
