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
