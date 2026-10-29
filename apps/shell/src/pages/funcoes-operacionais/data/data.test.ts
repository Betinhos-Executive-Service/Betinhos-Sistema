// Portado de tela-funcoes-operacionais/tests/api-swap.test.ts e da parte de API de window-mode.test.ts: agora contra um
// DataverseClient falso, conferindo caminhos e corpos exatos (Custom APIs, duplicação, motorista, local, consultas).
import { describe, expect, test, vi } from 'vitest'
import type { DataverseClient, Row } from '@betinhos/dataverse'
import type { ScheduleSwapInput, VehiclePreview } from '../domain/types'
import { createDataverseSource, getAllPaged } from './dataverse'
import { buildSeedDb, createMockSource } from './mock'

const exchangeId = '11111111-1111-1111-1111-111111111111'

type Call = { path: string; method: string; body?: Row }

function fakeClient(responses: Record<string, unknown> = {}, fail?: Error) {
  const calls: Call[] = []
  const creates: { entitySet: string; data: Row }[] = []
  const updates: { entitySet: string; id: string; data: Row }[] = []
  let createSeq = 0
  const client: DataverseClient = {
    apiUrl: 'https://org.example/api/data/v9.2',
    request: vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (fail) throw fail
      const key = Object.keys(responses).find((prefix) => path.startsWith(prefix))
      return (key ? responses[key] : { value: [] }) as never
    }) as DataverseClient['request'],
    getAll: vi.fn(async () => []),
    create: vi.fn(async (entitySet: string, data: Row) => { creates.push({ entitySet, data }); createSeq += 1; return `0000000${createSeq}-0000-0000-0000-000000000000` }),
    update: vi.fn(async (entitySet: string, id: string, data: Row) => { updates.push({ entitySet, id, data }) }),
    remove: vi.fn(async () => undefined),
  }
  return { client, calls, creates, updates }
}

function preview(overrides: Partial<VehiclePreview> = {}): VehiclePreview {
  return {
    start: new Date('2026-08-03T12:00:00.000Z'),
    end: new Date('2026-08-03T12:30:00.000Z'),
    typeValue: 100000000,
    typeLabel: 'Troca',
    executionMode: 'now',
    programAutomatically: true,
    actualAt: null,
    driver1Id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    driver1Label: 'Ana',
    driver2Id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    driver2Label: 'Bruno',
    vehicle1Id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    vehicle1Label: 'ABC1D23',
    vehicle2Id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    vehicle2Label: 'XYZ9A87',
    locationId: '',
    locationLabel: '',
    obs: 'Encontro na base',
    summary: 'Troca operacional',
    ...overrides,
  }
}

const schedule = (data: VehiclePreview, extra: Partial<ScheduleSwapInput> = {}): ScheduleSwapInput => ({
  preview: data, start: data.start, end: data.end, typeValue: data.typeValue, obs: data.obs, summary: data.summary,
  programAutomatically: true, effectiveAt: null, ...extra,
})

