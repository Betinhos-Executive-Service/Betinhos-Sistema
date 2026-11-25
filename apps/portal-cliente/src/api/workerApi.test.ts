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
