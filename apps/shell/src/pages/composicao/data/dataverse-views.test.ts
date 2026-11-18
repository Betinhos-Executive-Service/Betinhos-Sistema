// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCompositionById, loadCompositions } from './dataverse'
import type { SavedView } from './views'

afterEach(() => vi.unstubAllGlobals())

describe('consulta paginada de view Dataverse', () => {
  it('executa a view nativa no servidor e hidrata registros mantendo a ordem da view', async () => {
    const calls: { entity: string; options?: string }[] = []
    const retrieveMultipleRecords = vi.fn(async (entity: string, options?: string) => {
      calls.push({ entity, options })
      if (entity === 'cr40f_composicaodeprecos' && options?.startsWith('?savedQuery=')) return { entities: [{ cr40f_composicaodeprecosid: 'c2' }, { cr40f_composicaodeprecosid: 'c1' }], nextLink: 'https://org/api/data/v9.2/cr40f_composicaodeprecos?$skiptoken=2' }
      if (entity === 'cr40f_composicaodeprecos' && options?.includes('$skiptoken=2')) return { entities: [{ cr40f_composicaodeprecosid: 'c3' }] }
      if (entity === 'cr40f_composicaodeprecos') return { entities: ['c1', 'c2', 'c3'].map((id) => ({ cr40f_composicaodeprecosid: id, _cr40f_servicorelacionadogeral_value: null })) }
      return { entities: [] }
    })
    vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })
    const view: SavedView = { id: 'view-1', kind: 'public', name: 'Teste', managed: true, definition: { columns: [], filters: [], sort: [] } }
    const first = await loadCompositions(undefined, view)
    expect(first.records.map((row) => row.id)).toEqual(['c2', 'c1'])
    expect(first.nextLink).toContain('$skiptoken=2')
    const second = await loadCompositions(first.nextLink!, view)
    expect(second.records.map((row) => row.id)).toEqual(['c3'])
    expect(calls.filter((call) => call.entity === 'cr40f_composicaodeprecos').map((call) => call.options)).toContain('?savedQuery=view-1')
    expect(calls.filter((call) => call.entity === 'cr40f_composicaodeprecos').map((call) => call.options)).toContain('?$skiptoken=2')
  })

  it('recarrega uma composição por ID mesmo fora da primeira página', async () => {
    const id = '11111111-2222-4333-8444-555555555555'
    // all-attributes já traz a linha completa: não há releitura por lote.
    const retrieveMultipleRecords = vi.fn(async (entity: string, options?: string) => {
      if (entity !== 'cr40f_composicaodeprecos' || !options?.startsWith('?fetchXml=')) return { entities: [] }
      return { entities: [{ cr40f_composicaodeprecosid: id, _cr40f_servicorelacionadogeral_value: null, 'cr40f_valorhoramotorista': 125.75, '@odata.etag': 'W/"9"' }] }
    })
    vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })

    const row = await loadCompositionById(id)

    expect(row).toMatchObject({ id, rowVersion: 'W/"9"', values: { cr40f_valorhoramotorista: '125.75' } })
    const compositionQueries = retrieveMultipleRecords.mock.calls.filter((call) => call[0] === 'cr40f_composicaodeprecos')
    expect(compositionQueries).toHaveLength(1)
    expect(decodeURIComponent(compositionQueries[0][1] ?? '')).toContain(`operator="eq" value="${id}"`)
    await expect(loadCompositionById('id-invalido')).rejects.toThrow('ID da composição inválido.')
  })
})
