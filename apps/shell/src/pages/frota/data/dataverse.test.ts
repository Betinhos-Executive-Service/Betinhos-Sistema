import { afterEach, describe, expect, it, vi } from 'vitest'
import { createXrmSource, getDataverseEnvironmentLabel } from './dataverse'
import { FlowIncertoError } from './source'
import type { XrmHost } from './xrm'

function host(overrides: Partial<NonNullable<XrmHost['WebApi']>> = {}) {
  const WebApi = {
    retrieveMultipleRecords: vi.fn(async (entity: string) => {
      if (entity === 'cr40f_multas') throw new Error('Sem privilégio de leitura.')
      if (entity === 'cr40f_veiculos') return { entities: [{ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23' }] }
      return { entities: [] }
    }),
    retrieveRecord: vi.fn(async () => ({ cr40f_status: 202410001 })),
    updateRecord: vi.fn(async () => ({})),
    ...overrides,
  }
  const xrm: XrmHost = { WebApi, Navigation: { openForm: vi.fn(async () => {}) }, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org23b93544.crm2.dynamics.com/' }) } }
  return { xrm, WebApi }
}

afterEach(() => vi.unstubAllGlobals())

describe('createXrmSource', () => {
  it('identifica o ambiente pela URL', () => {
    expect(getDataverseEnvironmentLabel('https://org23b93544.crm2.dynamics.com')).toBe('DEV')
    expect(getDataverseEnvironmentLabel('https://orgf261ae8e.crm2.dynamics.com')).toBe('PROD')
    expect(getDataverseEnvironmentLabel('https://outro.crm2.dynamics.com')).toBe('Dataverse')
  })

  it('isola a falha de uma tabela e carrega as demais', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: [] }) })))
    const { xrm } = host()
    const result = await createXrmSource(xrm).load()
    expect(result.data.veiculos).toHaveLength(1)
    expect(result.data.multas).toEqual([])
    expect(result.errors).toEqual({ multas: 'Sem privilégio de leitura' })
  })

  it('lê o status atual pelo campo de status da tabela', async () => {
    const { xrm, WebApi } = host()
    expect(await createXrmSource(xrm).currentStatus('manutencao', 'm1')).toBe(202410001)
    expect(WebApi.retrieveRecord).toHaveBeenCalledWith('cr40f_manutencoes', 'm1', '?$select=cr40f_status')
  })

  it('grava com updateRecord na tabela do tipo', async () => {
    const { xrm, WebApi } = host()
    await createXrmSource(xrm).update('colisao', 'c1', { cr40f_statusoperacional: 100000001 })
    expect(WebApi.updateRecord).toHaveBeenCalledWith('cr40f_colisao_v2', 'c1', { cr40f_statusoperacional: 100000001 })
  })

  it('rejeita dateBehaviors quando a metadata falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
    const { xrm } = host()
    await expect(createXrmSource(xrm).dateBehaviors('multa')).rejects.toThrow('Metadata indisponível (403)')
  })

  describe('quando a metadata de datas falha na carga', () => {
    const retrieveMultipleRecords = async (entity: string, _options?: string) =>
      entity === 'cr40f_veiculos' ? { entities: [{ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23' }] } : { entities: [] }

    it('falha só as tabelas que dependem da metadata, com a mensagem real', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
      const { xrm } = host({ retrieveMultipleRecords: vi.fn(retrieveMultipleRecords) })
      const result = await createXrmSource(xrm).load()
      expect(result.errors.manutencoes).toContain('Metadata indisponível (403)')
      expect(result.errors.multas).toContain('Metadata indisponível (403)')
      expect(result.data.manutencoes).toEqual([])
      expect(result.data.multas).toEqual([])
      expect(result.errors.veiculos).toBeUndefined()
      expect(result.errors.infracoes).toBeUndefined()
      expect(result.errors.colisoes).toBeUndefined()
      expect(result.errors.posses).toBeUndefined()
      expect(result.data.veiculos).toHaveLength(1)
    })

    it('não guarda a rejeição em cache: a segunda carga pode dar certo', async () => {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }))
      vi.stubGlobal('fetch', fetchMock)
      const { xrm } = host({ retrieveMultipleRecords: vi.fn(retrieveMultipleRecords) })
      const source = createXrmSource(xrm)
      expect((await source.load()).errors.manutencoes).toBeDefined()
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: [] }) })))
      const second = await source.load()
      expect(second.errors.manutencoes).toBeUndefined()
      expect(second.errors.multas).toBeUndefined()
    })
  })
})

