import { afterEach, describe, expect, it, vi } from 'vitest'
import { createXrmSource } from './dataverse'
import type { XrmHost } from './xrm'

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
const GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

function sourceWith(rows: Record<string, unknown>[] | Error) {
  const retrieveMultipleRecords = vi.fn(async () => { if (rows instanceof Error) throw rows; return { entities: rows } })
  const xrm: XrmHost = {
    WebApi: { retrieveMultipleRecords, retrieveRecord: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn() },
    Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org23b93544.crm2.dynamics.com' }) },
  }
  return { source: createXrmSource(xrm), retrieveMultipleRecords }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('createXrmSource().equipamentos', () => {
  it('filtra pelo responsável, deixa os baixados de fora e lê o nome do tipo pela anotação do lookup', async () => {
    const { source, retrieveMultipleRecords } = sourceWith([{
      cr40f_equipamentoid: '{AAAAAAAA-0000-4000-8000-000000000001}', cr40f_name: 'Notebook do Financeiro',
      _cr40f_tipo_value: 'x', [`_cr40f_tipo_value${FORMATTED}`]: 'Notebook', cr40f_numeroserie: 'DL5440-001', cr40f_status: 100000000,
    }, { cr40f_equipamentoid: 'aaaaaaaa-0000-4000-8000-000000000002', cr40f_name: 'Sem tipo', cr40f_numeroserie: null, cr40f_status: null }])
    const itens = await source.equipamentos(`{${GUID.toUpperCase()}}`)
    expect(itens).toEqual([
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', descricao: 'Notebook do Financeiro', tipo: 'Notebook', numeroSerie: 'DL5440-001', status: 100000000 },
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', descricao: 'Sem tipo', tipo: '', numeroSerie: '', status: null },
    ])
    const [entity, options] = retrieveMultipleRecords.mock.calls[0] as unknown as [string, string]
    expect(entity).toBe('cr40f_equipamento')
    expect(options).toContain(`$filter=_cr40f_responsavel_value eq ${GUID} and (cr40f_status ne 100000003 or cr40f_status eq null)`)
    expect(options).toContain('$select=cr40f_equipamentoid,cr40f_name,_cr40f_tipo_value,cr40f_numeroserie,cr40f_status')
  })

  it('recusa id que não é GUID, sem consultar o Dataverse', async () => {
    const { source, retrieveMultipleRecords } = sourceWith([])
    await expect(source.equipamentos(`${GUID} or cr40f_status eq 100000003`)).rejects.toThrow('Id de funcionário inválido.')
    expect(retrieveMultipleRecords).not.toHaveBeenCalled()
  })

  it('tabela ausente no ambiente vira a mensagem padrão do shell', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ value: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const { source } = sourceWith(new Error("The entity with a name = 'cr40f_equipamento' was not found in the MetadataCache."))
    await expect(source.equipamentos(GUID)).rejects.toThrow('Tabela cr40f_equipamento não encontrada na metadata.')
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toContain("EntityDefinitions?$select=LogicalName&$filter=LogicalName eq 'cr40f_equipamento'")
  })

  it('com a tabela existente (ou metadata indisponível) relança o erro original', async () => {
    const original = new Error('Permissão negada.')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ value: [{ LogicalName: 'cr40f_equipamento' }] }), { status: 200 })))
    await expect(sourceWith(original).source.equipamentos(GUID)).rejects.toBe(original)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await expect(sourceWith(original).source.equipamentos(GUID)).rejects.toBe(original)
  })
})

describe('createXrmSource().uploadAditivo', () => {
  it('envia o PDF em PATCH na coluna de arquivo com o nome do arquivo', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    const { source } = sourceWith([])
    const file = new File(['%PDF'], 'aditivo ação.pdf', { type: 'application/pdf' })
    await source.uploadAditivo(`{${GUID.toUpperCase()}}`, file)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://org23b93544.crm2.dynamics.com/api/data/v9.2/cr40f_funcionarioses(${GUID})/new_aditivoassinatura`)
    expect(init.method).toBe('PATCH')
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/octet-stream')
    expect(headers['x-ms-file-name']).toBe(encodeURIComponent('aditivo ação.pdf'))
    expect(init.body).toBe(file)
  })

  it('erro do Dataverse vira exceção com a mensagem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Arquivo grande demais.' } }), { status: 400 })))
    const { source } = sourceWith([])
    await expect(source.uploadAditivo(GUID, new File(['x'], 'a.pdf'))).rejects.toThrow('Arquivo grande demais.')
  })

  it('recusa id que não é GUID', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { source } = sourceWith([])
    await expect(source.uploadAditivo('x/../y', new File(['x'], 'a.pdf'))).rejects.toThrow('Id de funcionário inválido.')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('createXrmSource().list: selo Sem app', () => {
  it('uma consulta de systemusers habilitados marca só motoristas sem acesso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sem metadata') }))
    const retrieveMultipleRecords = vi.fn(async (entity: string, _options?: string) => ({
      entities: entity === 'systemuser'
        ? [{ internalemailaddress: 'Ana@Betinhos.com.br' }]
        : [
            { cr40f_funcionariosid: 'a', cr40f_funcao: 202410000, cr40f_emailmicrosoft: 'ana@betinhos.com.br' },
            { cr40f_funcionariosid: 'b', cr40f_funcao: 202410000, cr40f_emailmicrosoft: 'bia@betinhos.com.br' },
            { cr40f_funcionariosid: 'c', cr40f_funcao: 202410000, cr40f_emailmicrosoft: null },
            { cr40f_funcionariosid: 'd', cr40f_funcao: 202410001, cr40f_emailmicrosoft: null },
          ],
    }))
    const xrm: XrmHost = {
      WebApi: { retrieveMultipleRecords, retrieveRecord: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn() },
      Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org23b93544.crm2.dynamics.com' }) },
    }
    const rows = await createXrmSource(xrm).list()
    expect(rows.map((row) => row.semApp)).toEqual([false, true, true, false])
    const usuarios = retrieveMultipleRecords.mock.calls.filter(([entity]) => entity === 'systemuser')
    expect(usuarios).toHaveLength(1)
    expect(usuarios[0][1]).toBe('?$select=internalemailaddress&$filter=isdisabled eq false and accessmode eq 0')
  })

  it('falha na consulta de systemusers deixa a lista sem selo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sem metadata') }))
    const retrieveMultipleRecords = vi.fn(async (entity: string, _options?: string) => {
      if (entity === 'systemuser') throw new Error('403')
      return { entities: [{ cr40f_funcionariosid: 'a', cr40f_funcao: 202410000, cr40f_emailmicrosoft: null }] }
    })
    const xrm: XrmHost = {
      WebApi: { retrieveMultipleRecords, retrieveRecord: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn() },
      Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org23b93544.crm2.dynamics.com' }) },
    }
    const [row] = await createXrmSource(xrm).list()
    expect(row.semApp).toBeUndefined()
  })
})
