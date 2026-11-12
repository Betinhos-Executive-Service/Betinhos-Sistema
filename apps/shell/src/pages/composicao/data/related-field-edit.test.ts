// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateFieldConfig, relatedRecordId, saveRelatedField } from './related-field-edit'
import type { CatalogField } from './views'

const field: CatalogField = { id: 'r.cr40f_cliente', label: 'Cliente', table: 'cr40f_reservadeveculos', attribute: 'cr40f_cliente', path: ['cr40f_reservadeveculos'], primaryIdAttribute: 'cr40f_reservadeveculosid', relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'Lookup', available: true, writable: true }
const recordId = '11111111-2222-4333-8444-555555555555'
const targetId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('gravação de coluna relacionada', () => {
  afterEach(() => { delete window.Xrm; vi.unstubAllGlobals() })

  it('usa o id da linha relacionada, não o id da composição', () => {
    expect(relatedRecordId(field, { 'r1.cr40f_reservadeveculosid': recordId }, 'r1.cr40f_cliente', targetId)).toBe(recordId)
    expect(relatedRecordId(field, {}, 'r1.cr40f_cliente', targetId)).toBeNull()
  })

  it('grava lookup pela navigation property e entity set informados pelo metadata', async () => {
    const updateRecord = vi.fn().mockResolvedValue({})
    window.Xrm = { WebApi: { updateRecord } as unknown as NonNullable<typeof window.Xrm>['WebApi'], Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://example.crm.dynamics.com' }) } }
    await saveRelatedField(field, recordId, targetId, { value: targetId, label: 'Cliente A', table: 'cr40f_clientes1', entitySet: 'cr40f_clientes1s', navigation: 'cr40f_cliente' })
    expect(updateRecord).toHaveBeenCalledWith('cr40f_reservadeveculos', recordId, { 'cr40f_cliente@odata.bind': `/cr40f_clientes1s(${targetId})` })
  })

  it('limpa lookup pela navigation property e devolve o valor confirmado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ManyToOneRelationships: [{ ReferencingAttribute: field.attribute, ReferencedEntity: 'cr40f_clientes1', ReferencingEntityNavigationPropertyName: 'cr40f_ClienteRelacionamento' }] }))))
    const updateRecord = vi.fn().mockResolvedValue({})
    const retrieveRecord = vi.fn().mockResolvedValue({ _cr40f_cliente_value: null, '@odata.etag': 'W/"3"' })
    window.Xrm = { WebApi: { updateRecord, retrieveRecord } as unknown as NonNullable<typeof window.Xrm>['WebApi'], Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://example.crm.dynamics.com' }) } }
    const result = await saveRelatedField(field, recordId, null)
    expect(updateRecord).toHaveBeenCalledWith(field.table, recordId, { cr40f_ClienteRelacionamento: null })
    expect(result).toMatchObject({ value: null, rowVersion: 'W/"3"' })
  })

  it('mantém gravação confirmada quando a releitura falha e não repete a mutação', async () => {
    const updateRecord = vi.fn().mockResolvedValue({})
    const retrieveRecord = vi.fn().mockRejectedValue(new Error('Releitura indisponível'))
    window.Xrm = { WebApi: { updateRecord, retrieveRecord } as unknown as NonNullable<typeof window.Xrm>['WebApi'], Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://example.crm.dynamics.com' }) } }
    const result = await saveRelatedField({ ...field, type: 'Money' }, recordId, 123.45)
    expect(updateRecord).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ value: 123.45, refreshWarning: expect.stringContaining('Campo salvo') })
  })

  it('consulta comportamento e formato reais de data no metadata', async () => {
    const fetchMetadata = vi.fn().mockResolvedValue(new Response(JSON.stringify({ DateTimeBehavior: { Value: 'DateOnly' }, Format: 'DateOnly' })))
    vi.stubGlobal('fetch', fetchMetadata)
    window.Xrm = { WebApi: {} as NonNullable<typeof window.Xrm>['WebApi'], Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://example.crm.dynamics.com' }) } }
    expect(await dateFieldConfig({ ...field, type: 'DateTime' })).toEqual({ behavior: 'DateOnly', dateOnly: true })
    expect(fetchMetadata.mock.calls[0][0]).toContain('DateTimeAttributeMetadata?$select=DateTimeBehavior,Format')
  })
})