describe('runFlow', () => {
  const GUID = '3f2c1a9e-5b7d-4c8e-9a1b-0d2e4f6a8b1c'
  const FAKE_URL = 'https://flow.invalid/x?sig=SEGREDO'

  function flowHost(value: string | null = FAKE_URL) {
    const retrieveMultipleRecords = vi.fn(async (entity: string, _options?: string) => {
      if (entity === 'environmentvariablevalue') return { entities: value ? [{ value }] : [] }
      return { entities: [] }
    })
    return { ...host({ retrieveMultipleRecords }), retrieveMultipleRecords }
  }

  function stubFetch(status: number, body: unknown = {}) {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (body === undefined) throw new SyntaxError('Unexpected token')
        return body
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  async function messageOf(promise: Promise<unknown>) {
    try {
      await promise
    } catch (error) {
      return (error as Error).message
    }
    throw new Error('Era esperado que runFlow rejeitasse')
  }

  it.each([
    ['aprovarManutencao', { guids: GUID }],
    ['notificarCondutor', { guids: GUID }],
    ['gerarContrato', { GUID_MULTA: GUID }],
  ] as const)('chama o Flow %s com POST e o corpo certo', async (flow, expectedBody) => {
    const fetchMock = stubFetch(200, { message: 'ok', shareUrl: 'https://example.invalid/c.pdf' })
    const { xrm } = flowHost()
    const result = await createXrmSource(xrm).runFlow(flow, GUID)
    expect(result).toEqual({ message: 'ok', shareUrl: 'https://example.invalid/c.pdf' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(FAKE_URL)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init).not.toHaveProperty('credentials')
    expect(JSON.parse(init?.body as string)).toEqual(expectedBody)
  })

  it('lê a variável de ambiente pelo schemaname de cada Flow', async () => {
    stubFetch(200)
    const { xrm, retrieveMultipleRecords } = flowHost()
    const source = createXrmSource(xrm)
    await source.runFlow('aprovarManutencao', GUID)
    await source.runFlow('notificarCondutor', GUID)
    await source.runFlow('gerarContrato', GUID)
    const options = retrieveMultipleRecords.mock.calls.map((call) => call[1])
    expect(options[0]).toContain("schemaname eq 'new_FlowUrlManutencao'")
    expect(options[1]).toContain("schemaname eq 'new_FlowUrlNotificarMotoristaMultas'")
    expect(options[2]).toContain("schemaname eq 'new_FlowUrlGerarContratoMultas'")
  })

  it('usa o valor padrão da definição quando não há valor sobrescrito', async () => {
    const fetchMock = stubFetch(200)
    const retrieveMultipleRecords = vi.fn(async (entity: string) =>
      entity === 'environmentvariabledefinition' ? { entities: [{ defaultvalue: FAKE_URL }] } : { entities: [] })
    const { xrm } = host({ retrieveMultipleRecords })
    await createXrmSource(xrm).runFlow('notificarCondutor', GUID)
    expect(retrieveMultipleRecords.mock.calls.map((call) => call[0])).toEqual(['environmentvariablevalue', 'environmentvariabledefinition'])
    expect(fetchMock.mock.calls[0][0]).toBe(FAKE_URL)
  })

  it('guarda a URL em memória: a segunda chamada não relê a variável', async () => {
    stubFetch(200)
    const { xrm, retrieveMultipleRecords } = flowHost()
    const source = createXrmSource(xrm)
    await source.runFlow('gerarContrato', GUID)
    await source.runFlow('gerarContrato', GUID)
    expect(retrieveMultipleRecords).toHaveBeenCalledTimes(1)
  })

  it('valor sobrescrito vazio cai no valor padrão da definição', async () => {
    const fetchMock = stubFetch(200)
    const retrieveMultipleRecords = vi.fn(async (entity: string) => {
      if (entity === 'environmentvariablevalue') return { entities: [{ value: '' }] }
      if (entity === 'environmentvariabledefinition') return { entities: [{ defaultvalue: FAKE_URL }] }
      return { entities: [] }
    })
    const { xrm } = host({ retrieveMultipleRecords })
    await createXrmSource(xrm).runFlow('notificarCondutor', GUID)
    expect(fetchMock.mock.calls[0][0]).toBe(FAKE_URL)
  })

  it('prepareFlow com a variável vazia rejeita com a mensagem de configuração e não chama o Flow', async () => {
    const fetchMock = stubFetch(200)
    const { xrm } = flowHost(null)
    const message = await messageOf(createXrmSource(xrm).prepareFlow('gerarContrato'))
    expect(message).toBe('URL do Flow "Gerar contrato" não configurada (variável new_FlowUrlGerarContratoMultas)')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prepareFlow resolve sem chamar o Flow e runFlow depois não relê a variável', async () => {
    const fetchMock = stubFetch(200)
    const { xrm, retrieveMultipleRecords } = flowHost()
    const source = createXrmSource(xrm)
    await source.prepareFlow('aprovarManutencao')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(retrieveMultipleRecords).toHaveBeenCalledTimes(1)
    await source.runFlow('aprovarManutencao', GUID)
    expect(retrieveMultipleRecords).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('prepareFlow não devolve a URL', async () => {
    stubFetch(200)
    const { xrm } = flowHost()
    expect(await createXrmSource(xrm).prepareFlow('aprovarManutencao')).toBeUndefined()
  })

  it('devolve nulos quando o corpo não é JSON', async () => {
    stubFetch(200, undefined)
    const { xrm } = flowHost()
    expect(await createXrmSource(xrm).runFlow('aprovarManutencao', GUID)).toEqual({ message: null, shareUrl: null })
  })

  it('recusa identificador que não é GUID sem chamar nada', async () => {
    const fetchMock = stubFetch(200)
    const { xrm, retrieveMultipleRecords } = flowHost()
    const message = await messageOf(createXrmSource(xrm).runFlow('aprovarManutencao', "x'; drop"))
    expect(message).toBe('Identificador inválido')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(retrieveMultipleRecords).not.toHaveBeenCalled()
  })

  it('falha com mensagem clara quando a variável está vazia', async () => {
    const fetchMock = stubFetch(200)
    const { xrm } = flowHost(null)
    const message = await messageOf(createXrmSource(xrm).runFlow('gerarContrato', GUID))
    expect(message).toBe('URL do Flow "Gerar contrato" não configurada (variável new_FlowUrlGerarContratoMultas)')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('notificarCondutor com 400 e noDriver informa que a multa não tem motorista', async () => {
    stubFetch(400, { noDriver: 1 })
    const { xrm } = flowHost()
    const message = await messageOf(createXrmSource(xrm).runFlow('notificarCondutor', GUID))
    expect(message).toBe('A multa não tem motorista. Nada foi enviado')
    expect(message).not.toContain('SEGREDO')
  })

  it('notificarCondutor com 207 e noDriver informa que a multa não tem motorista', async () => {
    stubFetch(207, { noDriver: 2 })
    const { xrm } = flowHost()
    expect(await messageOf(createXrmSource(xrm).runFlow('notificarCondutor', GUID))).toBe('A multa não tem motorista. Nada foi enviado')
  })

  it('207 sem noDriver é erro de status, não sucesso', async () => {
    stubFetch(207, {})
    const { xrm } = flowHost()
    expect(await messageOf(createXrmSource(xrm).runFlow('notificarCondutor', GUID))).toBe('O Flow "Notificar condutor" respondeu 207. Confira o registro antes de tentar de novo')
  })

  it('status 500 vira erro sem a URL', async () => {
    stubFetch(500, {})
    const { xrm } = flowHost()
    const message = await messageOf(createXrmSource(xrm).runFlow('aprovarManutencao', GUID))
    expect(message).toBe('O Flow "Agendar manutenção" respondeu 500. Confira o registro antes de tentar de novo')
    expect(message).not.toContain('SEGREDO')
  })

  it('status 500 não é resultado incerto', async () => {
    stubFetch(500, {})
    const { xrm } = flowHost()
    const error = await createXrmSource(xrm).runFlow('aprovarManutencao', GUID).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(FlowIncertoError)
  })

  it('falha de rede vira erro incerto sem a URL, mesmo que o erro original a contenha', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { throw new TypeError(`Failed to fetch ${url}`) }))
    const { xrm } = flowHost()
    const error = await createXrmSource(xrm).runFlow('gerarContrato', GUID).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(FlowIncertoError)
    const message = (error as Error).message
    expect(message).toBe('Não foi possível chamar o Flow "Gerar contrato" (rede ou bloqueio do navegador)')
    expect(message).not.toContain('SEGREDO')
  })

  it('estoura o tempo do Flow e aborta a chamada', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<never>((_resolve, reject) => {
        signal = init?.signal ?? undefined
        signal?.addEventListener('abort', () => reject(new DOMException(`Aborted ${_url}`, 'AbortError')))
      }))
      vi.stubGlobal('fetch', fetchMock)
      const { xrm } = flowHost()
      const pending = createXrmSource(xrm).runFlow('aprovarManutencao', GUID).catch((reason: unknown) => reason)
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(59_999)
      expect(signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      const error = await pending
      expect(error).toBeInstanceOf(FlowIncertoError)
      const message = (error as Error).message
      expect(signal?.aborted).toBe(true)
      expect(message).toBe('O Flow "Agendar manutenção" não respondeu em 60 s. Confira o registro antes de tentar de novo')
      expect(message).not.toContain('SEGREDO')
    } finally {
      vi.useRealTimers()
    }
  })
})
