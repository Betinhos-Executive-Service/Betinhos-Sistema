// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'
import type { CatalogField } from './data/views'
import type { Host } from '../../host'

const catalog = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('./data/views', async (original) => ({
  ...await original<typeof import('./data/views')>(),
  loadColumnCatalog: () => catalog.load(),
}))

const F = '@OData.Community.Display.V1.FormattedValue'
const CLIENT_URL = 'https://abertura.crm.example'
const choices = vi.fn(async (_table: string, attribute: string) => attribute === 'new_operacao' ? [{ value: 7, label: 'Programado', color: '#bd8ad1' }] : [{ value: 1, label: 'Pendente', color: '#f5dd9f' }])
const host = { mode: 'dataverse', clientUrl: CLIENT_URL, metadata: { choices }, client: {}, insideModelDriven: false, appId: async () => undefined } as unknown as Host
const FETCH = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><attribute name="new_operacao"/></entity></fetch>'
const LAYOUT = '<grid name="resultset" object="1" jump="new_status" select="1" icon="1" preview="1"><row name="result" id="cr40f_composicaodeprecosid"><cell name="new_status" width="140"/><cell name="new_operacao" width="140"/></row></grid>'
const view = { savedqueryid: 'vvvvvvvv-0000-4000-8000-000000000001', name: 'Padrão', description: '', fetchxml: FETCH, layoutxml: LAYOUT, querytype: 0, isdefault: true }
const row = (id: string) => ({ cr40f_composicaodeprecosid: id, new_status: 1, [`new_status${F}`]: 'Pendente', new_operacao: 7, [`new_operacao${F}`]: 'Programado', new_texto: 'x', versionnumber: 1 })
const field = (id: string, label: string, type: string): CatalogField => ({ id, label, table: 'cr40f_composicaodeprecos', attribute: id, path: [], type, available: true, writable: true })

type Handler = (entity: string, query: string, call: number) => unknown
function fakeXrm(handler: Handler = () => ({ entities: [] })) {
  const calls: { entity: string; query: string }[] = []
  const retrieveMultipleRecords = vi.fn((entity: string, query = '') => {
    calls.push({ entity, query })
    const answer = handler(entity, decodeURIComponent(query), calls.filter((item) => item.entity === entity).length)
    return answer instanceof Promise ? answer : Promise.resolve(answer)
  })
  const xrm = { WebApi: { retrieveMultipleRecords }, Utility: { getGlobalContext: () => ({ getClientUrl: () => CLIENT_URL }) } }
  window.Xrm = xrm as unknown as typeof window.Xrm
  return { calls, count: (entity: string) => calls.filter((item) => item.entity === entity).length }
}
const standard: Handler = (entity, query) => {
  if (entity === 'savedquery') return { entities: [view] }
  if (entity === 'cr40f_composicaodeprecos') return { entities: query.includes('aggregate') ? [{ total: 1 }] : [row('11111111-1111-4111-8111-111111111111')] }
  return { entities: [] }
}

beforeEach(() => { try { localStorage.clear() } catch { /* sem storage */ } })
afterEach(() => { cleanup(); catalog.load.mockReset(); delete (window as { Xrm?: unknown }).Xrm; delete (window as { requestIdleCallback?: unknown }).requestIdleCallback; delete (window as { cancelIdleCallback?: unknown }).cancelIdleCallback; vi.restoreAllMocks() })


it('pinta com a cor da metadata toda coluna de escolha da visão, não só o Status', async () => {
  catalog.load.mockResolvedValue([field('new_status', 'Status', 'Picklist'), field('new_operacao', 'Status de Operação', 'Picklist')])
  fakeXrm(standard)

  render(<ComposicaoPage host={host} />)

  await waitFor(() => expect(choices).toHaveBeenCalledWith('cr40f_composicaodeprecos', 'new_operacao', 'Picklist'))
  const badge = await waitFor(() => {
    const el = screen.getAllByText('Programado').find((node) => node.classList.contains('grid-choice-badge'))
    if (!el) throw new Error('sem badge')
    return el
  })
  expect(badge.getAttribute('style')).toContain('--grid-choice: #bd8ad1')
  await waitFor(() => expect(screen.getAllByText('Pendente').find((node) => node.classList.contains('grid-choice-badge'))?.getAttribute('style')).toContain('#f5dd9f'))
})
