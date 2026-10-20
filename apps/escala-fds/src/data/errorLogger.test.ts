import { afterEach, describe, expect, it, vi } from 'vitest'
import { installErrorLogger, logAppError, resetErrorLoggerForTests } from '@betinhos/ui/error-logger'
import { loggedFetch } from './source'

describe('error-logger na Escala FDS', () => {
  afterEach(() => { resetErrorLoggerForTests(); vi.unstubAllGlobals() })

  it('em modo mock (sem Xrm) não grava nada', async () => {
    installErrorLogger({ appName: 'Escala FDS', appVersion: 'v0.0.0' })
    expect(await logAppError(new Error('teste'), { action: 'carregar-escala' })).toBe('skipped')
  })

  it('loggedFetch devolve a resposta de erro sem alterar o fluxo', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'falhou' } }), { status: 500 })
    vi.stubGlobal('fetch', vi.fn(async () => response))
    const result = await loggedFetch('https://org.crm2.dynamics.com/api/data/v9.2/cr40f_escalafdses', { method: 'PATCH' })
    expect(result.status).toBe(500)
  })

  it('loggedFetch repassa a falha de rede', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(loggedFetch('https://org.crm2.dynamics.com/api/data/v9.2/x')).rejects.toThrow('Failed to fetch')
  })
})
