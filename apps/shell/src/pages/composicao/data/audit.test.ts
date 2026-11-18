import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAudit, loadAuditDetails } from './audit'

afterEach(() => vi.unstubAllGlobals())

describe('histórico de auditoria', () => {
  it('filtra os IDs selecionados e continua legível se a metadata falhar', async () => {
    vi.stubGlobal('window', { Xrm: { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.example/' }) } } })
    const fetch = vi.fn(async (url: string) => ({
      ok: !url.includes('EntityDefinitions'),
      status: url.includes('EntityDefinitions') ? 403 : 200,
      json: async () => ({ value: [{ auditid: 'a1', createdon: '2026-09-23T12:00:00Z', operation: 2, _objectid_value: '11111111-1111-1111-1111-111111111111' }] }),
    }))
    vi.stubGlobal('fetch', fetch)
    const result = await loadAudit(['11111111-1111-1111-1111-111111111111'])
    expect(result.records).toHaveLength(1)
    expect(result.fieldNames).toEqual({})
    expect(decodeURIComponent(fetch.mock.calls[0][0])).toContain('_objectid_value eq 11111111-1111-1111-1111-111111111111')
  })

  it('exibe valores formatados e nomes dos campos nos detalhes', async () => {
    vi.stubGlobal('window', { Xrm: { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.example/' }) } } })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ AuditDetail: { OldValue: { new_status: 1, 'new_status@OData.Community.Display.V1.FormattedValue': 'Pendente' }, NewValue: { new_status: 2, 'new_status@OData.Community.Display.V1.FormattedValue': 'Concluído' } } }) })))
    expect(await loadAuditDetails('a1', { new_status: 'Status' })).toEqual([{ field: 'Status', before: 'Pendente', after: 'Concluído' }])
  })
})
