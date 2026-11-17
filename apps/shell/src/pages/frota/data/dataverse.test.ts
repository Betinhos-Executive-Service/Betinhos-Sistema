import { afterEach, describe, expect, it, vi } from 'vitest'
import { createXrmSource, getDataverseEnvironmentLabel } from './dataverse'
import { FlowIncertoError } from './source'
import type { XrmHost } from './xrm'

function host(overrides: Partial<NonNullable<XrmHost['WebApi']>> = {}) {
  const WebApi = {
    retrieveMultipleRecords: vi.fn(async (entity: string) => {
      if (entity === 'cr40f_multas') throw new Error('Sem privilégio de leitura.')
      if (entity === 'cr40f_veiculos') return { entities: [{ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23' }] }
      if (entity === 'cr40f_categoriadespesaoperacional') return { entities: [{ cr40f_categoriadespesaoperacionalid: 'CA', cr40f_nome: 'Abastecimento' }] }
      return { entities: [] }
    }),
    retrieveRecord: vi.fn(async () => ({ cr40f_status: 202410001 })),
    updateRecord: vi.fn(async () => ({})),
    createRecord: vi.fn(async () => ({ id: 'novo' })),
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

  it('resumo dos termos: só termos com multa; falha marca a coluna Termo como indisponível sem derrubar as multas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: [] }) })))
    const multas = { entities: [{ cr40f_multasid: 'U1', cr40f_novacoluna: 'AIT 1' }] }
    const ok = vi.fn(async (entity: string, _options?: string) => {
      if (entity === 'cr40f_multas') return multas
      if (entity === 'new_termomulta') return { entities: [{ _new_multa_value: 'U1', new_status: 100000000, new_enviadoem: '2026-10-20T13:00:00Z' }] }
      return { entities: [] }
    })
    const bom = await createXrmSource(host({ retrieveMultipleRecords: ok }).xrm).load()
    expect(ok.mock.calls.find((c) => c[0] === 'new_termomulta')?.[1]).toContain('_new_multa_value ne null')
    expect(bom.data.multas[0].termo).toEqual({ status: 'pendente', enviadoEm: '2026-10-20T13:00:00Z' })
    const falha = vi.fn(async (entity: string) => {
      if (entity === 'cr40f_multas') return multas
      if (entity === 'new_termomulta') throw new Error('Sem privilégio')
      return { entities: [] }
    })
    const ruim = await createXrmSource(host({ retrieveMultipleRecords: falha }).xrm).load()
    expect(ruim.data.multas).toHaveLength(1)
    expect(ruim.data.multas[0].termo).toBeUndefined()
  })

  it('sem as colunas de hodômetro, carrega os veículos de novo sem elas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: [] }) })))
    let tentativas = 0
    const retrieveMultipleRecords = vi.fn(async (entity: string, _options?: string) => {
      if (entity === 'cr40f_veiculos') {
        tentativas += 1
        if (tentativas === 1) throw new Error("Could not find a property named 'cr40f_hodometro' on type 'Microsoft.Dynamics.CRM.cr40f_veiculos'.")
        return { entities: [{ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23' }] }
      }
      if (entity === 'cr40f_categoriadespesaoperacional') return { entities: [{ cr40f_categoriadespesaoperacionalid: 'CA', cr40f_nome: 'Abastecimento' }] }
      return { entities: [] }
    })
    const { xrm } = host({ retrieveMultipleRecords })
    const result = await createXrmSource(xrm).load()
    const chamadas = retrieveMultipleRecords.mock.calls.filter((call) => call[0] === 'cr40f_veiculos')
    expect(chamadas).toHaveLength(2)
    expect(chamadas[0][1]).toContain('cr40f_hodometro')
    expect(chamadas[1][1]).not.toContain('cr40f_hodometro')
    expect(result.errors.veiculos).toBeUndefined()
    expect(result.data.veiculos).toEqual([expect.objectContaining({ id: 'v1', placa: 'ABC1D23', hodometro: null, hodometroEm: null })])
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

describe('plano preventivo, baselines, despesas e telemetria', () => {
  const okFetch = () => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: [] }) })))

  it('carrega o plano com inativos e isola a falha da telemetria', async () => {
    okFetch()
    const retrieveMultipleRecords = vi.fn(async (entity: string, _options?: string) => {
      if (entity === 'new_telemetriadiariainfleet') throw new Error('Sem privilégio na telemetria.')
      if (entity === 'cr40f_categoriadespesaoperacional') return { entities: [{ cr40f_categoriadespesaoperacionalid: 'CA', cr40f_nome: 'Abastecimento' }] }
      if (entity === 'cr40f_itemplanopreventivo') return { entities: [
        { cr40f_itemplanopreventivoid: 'I1', cr40f_name: 'Troca de óleo', cr40f_servico: 100000000, cr40f_intervalokm: 10000, statecode: 0 },
        { cr40f_itemplanopreventivoid: 'I2', cr40f_name: 'Antigo', statecode: 1 },
      ] }
      return { entities: [] }
    })
    const { xrm } = host({ retrieveMultipleRecords })
    const result = await createXrmSource(xrm).load()
    expect(result.data.planoPreventivo.map((item) => [item.id, item.ativo])).toEqual([['i1', true], ['i2', false]])
    const planoOptions = retrieveMultipleRecords.mock.calls.find((call) => call[0] === 'cr40f_itemplanopreventivo')?.[1]
    expect(planoOptions).toContain('$filter=statecode eq 0 or statecode eq 1')
    expect(planoOptions).toContain('$orderby=cr40f_name asc')
    expect(result.errors).toEqual({ telemetriaKm: 'Sem privilégio na telemetria' })
    expect(result.data.telemetriaKm).toEqual([])
    const telemetriaOptions = retrieveMultipleRecords.mock.calls.find((call) => call[0] === 'new_telemetriadiariainfleet')?.[1]
    expect(telemetriaOptions).toMatch(/\$filter=new_data ge \d{4}-\d{2}-\d{2}&\$orderby=new_data desc$/)
    expect(telemetriaOptions).not.toContain('statecode')
  })

  it('consulta as categorias antes das despesas e filtra pelos dois ids', async () => {
    okFetch()
    const retrieveMultipleRecords = vi.fn(async (entity: string, _options?: string) => {
      if (entity === 'cr40f_categoriadespesaoperacional') return { entities: [
        { cr40f_categoriadespesaoperacionalid: '{AAA}', cr40f_nome: 'Abastecimento' },
        { cr40f_categoriadespesaoperacionalid: 'BBB', cr40f_nome: 'Manutenção' },
      ] }
      if (entity === 'cr40f_despesaoperacional') return { entities: [
        { cr40f_despesaoperacionalid: 'D1', cr40f_datagasto: '2026-09-01T12:00:00Z', cr40f_valor: 300, _cr40f_veiculo_value: 'V1', _cr40f_categoria_value: 'AAA' },
        { cr40f_despesaoperacionalid: 'D2', cr40f_datagasto: '2026-09-02T12:00:00Z', cr40f_valor: 90, _cr40f_veiculo_value: 'V1', _cr40f_categoria_value: 'bbb' },
      ] }
      return { entities: [] }
    })
    const { xrm } = host({ retrieveMultipleRecords })
    const result = await createXrmSource(xrm).load()
    const entities = retrieveMultipleRecords.mock.calls.map((call) => call[0])
    expect(entities.indexOf('cr40f_categoriadespesaoperacional')).toBeLessThan(entities.indexOf('cr40f_despesaoperacional'))
    const categoriaOptions = retrieveMultipleRecords.mock.calls.find((call) => call[0] === 'cr40f_categoriadespesaoperacional')?.[1]
    expect(categoriaOptions).toBe("?$select=cr40f_categoriadespesaoperacionalid,cr40f_nome&$filter=cr40f_nome eq 'Abastecimento' or cr40f_nome eq 'Manutenção'")
    const despesaOptions = retrieveMultipleRecords.mock.calls.find((call) => call[0] === 'cr40f_despesaoperacional')?.[1]
    expect(despesaOptions).toMatch(/\$filter=statecode eq 0 and cr40f_datagasto ge \d{4}-\d{2}-\d{2}T00:00:00Z and \(_cr40f_categoria_value eq aaa or _cr40f_categoria_value eq bbb\)&\$orderby=cr40f_datagasto desc$/)
    expect(result.data.despesasCombustivel.map((d) => [d.id, d.categoria])).toEqual([['d1', 'combustivel'], ['d2', 'manutencao']])
    expect(result.errors.despesasCombustivel).toBeUndefined()
  })

  it('sem a categoria Abastecimento, as despesas falham com mensagem clara', async () => {
    okFetch()
    const retrieveMultipleRecords = vi.fn(async (entity: string, _options?: string) =>
      entity === 'cr40f_categoriadespesaoperacional' ? { entities: [{ cr40f_categoriadespesaoperacionalid: 'BBB', cr40f_nome: 'Manutenção' }] } : { entities: [] })
    const { xrm } = host({ retrieveMultipleRecords })
    const result = await createXrmSource(xrm).load()
    expect(result.errors.despesasCombustivel).toBe('Categoria "Abastecimento" não encontrada nas despesas')
    expect(retrieveMultipleRecords.mock.calls.some((call) => call[0] === 'cr40f_despesaoperacional')).toBe(false)
  })

  it('salvarBaseline cria quando não existe, com nome e binds', async () => {
    const retrieveMultipleRecords = vi.fn(async (_entity: string, _options?: string) => ({ entities: [] }))
    const retrieveRecord = vi.fn(async (entity: string, _id?: string, _options?: string) => (entity === 'cr40f_veiculos' ? { cr40f_placa: 'ABC1D23' } : { cr40f_name: 'Troca de óleo' }))
    const { xrm, WebApi } = host({ retrieveMultipleRecords, retrieveRecord })
    await createXrmSource(xrm).salvarBaseline('{V1}', 'I1', 160000, '2026-05-10')
    expect(retrieveMultipleRecords).toHaveBeenCalledWith('cr40f_baselinepreventiva', '?$select=cr40f_baselinepreventivaid&$filter=_cr40f_veiculo_value eq v1 and _cr40f_item_value eq i1')
    expect(retrieveRecord).toHaveBeenCalledWith('cr40f_veiculos', 'v1', '?$select=cr40f_placa')
    expect(retrieveRecord).toHaveBeenCalledWith('cr40f_itemplanopreventivo', 'i1', '?$select=cr40f_name')
    expect(WebApi.createRecord).toHaveBeenCalledWith('cr40f_baselinepreventiva', {
      cr40f_name: 'ABC1D23 · Troca de óleo',
      'cr40f_Veiculo@odata.bind': '/cr40f_veiculoses(v1)',
      'cr40f_Item@odata.bind': '/cr40f_itemplanopreventivos(i1)',
      cr40f_km: 160000,
      cr40f_data: '2026-05-10',
    })
    expect(WebApi.updateRecord).not.toHaveBeenCalled()
  })

  it('salvarBaseline atualiza quando já existe', async () => {
    const retrieveMultipleRecords = vi.fn(async (_entity: string, _options?: string) => ({ entities: [{ cr40f_baselinepreventivaid: '{B1}' }] }))
    const { xrm, WebApi } = host({ retrieveMultipleRecords })
    await createXrmSource(xrm).salvarBaseline('v1', 'i1', null, '2026-05-10')
    expect(WebApi.updateRecord).toHaveBeenCalledWith('cr40f_baselinepreventiva', 'b1', { cr40f_km: null, cr40f_data: '2026-05-10' })
    expect(WebApi.createRecord).not.toHaveBeenCalled()
  })

  it('salvarItemPlano cria sem id e atualiza com id', async () => {
    const { xrm, WebApi } = host()
    const source = createXrmSource(xrm)
    const input = { nome: 'Troca de óleo', servico: 100000000, intervaloKm: 10000, intervaloMeses: 6, avisoKm: 1000, avisoDias: 30 }
    const patch = { cr40f_name: 'Troca de óleo', cr40f_servico: 100000000, cr40f_intervalokm: 10000, cr40f_intervalomeses: 6, cr40f_avisokm: 1000, cr40f_avisodias: 30 }
    await source.salvarItemPlano(input)
    expect(WebApi.createRecord).toHaveBeenCalledWith('cr40f_itemplanopreventivo', patch)
    await source.salvarItemPlano(input, '{I1}')
    expect(WebApi.updateRecord).toHaveBeenCalledWith('cr40f_itemplanopreventivo', 'i1', patch)
  })

  it('inativarItemPlano manda statecode 1 / statuscode 2 e reativa com 0 / 1', async () => {
    const { xrm, WebApi } = host()
    const source = createXrmSource(xrm)
    await source.inativarItemPlano('{I1}', false)
    expect(WebApi.updateRecord).toHaveBeenCalledWith('cr40f_itemplanopreventivo', 'i1', { statecode: 1, statuscode: 2 })
    await source.inativarItemPlano('i1', true)
    expect(WebApi.updateRecord).toHaveBeenLastCalledWith('cr40f_itemplanopreventivo', 'i1', { statecode: 0, statuscode: 1 })
  })
})

describe('termo de multa (Custom APIs)', () => {
  const MULTA_ID = '{AAAAAAAA-1111-2222-3333-444444444444}'
  const TERMO_ID = '{BBBBBBBB-1111-2222-3333-444444444444}'
  const resposta = (ok: boolean, status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => ({ ok, status, json: async () => body }))
  const corpo = (fetchMock: ReturnType<typeof resposta>) => JSON.parse(String(fetchMock.mock.calls[0][1]?.body))

  it('enviarTermoMulta: folha manda 100000001, Guid limpo e competência em DateTime', async () => {
    const fetchMock = resposta(true, 200, { new_TermoId: '{CCCCCCCC-1111-2222-3333-444444444444}' })
    vi.stubGlobal('fetch', fetchMock)
    const id = await createXrmSource(host().xrm).enviarTermoMulta(MULTA_ID, { forma: 'folha', parcelas: 3, valorTotal: 300.01, primeiraCompetencia: '2026-11-01' })
    expect(id).toBe('cccccccc-1111-2222-3333-444444444444')
    expect(fetchMock.mock.calls[0][0]).toBe('https://org23b93544.crm2.dynamics.com/api/data/v9.2/new_EnviarTermoMulta')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(corpo(fetchMock)).toEqual({ new_MultaId: 'aaaaaaaa-1111-2222-3333-444444444444', new_FormaPagamento: 100000001, new_Parcelas: 3, new_ValorTotal: 300.01, new_PrimeiraCompetencia: '2026-11-01T00:00:00Z' })
  })

  it('enviarTermoMulta: guia manda 100000000', async () => {
    const fetchMock = resposta(true, 200, { new_TermoId: 'cccccccc-1111-2222-3333-444444444444' })
    vi.stubGlobal('fetch', fetchMock)
    await createXrmSource(host().xrm).enviarTermoMulta(MULTA_ID, { forma: 'guia', parcelas: 1, valorTotal: 130.16, primeiraCompetencia: '2026-10-01' })
    expect(corpo(fetchMock).new_FormaPagamento).toBe(100000000)
  })

  it('enviarTermoMulta: repassa error.message do servidor', async () => {
    vi.stubGlobal('fetch', resposta(false, 400, { error: { message: 'Motorista sem aditivo.' } }))
    await expect(createXrmSource(host().xrm).enviarTermoMulta(MULTA_ID, { forma: 'guia', parcelas: 1, valorTotal: 10, primeiraCompetencia: '2026-10-01' })).rejects.toThrow('Motorista sem aditivo.')
  })

  it('enviarTermoMulta: sem new_TermoId na resposta é erro', async () => {
    vi.stubGlobal('fetch', resposta(true, 200, {}))
    await expect(createXrmSource(host().xrm).enviarTermoMulta(MULTA_ID, { forma: 'guia', parcelas: 1, valorTotal: 10, primeiraCompetencia: '2026-10-01' })).rejects.toThrow(/não devolveu o termo/)
  })

  it('cancelarTermoMulta: POST em new_CancelarTermoMulta com Guid limpo, sem PATCH', async () => {
    const fetchMock = resposta(true, 204, {})
    vi.stubGlobal('fetch', fetchMock)
    const { xrm, WebApi } = host()
    await createXrmSource(xrm).cancelarTermoMulta(TERMO_ID)
    expect(fetchMock.mock.calls[0][0]).toBe('https://org23b93544.crm2.dynamics.com/api/data/v9.2/new_CancelarTermoMulta')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(corpo(fetchMock)).toEqual({ new_TermoId: 'bbbbbbbb-1111-2222-3333-444444444444' })
    expect(WebApi.updateRecord).not.toHaveBeenCalled()
  })

  it('cancelarTermoMulta: repassa error.message do servidor', async () => {
    vi.stubGlobal('fetch', resposta(false, 400, { error: { message: 'Termo já assinado.' } }))
    await expect(createXrmSource(host().xrm).cancelarTermoMulta(TERMO_ID)).rejects.toThrow('Termo já assinado.')
  })

  it('temAditivo exige a data e o arquivo do aditivo', async () => {
    const F = 'cccccccc-1111-2222-3333-444444444444'
    const casos: [Record<string, unknown>, boolean][] = [
      [{ new_aditivoassinaturaem: '2026-10-15', new_aditivoassinatura_name: 'aditivo.pdf' }, true],
      [{ new_aditivoassinaturaem: '2026-10-15', new_aditivoassinatura_name: null }, false],
      [{ new_aditivoassinaturaem: null, new_aditivoassinatura_name: 'aditivo.pdf' }, false],
    ]
    for (const [row, esperado] of casos) {
      const retrieveRecord = vi.fn(async () => row)
      await expect(createXrmSource(host({ retrieveRecord }).xrm).temAditivo(F)).resolves.toBe(esperado)
      expect(retrieveRecord).toHaveBeenCalledWith('cr40f_funcionarios', F, '?$select=new_aditivoassinaturaem,new_aditivoassinatura_name')
    }
  })

  it('temAditivo valida o GUID', async () => {
    await expect(createXrmSource(host().xrm).temAditivo('x')).rejects.toThrow('Identificador inválido')
  })
})

describe('passo a passo da multa (Custom APIs)', () => {
  const MULTA_ID = '{AAAAAAAA-1111-2222-3333-444444444444}'
  const resposta = (ok: boolean, status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => ({ ok, status, json: async () => body }))

  it('passoMulta chama cr40f_PassoMulta com MultaId limpo, Passo e DadosJson e devolve a situação', async () => {
    const situacao = { etapa: 'indicar', pendentes: ['RegistrarIndicacao'], proximoPasso: 'Indicar no órgão', proximoPrazo: '2026-11-30', prazoVencido: false, aguardandoPenalidade: false }
    const fetchMock = resposta(true, 200, { MultaJson: JSON.stringify(situacao) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await createXrmSource(host().xrm).passoMulta(MULTA_ID, 'AvisarMotorista', {})).toEqual(situacao)
    expect(fetchMock.mock.calls[0][0]).toBe('https://org23b93544.crm2.dynamics.com/api/data/v9.2/cr40f_PassoMulta')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ MultaId: 'aaaaaaaa-1111-2222-3333-444444444444', Passo: 'AvisarMotorista', DadosJson: '{}' })
  })

  it('passoMulta repassa a recusa do servidor como está', async () => {
    vi.stubGlobal('fetch', resposta(false, 400, { error: { message: 'Avise o motorista antes de registrar a indicação.' } }))
    await expect(createXrmSource(host().xrm).passoMulta(MULTA_ID, 'RegistrarIndicacao', { canal: 'dsv', data: '2026-11-15' })).rejects.toThrow('Avise o motorista antes de registrar a indicação.')
  })

  it('a recusa do servidor chega com o status HTTP para a tela decidir o que mostrar', async () => {
    vi.stubGlobal('fetch', resposta(false, 400, { error: { message: 'Recusa de regra.' } }))
    await expect(createXrmSource(host().xrm).passoMulta(MULTA_ID, 'AvisarMotorista', {})).rejects.toMatchObject({ name: 'ApiError', status: 400, message: 'Recusa de regra.' })
    vi.stubGlobal('fetch', resposta(false, 500, { error: { message: 'Unhandled exception' } }))
    await expect(createXrmSource(host().xrm).dossieMulta(MULTA_ID)).rejects.toMatchObject({ name: 'ApiError', status: 500 })
  })

  it('dossieMulta lê o new_DossieJson', async () => {
    const dossie = { multa: { id: 'x', auto: 'AIT 1', placa: 'TST1A11', dataHora: null, local: null, orgao: null, dataParaIndicar: null, infracao: null }, servicos: [], infleet: { erro: 'Sem token' } }
    const fetchMock = resposta(true, 200, { new_DossieJson: JSON.stringify(dossie) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await createXrmSource(host().xrm).dossieMulta(MULTA_ID)).toEqual(dossie)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ new_MultaId: 'aaaaaaaa-1111-2222-3333-444444444444' })
  })

  it('enviarArquivoMulta faz PATCH binário na coluna de arquivo com o nome sem acento', async () => {
    const fetchMock = resposta(true, 204, {})
    vi.stubGlobal('fetch', fetchMock)
    await createXrmSource(host().xrm).enviarArquivoMulta(MULTA_ID, 'cr40f_comprovantepagamento', new File(['x'], 'comprovante pagamento março.pdf', { type: 'application/pdf' }))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://org23b93544.crm2.dynamics.com/api/data/v9.2/cr40f_multases(aaaaaaaa-1111-2222-3333-444444444444)/cr40f_comprovantepagamento')
    expect(init?.method).toBe('PATCH')
    expect((init?.headers as Record<string, string>)['x-ms-file-name']).toBe('comprovante pagamento marco.pdf')
  })

  it('urlArquivoMulta aponta para o /$value da coluna de arquivo e recusa id inválido', () => {
    const source = createXrmSource(host().xrm)
    expect(source.urlArquivoMulta(MULTA_ID, 'cr40f_autodainfracao')).toBe('https://org23b93544.crm2.dynamics.com/api/data/v9.2/cr40f_multases(aaaaaaaa-1111-2222-3333-444444444444)/cr40f_autodainfracao/$value')
    expect(() => source.urlArquivoMulta('nao-e-guid', 'cr40f_pdfpenalidade')).toThrow('Identificador inválido')
  })
})
