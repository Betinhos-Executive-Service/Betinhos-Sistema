// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logAppError, resetErrorLoggerForTests } from '@betinhos/ui/error-logger'
import { instalarLogDeErros, logFalhaDataverse, telaDoHash } from './errorLog'

/** O teste injeta um Xrm mínimo; o tipo global (XrmHost) exige a Web API inteira. */
const janela = window as unknown as { Xrm?: unknown }

function ocultarAba(oculta: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (oculta ? 'hidden' : 'visible') })
}

afterEach(() => {
  ocultarAba(false)
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

  it('new_screen sai sem busca nem filtros: q= e f= removidos, rota e demais parâmetros mantidos', async () => {
    const createRecord = vi.fn().mockResolvedValue({ id: '1' })
    janela.Xrm = { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm2.dynamics.com', userSettings: { userId: '{11111111-1111-1111-1111-111111111111}' } }) }, WebApi: { createRecord } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ internalemailaddress: 'pessoa@betinhos.com.br', fullname: 'Pessoa' }), { status: 200 })))
    location.hash = '#/geral?view=abc&q=Maria+Silva&sort=cr40f_cliente%3Adesc&f=eyJjbGllbnRlIjoiTWFyaWEifQ'
    instalarLogDeErros()
    expect(await logAppError(new Error('teste'))).toBe('sent')
    const registro = createRecord.mock.calls[0]![1] as Record<string, string>
    expect(registro.new_screen).toBe('geral?view=abc&sort=cr40f_cliente%3Adesc')
    expect(JSON.stringify(registro)).not.toMatch(/Maria|eyJjbGllbnRl/)
    location.hash = ''
  })

  it('telaDoHash: só q e f saem; hash sem parâmetros fica igual; vazio vira inicio', () => {
    expect(telaDoHash('#/geral?q=carlos')).toBe('geral')
    expect(telaDoHash('#/geral?f=abc&q=x')).toBe('geral')
    expect(telaDoHash('#/pendencias?tipos=rateio&q=agc')).toBe('pendencias?tipos=rateio')
    expect(telaDoHash('#/funcionarios?ficha=9b08&query=ok')).toBe('funcionarios?ficha=9b08&query=ok')
    expect(telaDoHash('#/frota-checklists/padroes')).toBe('frota-checklists/padroes')
    expect(telaDoHash('#/geral?')).toBe('geral')
    expect(telaDoHash('')).toBe('inicio')
    expect(telaDoHash('#/')).toBe('inicio')
  })

  describe('falha de rede com a página oculta (cancelamento do navegador)', () => {
    function xrmComCreateRecord() {
      const createRecord = vi.fn().mockResolvedValue({ id: '1' })
      janela.Xrm = { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm2.dynamics.com', userSettings: { userId: '{11111111-1111-1111-1111-111111111111}' } }) }, WebApi: { createRecord } }
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ internalemailaddress: 'pessoa@betinhos.com.br', fullname: 'Pessoa' }), { status: 200 })))
      instalarLogDeErros()
      return createRecord
    }
    const rede = { method: 'GET', path: 'https://org.crm2.dynamics.com/api/data/v9.2/cr40f_documentos', error: new TypeError('Failed to fetch') }
    const aguardar = () => new Promise((resolve) => setTimeout(resolve, 0))

    it('aba oculta: não registra', async () => {
      const createRecord = xrmComCreateRecord()
      ocultarAba(true)
      logFalhaDataverse(rede)
      await aguardar()
      expect(createRecord).not.toHaveBeenCalled()
    })

    it('aba visível: falha de rede continua registrada', async () => {
      const createRecord = xrmComCreateRecord()
      logFalhaDataverse(rede)
      await aguardar()
      expect(createRecord).toHaveBeenCalledTimes(1)
      expect(createRecord.mock.calls[0]![1]).toMatchObject({ new_errorname: 'NetworkError', new_severity: 'error' })
    })

    it('aba oculta: erro HTTP continua registrado', async () => {
      const createRecord = xrmComCreateRecord()
      ocultarAba(true)
      logFalhaDataverse({ method: 'GET', path: 'https://org.crm2.dynamics.com/api/data/v9.2/cr40f_documentos', status: 500 })
      await aguardar()
      expect(createRecord).toHaveBeenCalledTimes(1)
    })

    it('metadata da tabela de log também não gera registro (sem laço)', async () => {
      const createRecord = xrmComCreateRecord()
      logFalhaDataverse({ method: 'GET', path: "https://org.crm2.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='new_appmotoristaslog')", error: new TypeError('Failed to fetch') })
      logFalhaDataverse({ method: 'GET', path: "https://org.crm2.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='new_appmotoristaslog')", status: 500 })
      await aguardar()
      expect(createRecord).not.toHaveBeenCalled()
    })

    it('pagehide marca a página como saindo e pageshow desfaz', async () => {
      const createRecord = xrmComCreateRecord()
      window.dispatchEvent(new Event('pagehide'))
      logFalhaDataverse(rede)
      await aguardar()
      expect(createRecord).not.toHaveBeenCalled()
      window.dispatchEvent(new Event('pageshow'))
      logFalhaDataverse(rede)
      await aguardar()
      expect(createRecord).toHaveBeenCalledTimes(1)
    })
  })
})