describe('new_RegistrarTrocaDeCarro', () => {
  test('agendar faz um único POST na Custom API, sem gravar posse nem Geral no cliente', async () => {
    const { client, calls, creates, updates } = fakeClient({ new_RegistrarTrocaDeCarro: { new_TrocaId: exchangeId } })
    const id = await createDataverseSource(client).scheduleSwap(schedule(preview()))
    expect(id).toBe(exchangeId)
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('new_RegistrarTrocaDeCarro')
    expect(calls[0].method).toBe('POST')
    const body = calls[0].body!
    expect(body).toEqual({
      new_Motivo: 'Encontro na base',
      new_Inicio: '2026-08-03T12:00:00.000Z',
      new_Fim: '2026-08-03T12:30:00.000Z',
      new_Tipo: 100000000,
      new_Motorista1: { '@odata.type': 'Microsoft.Dynamics.CRM.cr40f_funcionarios', cr40f_funcionariosid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      new_Motorista2: { '@odata.type': 'Microsoft.Dynamics.CRM.cr40f_funcionarios', cr40f_funcionariosid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
      new_Veiculo1: { '@odata.type': 'Microsoft.Dynamics.CRM.cr40f_veiculos', cr40f_veiculosid: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
      new_Veiculo2: { '@odata.type': 'Microsoft.Dynamics.CRM.cr40f_veiculos', cr40f_veiculosid: 'dddddddd-dddd-dddd-dddd-dddddddddddd' },
      new_Observacao: 'Encontro na base',
      new_ConcluirImediatamente: false,
      new_ProgramarAutomaticamente: true,
      new_IdempotencyKey: expect.stringMatching(/^exchange-[0-9a-f]{1,8}-[0-9a-z]+$/),
      new_ModoJanela: 100000000,
    })
    expect(String(body.new_IdempotencyKey).endsWith(`-${new Date('2026-08-03T12:00:00.000Z').getTime().toString(36)}`)).toBe(true)
    expect(creates).toEqual([])
    expect(updates).toEqual([])
  })

  test('a mesma troca gera a mesma chave de idempotência; outra observação gera outra', async () => {
    const { client, calls } = fakeClient()
    const source = createDataverseSource(client)
    await source.scheduleSwap(schedule(preview()))
    await source.scheduleSwap(schedule(preview()))
    await source.scheduleSwap(schedule(preview({ obs: 'Outra' })))
    expect(calls[0].body!.new_IdempotencyKey).toBe(calls[1].body!.new_IdempotencyKey)
    expect(calls[2].body!.new_IdempotencyKey).not.toBe(calls[0].body!.new_IdempotencyKey)
    // Sem new_TrocaId na resposta, a tela fica com a chave.
    expect(await source.scheduleSwap(schedule(preview()))).toBe(calls[0].body!.new_IdempotencyKey)
  })

  test('omite parâmetros opcionais vazios e usa o motivo padrão sem observação', async () => {
    const { client, calls } = fakeClient()
    await createDataverseSource(client).scheduleSwap(schedule(preview({ driver2Id: '', vehicle2Id: '', obs: '  ' })))
    const body = calls[0].body!
    expect(body).not.toHaveProperty('new_DataEfetiva')
    expect(body).not.toHaveProperty('new_Motorista2')
    expect(body).not.toHaveProperty('new_Veiculo2')
    expect(body).not.toHaveProperty('new_LocalDeBase')
    expect(body.new_Motivo).toBe('Registro operacional da troca.')
  })

  test('devolução à base envia o local da base', async () => {
    const { client, calls } = fakeClient()
    await createDataverseSource(client).scheduleSwap(schedule(preview({ typeValue: 100000001, driver2Id: '', vehicle2Id: '', locationId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', locationLabel: 'Escritório' })))
    expect(calls[0].body!.new_Tipo).toBe(100000001)
    expect(calls[0].body!.new_LocalDeBase).toEqual({ '@odata.type': 'Microsoft.Dynamics.CRM.new_localdebase', new_localdebaseid: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' })
  })

  test('sem programação automática a troca nasce Confirmada (flag falsa)', async () => {
    const { client, calls } = fakeClient()
    await createDataverseSource(client).scheduleSwap(schedule(preview(), { programAutomatically: false }))
    expect(calls[0].body!.new_ProgramarAutomaticamente).toBe(false)
  })

  test('troca já feita conclui na hora com a data efetiva real', async () => {
    const effectiveAt = new Date('2026-08-03T11:47:00.000Z')
    const { client, calls, creates } = fakeClient()
    await createDataverseSource(client).scheduleSwap(schedule(preview(), { effectiveAt }))
    expect(calls).toHaveLength(1)
    expect(calls[0].body!.new_Motivo).toBe('Encontro na base')
    expect(calls[0].body!.new_DataEfetiva).toBe(effectiveAt.toISOString())
    expect(calls[0].body!.new_ConcluirImediatamente).toBe(true)
    expect(creates).toEqual([])
  })

  test('falha do servidor vira "Falha ao registrar a troca no Dataverse" sem nada criado no cliente', async () => {
    const { client, calls, creates } = fakeClient({}, new Error('[POSSESSION_CHAIN_GAP] Posse divergente'))
    await expect(createDataverseSource(client).scheduleSwap(schedule(preview(), { effectiveAt: new Date('2026-08-03T11:47:00.000Z') })))
      .rejects.toThrow('Falha ao registrar a troca no Dataverse: [POSSESSION_CHAIN_GAP] Posse divergente')
    expect(calls).toHaveLength(1)
    expect(creates).toEqual([])
  })

  test('modo Entre serviços envia âncoras e local; horário marcado não envia âncoras', async () => {
    const { client, calls } = fakeClient()
    const source = createDataverseSource(client)
    const between = preview({ windowMode: 'between', driver1AfterId: '{eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee}', driver1BeforeId: '', location: ' Base ' })
    await source.scheduleSwap(schedule(between, { obs: '' }))
    expect(calls[0].body!.new_ModoJanela).toBe(100000001)
    expect(calls[0].body!.new_M1DepoisDe).toEqual({ '@odata.type': 'Microsoft.Dynamics.CRM.cr40f_reservadeveculos', cr40f_reservadeveculosid: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' })
    expect(calls[0].body!).not.toHaveProperty('new_M1AntesDe')
    expect(calls[0].body!.new_Local).toBe('Base')
    await source.scheduleSwap(schedule(preview({ windowMode: 'fixed', driver1AfterId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', location: '' })))
    expect(calls[1].body!.new_ModoJanela).toBe(100000000)
    expect(calls[1].body!).not.toHaveProperty('new_M1DepoisDe')
    expect(calls[1].body!).not.toHaveProperty('new_Local')
  })
})

describe('edição, cancelamento e reversão', () => {
  test('carrega a troca com etag e atualiza pela Custom API bound sem mudar tipo, motoristas ou veículos', async () => {
    const { client, calls, updates } = fakeClient({
      [`cr40f_trocasdecarros(${exchangeId})?`]: {
        cr40f_trocasdecarroid: exchangeId,
        cr40f_iniciodajaneladetroca: '2026-08-04T12:00:00.000Z',
        cr40f_fimdajaneladetroca: '2026-08-04T12:30:00.000Z',
        cr40f_statusdatroca: 202410000,
        '@odata.etag': 'W/"77"',
        new_tipodetroca: 100000000,
        cr40f_observacao: 'Antes',
      },
    })
    const source = createDataverseSource(client)
    const loaded = await source.loadSwap(`{${exchangeId}}`)
    expect(calls[0]).toMatchObject({ method: 'GET' })
    expect(calls[0].path).toBe(`cr40f_trocasdecarros(${exchangeId})?$select=cr40f_trocasdecarroid,cr40f_iniciodajaneladetroca,cr40f_fimdajaneladetroca,cr40f_statusdatroca,new_tipodetroca,cr40f_observacao,_cr40f_motorista1_value,_cr40f_motorista2_value,_cr40f_veiculo1antesdatroca_value,_cr40f_veiculo2antesdatroca_value,_new_localdebase_value,new_mododajanela,new_localdatroca,new_alertajanela,_new_m1depoisde_value,_new_m1antesde_value,_new_m2depoisde_value,_new_m2antesde_value`)
    expect(loaded.rowVersion).toBe('77')
    expect(loaded.statusLabel).toBe('Programada')

    await source.updateSwap({ id: loaded.id, rowVersion: loaded.rowVersion || '', start: new Date('2026-08-04T13:00:00.000Z'), end: new Date('2026-08-04T13:30:00.000Z'), obs: 'Depois' })
    expect(calls[1].path).toBe(`cr40f_trocasdecarros(${exchangeId})/Microsoft.Dynamics.CRM.new_AtualizarTrocaDeCarro`)
    expect(calls[1].method).toBe('POST')
    expect(calls[1].body).toEqual({
      new_Motivo: 'Depois',
      new_VersaoEsperada: '77',
      new_Inicio: '2026-08-04T13:00:00.000Z',
      new_Fim: '2026-08-04T13:30:00.000Z',
      new_Observacao: 'Depois',
    })
    expect(updates).toEqual([])
  })

  test('atualização com modo limpa local vazio; sem modo mantém o contrato antigo', async () => {
    const { client, calls } = fakeClient()
    const source = createDataverseSource(client)
    const at = new Date('2026-08-04T13:00:00.000Z')
    await source.updateSwap({ id: exchangeId, rowVersion: '1', start: at, end: at, obs: '', windowMode: 'fixed', location: '' })
    await source.updateSwap({ id: exchangeId, rowVersion: '1', start: at, end: at, obs: '' })
    expect(calls[0].body!.new_ModoJanela).toBe(100000000)
    expect(calls[0].body!.new_Local).toBe('')
    expect(calls[0].body!.new_Motivo).toBe('Atualização operacional da troca.')
    expect(calls[1].body!).not.toHaveProperty('new_ModoJanela')
  })

  test('cancelar e reverter leem o etag atual antes e mandam new_VersaoEsperada', async () => {
    const { client, calls } = fakeClient({ [`cr40f_trocasdecarros(${exchangeId})?`]: { cr40f_trocasdecarroid: exchangeId, '@odata.etag': 'W/"88"' } })
    const source = createDataverseSource(client)
    await source.cancelSwap(exchangeId, 'Motorista faltou')
    const effectiveAt = new Date('2026-08-05T10:00:00.000Z')
    await source.revertSwap(exchangeId, 'Lançada errada', effectiveAt)
    expect(calls.map((call) => `${call.method} ${call.path.split('?')[0]}`)).toEqual([
      `GET cr40f_trocasdecarros(${exchangeId})`,
      `POST cr40f_trocasdecarros(${exchangeId})/Microsoft.Dynamics.CRM.new_CancelarTrocaDeCarro`,
      `GET cr40f_trocasdecarros(${exchangeId})`,
      `POST cr40f_trocasdecarros(${exchangeId})/Microsoft.Dynamics.CRM.new_ReverterTrocaDeCarro`,
    ])
    expect(calls[1].body).toEqual({ new_Motivo: 'Motorista faltou', new_VersaoEsperada: '88' })
    expect(calls[3].body).toEqual({ new_Motivo: 'Lançada errada', new_VersaoEsperada: '88', new_DataEfetiva: effectiveAt.toISOString() })
  })
})

describe('motorista, duplicação e local da base', () => {
  test('troca de motorista faz PATCH com @odata.bind; retirar manda o lookup nulo', async () => {
    const { client, updates } = fakeClient()
    const source = createDataverseSource(client)
    await source.changeDriver('srv-1', '{DRV-1}')
    await source.changeDriver('srv-1', null)
    expect(updates).toEqual([
      { entitySet: 'cr40f_reservadeveculoses', id: 'srv-1', data: { 'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(DRV-1)' } },
      { entitySet: 'cr40f_reservadeveculoses', id: 'srv-1', data: { cr40f_Motorista: null } },
    ])
  })

  test('duplicar cria a reserva Confirmada com os campos do original e um vínculo por passageiro', async () => {
    const { client, creates } = fakeClient()
    const original = buildSeedDb().services[0]
    const dataSaida = new Date('2026-11-02T11:30:00.000Z')
    const id = await createDataverseSource(client).cloneService({
      originalId: original.id, original: { ...original, clienteId: 'cli-1', solicitanteId: 'sol-1', receberValue: true }, dataSaida, driverId: 'drv-9', obsOperacao: 'Op', obsInterna: 'Int',
      passengerLinks: [
        { id: 'l1', serviceId: original.id, passengerId: 'pax-1', passengerLabel: 'A', order: 1, address: 'x' },
        { id: 'l2', serviceId: original.id, passengerId: '', passengerLabel: 'B', order: 2, address: 'y' },
      ],
    })
    expect(creates[0]).toEqual({
      entitySet: 'cr40f_reservadeveculoses',
      data: {
        cr40f_dataehorriodesada: dataSaida.toISOString(),
        cr40f_obsdeoperao: 'Op',
        cr40f_observaointerna: 'Int',
        cr40f_status: 202410001,
        cr40f_tipodoservico: original.tipoServicoValue,
        cr40f_tipodeveiculo: original.tipoVeiculoValue,
        cr40f_destino: original.destino,
        cr40f_endereodesada: original.enderecoSaida,
        cr40f_passageirosetelefonedecontato: original.paxView,
        cr40f_trajeto: original.trajeto,
        cr40f_perfildopassageiro: original.perfilPassageiro,
        cr40f_email: original.email,
        cr40f_formadepagamento: original.formaPagamentoValue,
        cr40f_cotao: original.cotacao,
        cr40f_cr: original.cr,
        cr40f_receber: true,
        'cr40f_Cliente@odata.bind': '/cr40f_clientes1s(cli-1)',
        'cr40f_Solicitante@odata.bind': '/cr40f_bancodedadoses(sol-1)',
        'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(drv-9)',
      },
    })
    expect(creates.slice(1)).toEqual([
      { entitySet: 'cr40f_servicosporpassageiros', data: { cr40f_ordemdeselecao: 1, 'cr40f_Geral@odata.bind': `/cr40f_reservadeveculoses(${id})`, 'cr40f_BancodeDados@odata.bind': '/cr40f_bancodedadoses(pax-1)' } },
      { entitySet: 'cr40f_servicosporpassageiros', data: { cr40f_ordemdeselecao: 2, 'cr40f_Geral@odata.bind': `/cr40f_reservadeveculoses(${id})` } },
    ])
  })

  test('cadastro de local envia só os campos preenchidos e devolve o id em minúsculas', async () => {
    const { client, creates } = fakeClient()
    const location = await createDataverseSource(client).createLocation({ name: ' Garagem Moema ', address: ' ', mapUrl: ' https://maps.google.com/x ' })
    expect(creates).toEqual([{ entitySet: 'new_localdebases', data: { new_name: 'Garagem Moema', new_linkmapa: 'https://maps.google.com/x' } }])
    expect(location).toEqual({ id: '00000001-0000-0000-0000-000000000000', name: 'Garagem Moema', address: '', mapUrl: 'https://maps.google.com/x' })
    await expect(createDataverseSource(client).createLocation({ name: ' ', address: '', mapUrl: '' })).rejects.toThrow('Informe o nome do local.')
  })
})

describe('carga', () => {
  test('consultas com os mesmos $select/$filter do WebResource, rótulo do motorista pelo apelido e vínculos em lotes', async () => {
    const now = new Date(2026, 9, 29, 15, 0)
    const { client, calls } = fakeClient({
      'cr40f_funcionarioses?': { value: [{ cr40f_funcionariosid: 'd1', cr40f_nomecompleto: 'Diego Nunes', new_apelido: 'Diego', cr40f_emailmicrosoft: "O'Neil@X.com", cr40f_tipodevinculo: 1 }] },
      'systemusers?': { value: [{ internalemailaddress: "o'neil@x.com" }] },
      'cr40f_reservadeveculoses?': { value: [{ cr40f_reservadeveculosid: 's1', cr40f_id: '11482', _cr40f_motorista_value: 'd1', '_cr40f_motorista_value@OData.Community.Display.V1.FormattedValue': 'Diego Nunes', cr40f_status: 202410001 }] },
      'cr40f_servicosporpassageiros?': { value: [{ cr40f_servicosporpassageiroid: 'p2', cr40f_ordemdeselecao: 2, _cr40f_geral_value: 's1' }, { cr40f_servicosporpassageiroid: 'p1', cr40f_ordemdeselecao: 1, _cr40f_geral_value: 's1' }] },
    })
    const data = await createDataverseSource(client, () => now).load()
    const paths = calls.map((call) => call.path)
    expect(paths).toContain("cr40f_funcionarioses?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido,cr40f_emailmicrosoft,cr40f_tipodevinculo,statecode&$filter=statecode eq 0")
    expect(paths).toContain("systemusers?$select=internalemailaddress&$filter=isdisabled eq false and (internalemailaddress eq 'o''neil@x.com')")
    expect(paths).toContain('cr40f_veiculoses?$select=cr40f_veiculosid,cr40f_modelo,cr40f_cor,cr40f_placa,new_propriedade,new_blindado,new_fornecedorlocacao,new_fimlocacao,statecode&$filter=statecode eq 0')
    expect(paths).toContain('new_localdebases?$select=new_localdebaseid,new_name,new_endereco,new_linkmapa&$filter=statecode eq 0&$orderby=new_name asc')
    expect(paths).toContain('cr40f_trocasdecarros?$select=cr40f_trocasdecarroid,cr40f_iniciodajaneladetroca,cr40f_fimdajaneladetroca,cr40f_statusdatroca,new_tipodetroca,cr40f_observacao,_cr40f_motorista1_value,_cr40f_motorista2_value,_cr40f_veiculo1antesdatroca_value,_cr40f_veiculo2antesdatroca_value,_new_localdebase_value,new_mododajanela,new_localdatroca,new_alertajanela,_new_m1depoisde_value,_new_m1antesde_value,_new_m2depoisde_value,_new_m2antesde_value&$filter=(statecode eq 0) and (cr40f_statusdatroca eq 202410000 or cr40f_statusdatroca eq 100000001)')
    const start = new Date(2026, 9, 22).toISOString()
    const end = new Date(2026, 10, 6).toISOString()
    expect(paths).toContain(`cr40f_reservadeveculoses?$select=cr40f_reservadeveculosid,cr40f_id,cr40f_dataehorriodesada,cr40f_horrioprevistoderetorno,cr40f_status,cr40f_statusdefaturamento,cr40f_tipodoservico,cr40f_tipodeveiculo,cr40f_destino,cr40f_endereodesada,cr40f_obsdeoperao,cr40f_observaointerna,cr40f_passageirosetelefonedecontato,cr40f_trajeto,cr40f_perfildopassageiro,cr40f_email,cr40f_receber,cr40f_formadepagamento,cr40f_cotao,cr40f_cr,new_categoriadoitem,_cr40f_cliente_value,_cr40f_solicitante_value,_cr40f_motorista_value,_cr40f_veiculo_value&$filter=cr40f_dataehorriodesada ge ${start} and cr40f_dataehorriodesada lt ${end}&$orderby=cr40f_dataehorriodesada asc`)
    const history = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()
    expect(paths).toContain(`new_possedeveiculos?$select=new_possedeveiculoid,new_iniciodaposse,new_fimdaposse,_new_motorista_value,_new_veiculo_value,_new_localdebase_value&$filter=statecode eq 0 and (new_fimdaposse eq null or new_fimdaposse ge ${history})&$orderby=new_iniciodaposse asc`)
    expect(paths).toContain('cr40f_servicosporpassageiros?$select=cr40f_servicosporpassageiroid,cr40f_ordemdeselecao,new_enderecodesaidacolunaservicosporpassageiro,_cr40f_geral_value,_cr40f_bancodedados_value&$filter=_cr40f_geral_value eq s1')
    expect(data.drivers[0]).toMatchObject({ employmentTypeLabel: 'Terceiro', hasActiveSystemUser: true })
    expect(data.services[0]).toMatchObject({ motoristaLabel: 'Diego', statusLabel: 'Confirmado' })
    expect(data.passengerLinks.map((link) => link.id)).toEqual(['p1', 'p2'])
  })

  test('paginação segue o nextLink e para em 100 páginas', async () => {
    let n = 0
    const client = { request: vi.fn(async () => ({ value: [{ n: ++n }], '@odata.nextLink': `https://org/api/data/v9.2/x?page=${n + 1}` })) } as unknown as DataverseClient
    await expect(getAllPaged(client, 'cr40f_veiculoses?$select=x')).rejects.toThrow('[PAGINATION_LIMIT] Consulta excedeu 100 páginas em cr40f_veiculoses.')
    expect(client.request).toHaveBeenCalledTimes(100)
  })
})

describe('mock', () => {
  test('agendar "Foi agora" troca as posses, conclui a troca e cria a Geral 13000+n; reverter cria a troca inversa', async () => {
    const store = buildSeedDb()
    const source = createMockSource(store)
    const data = await source.load()
    const bruno = data.drivers.find((d) => d.nickname === 'Bruno')!
    const carla = data.drivers.find((d) => d.nickname === 'Carla')!
    const at = new Date()
    const input = preview({
      driver1Id: bruno.id, driver1Label: 'Bruno', driver2Id: carla.id, driver2Label: 'Carla',
      vehicle1Id: 'veh-001', vehicle1Label: 'Corolla • BET1A23', vehicle2Id: 'veh-005', vehicle2Label: 'Fusion Blindado • BET9F34',
    })
    const id = await source.scheduleSwap(schedule(input, { effectiveAt: at }))
    const swap = store.swaps.find((s) => s.id === id)!
    expect(swap.statusValue).toBe(202410001)
    const open = store.possessions.filter((p) => !p.end)
    expect(open.find((p) => p.driverId === bruno.id)?.vehicleId).toBe('veh-005')
    expect(open.find((p) => p.driverId === carla.id)?.vehicleId).toBe('veh-001')
    expect(store.services[0]).toMatchObject({ categoriaItemValue: 100000002, statusValue: 202410008, statusFaturamentoValue: 202410011, tipoServicoValue: 202410009 })
    expect(Number(store.services[0].readableId)).toBeGreaterThanOrEqual(13000)

    await source.revertSwap(id, 'Errado')
    const reopened = store.possessions.filter((p) => !p.end)
    expect(reopened.find((p) => p.driverId === bruno.id)?.vehicleId).toBe('veh-001')
    expect(store.swaps.at(-1)).toMatchObject({ statusValue: 202410001, obs: 'Errado', vehicle1Id: 'veh-005', vehicle2Id: 'veh-001' })
  })

  test('posse divergente falha sem gravar a troca', async () => {
    const store = buildSeedDb()
    const before = store.swaps.length
    await expect(createMockSource(store).scheduleSwap(schedule(preview({ driver1Id: 'drv-001', vehicle1Id: 'veh-999' }), { effectiveAt: new Date() })))
      .rejects.toThrow('Motorista 1: era esperada exatamente uma posse aberta.')
    expect(store.swaps).toHaveLength(before)
  })
})
