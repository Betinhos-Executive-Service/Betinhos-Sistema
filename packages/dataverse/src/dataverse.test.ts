import { describe, expect, it, vi } from 'vitest'
import { chunk, createClient, createMetadata, createXrmShim, formatted } from './index'

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })
}

describe('format', () => {
  it('divide em blocos preservando a ordem', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 10)).toEqual([])
  })

  it('prefere o valor formatado e cai no valor cru', () => {
    const row = { status: 2, 'status@OData.Community.Display.V1.FormattedValue': 'Confirmado', nome: 'Ana' }
    expect(formatted(row, 'status')).toBe('Confirmado')
    expect(formatted(row, 'nome')).toBe('Ana')
    expect(formatted(row, 'ausente')).toBe('')
  })
})

describe('client', () => {
  it('segue o nextLink até o fim', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ value: [{ id: 1 }], '@odata.nextLink': 'https://org.example/api/data/v9.2/contas?$skiptoken=x' }))
      .mockResolvedValueOnce(json({ value: [{ id: 2 }] }))
    const client = createClient('https://org.example/', fetchMock)
    expect(await client.getAll('contas?$select=id')).toEqual([{ id: 1 }, { id: 2 }])
    expect(fetchMock.mock.calls[0][0]).toBe('https://org.example/api/data/v9.2/contas?$select=id')
    expect(fetchMock.mock.calls[1][0]).toBe('https://org.example/api/data/v9.2/contas?$skiptoken=x')
  })

  it('update usa PATCH com If-Match * para nunca virar upsert', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await createClient('https://org.example', fetchMock).update('contas', '{ABC}', { nome: 'x' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://org.example/api/data/v9.2/contas(abc)')
    expect(init.method).toBe('PATCH')
    expect(init.headers['If-Match']).toBe('*')
  })
  it('expõe a mensagem de erro do Dataverse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: { message: 'Coluna inexistente' } }, { status: 400 }))
    await expect(createClient('https://org.example', fetchMock).request('contas')).rejects.toMatchObject({ message: 'Coluna inexistente', status: 400 })
  })

  it('devolve o id criado a partir do cabeçalho OData-EntityId', async () => {
    const id = '0F8FAD5B-D9CB-469F-A165-70867728950E'
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { 'OData-EntityId': `https://org.example/api/data/v9.2/contas(${id})` } }))
    expect(await createClient('https://org.example', fetchMock).create('contas', { nome: 'x' })).toBe(id.toLowerCase())
  })
})

describe('xrm shim', () => {
  it('resolve o entity set pela metadata, com cache, e devolve entities/nextLink', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('EntityDefinitions')) return json({ LogicalName: 'cr40f_reserva', EntitySetName: 'cr40f_reservas' })
      return json({ value: [{ a: 1 }], '@odata.nextLink': 'https://org.example/next' })
    })
    const xrm = createXrmShim(createClient('https://org.example', fetchMock as unknown as typeof fetch), 'https://org.example')
    const page = await xrm.WebApi!.retrieveMultipleRecords('cr40f_reserva', '?$select=a', 50)
    expect(page).toEqual({ entities: [{ a: 1 }], nextLink: 'https://org.example/next' })
    expect(fetchMock.mock.calls[1][0]).toBe('https://org.example/api/data/v9.2/cr40f_reservas?$select=a')
    await xrm.WebApi!.retrieveMultipleRecords('cr40f_reserva')
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('EntityDefinitions'))).toHaveLength(1)
    expect(xrm.Utility!.getGlobalContext().getClientUrl()).toBe('https://org.example')
  })

  it('executa Custom API sem vínculo por POST e devolve o erro do servidor como Response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ error: { message: 'Veículo sem motorista.' } }, { status: 400 }))
    const xrm = createXrmShim(createClient('https://org.example', fetchMock as unknown as typeof fetch), 'https://org.example')
    const request = (operationName: string) => ({ new_VeiculoId: 'abc', getMetadata: () => ({ boundParameter: null, operationType: 0, operationName, parameterTypes: { new_VeiculoId: {} } }) })
    const ok = await xrm.WebApi!.online!.execute(request('new_SolicitarChecklistVeiculo'))
    expect(ok.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://org.example/api/data/v9.2/new_SolicitarChecklistVeiculo')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ new_VeiculoId: 'abc' })
    const failed = await xrm.WebApi!.online!.execute(request('new_SolicitarChecklistVeiculo'))
    expect(failed.status).toBe(400)
    expect((await failed.json()).error.message).toContain('Veículo sem motorista.')
  })
})

