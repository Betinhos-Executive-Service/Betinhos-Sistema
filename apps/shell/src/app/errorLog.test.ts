// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logAppError, resetErrorLoggerForTests } from '@betinhos/ui/error-logger'
import { instalarLogDeErros, logFalhaDataverse } from './errorLog'

/** O teste injeta um Xrm mínimo; o tipo global (XrmHost) exige a Web API inteira. */
const janela = window as unknown as { Xrm?: unknown }

afterEach(() => {
  delete janela.Xrm
  resetErrorLoggerForTests()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('log de erros compartilhado (new_appmotoristaslog)', () => {
  it('em modo mock (sem Xrm) não grava nada', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    instalarLogDeErros()
    expect(await logAppError(new Error('mock'))).toBe('skipped')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('com o shim do shell (userSettings vazio) grava app, versão e usuário via WhoAmI', async () => {
    const createRecord = vi.fn().mockResolvedValue({ id: '1' })
    janela.Xrm = { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm2.dynamics.com' }) }, WebApi: { createRecord } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/WhoAmI')
      ? { UserId: '11111111-1111-1111-1111-111111111111' }
      : { internalemailaddress: 'pessoa@betinhos.com.br', fullname: 'Pessoa', domainname: 'pessoa@betinhos.com.br' }), { status: 200 })))
    instalarLogDeErros()
    expect(await logAppError(new Error('teste shell'), { action: 'teste' })).toBe('sent')
    const [tabela, registro] = createRecord.mock.calls[0]
    expect(tabela).toBe('new_appmotoristaslog')
    expect(registro).toMatchObject({ new_appname: 'Sistema Betinhos', new_appversion: `v${__APP_VERSION__}`, new_useremail: 'pessoa@betinhos.com.br' })
  })

  it('não registra falha da própria tabela de log (evita laço)', async () => {
    const createRecord = vi.fn().mockResolvedValue({ id: '1' })
    janela.Xrm = { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm2.dynamics.com', userSettings: { userId: '{11111111-1111-1111-1111-111111111111}' } }) }, WebApi: { createRecord } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    logFalhaDataverse({ method: 'POST', path: 'https://org.crm2.dynamics.com/api/data/v9.2/new_appmotoristaslogs', status: 500 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(createRecord).not.toHaveBeenCalled()
  })
})
