// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchFilterOptions } from './filter-options'
import type { CatalogField } from './views'

const field = (type: string): CatalogField => ({ id: 'status', label: 'Status', table: 'composicoes', attribute: 'new_status', path: [], type, available: true })
afterEach(() => vi.unstubAllGlobals())

describe('opções de filtros Dataverse', () => {
  it('busca rótulos de choice no metadata e filtra pelo texto', async () => {
    vi.stubGlobal('window', { Xrm: { WebApi: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm.dynamics.com' }) } } })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ OptionSet: { Options: [
      { Value: 1, Label: { UserLocalizedLabel: { Label: 'Pendente' } } },
      { Value: 2, Label: { UserLocalizedLabel: { Label: 'Concluído' } } },
    ] } }) })))
    expect(await searchFilterOptions(field('Picklist'), 'concl')).toEqual([{ value: '2', label: 'Concluído' }])
  })

  it('consulta o destino real do lookup com texto de busca escapado', async () => {
    const retrieveMultipleRecords = vi.fn(async () => ({ entities: [{ accountid: 'record-1', name: 'João' }] }))
    vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords }, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm.dynamics.com' }) } } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("LogicalName='composicoes'")
      ? { ManyToOneRelationships: [{ ReferencingAttribute: 'new_cliente', ReferencedEntity: 'account' }] }
      : { PrimaryIdAttribute: 'accountid', PrimaryNameAttribute: 'name' } })))
    expect(await searchFilterOptions({ ...field('Lookup'), attribute: 'new_cliente' }, "Jo'ão")).toEqual([{ value: 'record-1', label: 'João' }])
    expect(retrieveMultipleRecords).toHaveBeenCalledWith('account', expect.stringContaining('Jo%27%27%C3%A3o'))
  })
})