describe('metadata.choices', () => {
  it('lê as opções reais da coluna e guarda em cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      OptionSet: { Options: [
        { Value: 202410001, Label: { UserLocalizedLabel: { Label: 'Confirmado' } } },
        { Value: 202410008, Label: { UserLocalizedLabel: null } },
      ] },
    }))
    const metadata = createMetadata(createClient('https://org.example', fetchMock))
    const options = await metadata.choices('cr40f_reservadeveculos', 'cr40f_status')
    expect(options).toEqual([{ value: 202410001, label: 'Confirmado' }, { value: 202410008, label: '202410008' }])
    await metadata.choices('cr40f_reservadeveculos', 'cr40f_status')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("https://org.example/api/data/v9.2/EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes(LogicalName='cr40f_status')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)")
  })
})

describe('metadata attributes', () => {
  it('lê tipo, rótulo, updatable e alvos de lookup em duas chamadas', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ value: [
        { LogicalName: 'cr40f_status', AttributeType: 'Picklist', IsValidForUpdate: true, DisplayName: { UserLocalizedLabel: { Label: 'Status de Operação' } } },
        { LogicalName: 'cr40f_motorista', AttributeType: 'Lookup', IsValidForUpdate: true, DisplayName: { UserLocalizedLabel: { Label: 'Motorista' } } },
        { LogicalName: 'cr40f_id', AttributeType: 'String', IsValidForUpdate: false, DisplayName: { UserLocalizedLabel: null } },
      ] }))
      .mockResolvedValueOnce(json({ value: [{ LogicalName: 'cr40f_motorista', Targets: ['cr40f_funcionarios'] }] }))
    const meta = createMetadata(createClient('https://org.example', fetchMock))
    const list = await meta.attributes('cr40f_reservadeveculos')
    expect(list).toEqual([
      { logicalName: 'cr40f_status', type: 'Picklist', label: 'Status de Operação', updatable: true, targets: [] },
      { logicalName: 'cr40f_motorista', type: 'Lookup', label: 'Motorista', updatable: true, targets: ['cr40f_funcionarios'] },
      { logicalName: 'cr40f_id', type: 'String', label: 'cr40f_id', updatable: false, targets: [] },
    ])
    expect(fetchMock.mock.calls[0][0]).toContain("EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes?$select=LogicalName,AttributeType,DisplayName,IsValidForUpdate")
    expect(fetchMock.mock.calls[1][0]).toContain('/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets')
    // segunda leitura vem do cache
    await meta.attributes('cr40f_reservadeveculos')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('expõe o nome primário da tabela', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ LogicalName: 'cr40f_veiculos', EntitySetName: 'cr40f_veiculoses', PrimaryNameAttribute: 'cr40f_placa', DisplayCollectionName: { UserLocalizedLabel: { Label: 'Veículos' } } }))
    const info = await createMetadata(createClient('https://org.example', fetchMock)).entity('cr40f_veiculos')
    expect(info.primaryName).toBe('cr40f_placa')
    expect(fetchMock.mock.calls[0][0]).toContain('PrimaryNameAttribute')
  })

  it('expõe o ObjectTypeCode da tabela (null quando a metadata não traz)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ LogicalName: 'cr40f_reservadeveculos', EntitySetName: 'cr40f_reservadeveculoses', ObjectTypeCode: 10580 }))
      .mockResolvedValueOnce(json({ LogicalName: 'cr40f_outra', EntitySetName: 'cr40f_outras' }))
    const meta = createMetadata(createClient('https://org.example', fetchMock))
    expect((await meta.entity('cr40f_reservadeveculos')).objectTypeCode).toBe(10580)
    expect(fetchMock.mock.calls[0][0]).toContain('ObjectTypeCode')
    expect((await meta.entity('cr40f_outra')).objectTypeCode).toBeNull()
  })
})
