import { describe, expect, it } from 'vitest'
import { ErroPortal } from './PortalApi'
import { createWorkerApi } from './workerApi'

const resposta = (status: number, corpo?: unknown) => async () =>
  new Response(corpo === undefined ? null : JSON.stringify(corpo), { status })

describe('workerApi', () => {
  it('manda credentials include e JSON', async () => {
    let init: RequestInit | undefined
    const api = createWorkerApi('/api', async (_u, i) => ((init = i), new Response(JSON.stringify({ etapa: 'autenticador' }), { status: 200 })))
    expect(await api.entrar('a@b.com', '123456')).toEqual({ etapa: 'autenticador' })
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"email":"a@b.com","codigo":"123456"}' })
  })

  it('204 vira undefined', async () => {
    expect(await createWorkerApi('/api', resposta(204)).solicitarCodigo('a@b.com')).toBeUndefined()
  })

  it.each([
    [401, { erro: 'totp_invalido' }, 'totp_invalido'],
    [429, undefined, 'bloqueado'],
    [404, { erro: 'nao_permitido' }, 'nao_permitido'],
    [500, { erro: 'qualquer' }, 'falha'],
  ])('HTTP %i → ErroPortal %s', async (status, corpo, codigo) => {
    const erro = await createWorkerApi('/api', resposta(status, corpo)).listar().catch((e) => e)
    expect(erro).toBeInstanceOf(ErroPortal)
    expect(erro.codigo).toBe(codigo)
  })
})
