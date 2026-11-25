import { describe, expect, it } from 'vitest'
import { ErroPortal } from './PortalApi'
import { createWorkerApi } from './workerApi'

const resposta = (status: number, corpo?: unknown) => async () =>
  new Response(corpo === undefined ? null : JSON.stringify(corpo), { status })

describe('workerApi', () => {
  it('manda credentials include e JSON', async () => {
    let init: RequestInit | undefined
    const sessao = { nome: 'A', email: 'a@b.com', cliente: 'Latasa', modulos: ['pedir'] }
    const api = createWorkerApi('/api', async (_u, i) => ((init = i), new Response(JSON.stringify(sessao), { status: 200 })))
    expect(await api.entrar('a@b.com', 'senha-boa')).toEqual(sessao)
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"email":"a@b.com","senha":"senha-boa"}' })
  })

  it('buscarPassageiros chama GET /passageiros com a busca codificada', async () => {
    let url = ''
    const api = createWorkerApi('/api', async (u) => ((url = String(u)), new Response(JSON.stringify([{ id: 'p1', nome: 'Ana' }]), { status: 200 })))
    expect(await api.buscarPassageiros('ana s')).toEqual([{ id: 'p1', nome: 'Ana' }])
    expect(url).toBe('/api/passageiros?q=ana%20s')
  })

  it('buscarEnderecos chama GET /enderecos com a busca codificada e repassa o sinal de cancelamento', async () => {
    let url = ''
    let sinal: AbortSignal | null | undefined
    const api = createWorkerApi('/api', async (u, i) => ((url = String(u)), (sinal = i?.signal), new Response(JSON.stringify([{ rotulo: 'A', endereco: 'B' }]), { status: 200 })))
    const controle = new AbortController()
    expect(await api.buscarEnderecos('av paulista', controle.signal)).toEqual([{ rotulo: 'A', endereco: 'B' }])
    expect(url).toBe('/api/enderecos?q=av%20paulista')
    expect(sinal).toBe(controle.signal)
  })

  it('sessão: 401 nao_permitido vira null (sem login), outro erro sobe', async () => {
    expect(await createWorkerApi('/api', resposta(401, { erro: 'nao_permitido' })).sessao()).toBeNull()
    await expect(createWorkerApi('/api', resposta(500)).sessao()).rejects.toMatchObject({ codigo: 'falha' })
  })

  it('204 vira undefined', async () => {
    expect(await createWorkerApi('/api', resposta(204)).solicitarCodigo('a@b.com')).toBeUndefined()
  })

  it.each([
    [401, { erro: 'senha_invalida' }, 'senha_invalida'],
    [429, undefined, 'bloqueado'],
    [404, { erro: 'nao_permitido' }, 'nao_permitido'],
    [500, { erro: 'qualquer' }, 'falha'],
  ])('HTTP %i → ErroPortal %s', async (status, corpo, codigo) => {
    const erro = await createWorkerApi('/api', resposta(status, corpo)).listar().catch((e) => e)
    expect(erro).toBeInstanceOf(ErroPortal)
    expect(erro.codigo).toBe(codigo)
  })
})

describe('workerApi.marca', () => {
  it('consulta pela chave do link ou pelo e-mail, sem expor nada além do endereço', async () => {
    const urls: string[] = []
    const marca = { nome: 'ReciclaBR Latasa', cor: '#0a7d4a', logoUrl: '/api/marca/logo/x?v=1' }
    const api = createWorkerApi('/api', async (u) => (urls.push(String(u)), new Response(JSON.stringify(marca), { status: 200 })))
    expect(await api.marca({ chave: 'latasa' })).toEqual(marca)
    await api.marca({ email: 'a+b@x.com.br' })
    expect(urls).toEqual(['/api/marca?c=latasa', '/api/marca?email=a%2Bb%40x.com.br'])
  })

  it('404 vira null; erro do servidor sobe', async () => {
    expect(await createWorkerApi('/api', resposta(404, { erro: 'nao_permitido' })).marca({ chave: 'x' })).toBeNull()
    await expect(createWorkerApi('/api', resposta(500)).marca({ chave: 'x' })).rejects.toMatchObject({ codigo: 'falha' })
  })
})
