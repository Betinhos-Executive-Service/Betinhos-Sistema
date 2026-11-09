import { resetErrorLoggerForTests } from '@betinhos-executive-service/ui/error-logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installGlobalErrorLogging, logAppError } from './errorLogger'

vi.stubGlobal('__APP_VERSION__', '0.2.102')
vi.stubGlobal('__APP_DATE__', '20/10/2026')
vi.stubGlobal('__APP_BUILD_ISO__', '2026-10-20T13:30:00.000Z')

function mockXrm(createRecord: ReturnType<typeof vi.fn>) {
  window.Xrm = {
    Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm2.dynamics.com', userSettings: { userId: '{ABC}', userName: 'Teste' } }) },
    WebApi: { retrieveRecord: vi.fn(), retrieveMultipleRecords: vi.fn(), createRecord, updateRecord: vi.fn(), deleteRecord: vi.fn() }
  } as unknown as typeof window.Xrm
}

describe('errorLogger (pacote compartilhado)', () => {
  let uninstall: () => void = () => undefined

  beforeEach(() => {
    resetErrorLoggerForTests()
    globalThis.localStorage?.clear() // Node 25+ pode deixar o global sem Storage
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ fullname: 'Teste', internalemailaddress: 'pessoa@betinhos.com.br', domainname: 'pessoa@betinhos.com.br' }) }))
    uninstall = installGlobalErrorLogging()
  })

  afterEach(() => {
    uninstall()
    vi.restoreAllMocks()
    delete window.Xrm
  })

  it('grava no contrato da tabela com appName, versão, tela e e-mail', async () => {
    const createRecord = vi.fn().mockResolvedValue({ id: 'log-id' })
    mockXrm(createRecord)

    await logAppError(new Error('Falha de teste'), { action: 'test', detailId: 'finance-id' })

    expect(createRecord).toHaveBeenCalledWith('new_appmotoristaslog', expect.objectContaining({
      new_message: 'Falha de teste',
      new_action: 'test',
      new_source: 'Web Resource',
      new_detailid: 'finance-id',
      new_appname: 'Tela Gerar Pagantes',
      new_appversion: 'v0.2.102',
      new_builtat: '20/10/2026 10:30',
      new_screen: 'Gerar Pagantes',
      new_useremail: 'pessoa@betinhos.com.br'
    }))
  })

  it('não propaga falha do próprio logger', async () => {
    mockXrm(vi.fn().mockRejectedValue(new Error('Dataverse indisponivel')))

    await expect(logAppError('Falha original')).resolves.toBeUndefined()
  })

  it('não grava nada em modo mock (sem Xrm)', async () => {
    const fetchMock = vi.mocked(fetch)

    await expect(logAppError(new Error('mock'))).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
