// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'
import { LAST_VIEW_KEY } from './data/open-query'
import { buildFetchXml, buildLayoutXml, VIEW_MARKER, type CatalogField, type ViewDefinition } from './data/views'
import type { Host } from '../../host'

const catalog = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('./data/views', async (original) => ({
  ...await original<typeof import('./data/views')>(),
  loadColumnCatalog: () => catalog.load(),
}))

const F = '@OData.Community.Display.V1.FormattedValue'
const CLIENT_URL = 'https://export.crm.example'
const ID = '11111111-1111-4111-8111-111111111111'
const host = { mode: 'dataverse', clientUrl: CLIENT_URL, metadata: { choices: async () => [] }, client: {}, insideModelDriven: false, appId: async () => undefined } as unknown as Host
const status: CatalogField = { id: 'new_status', label: 'Status', table: 'cr40f_composicaodeprecos', attribute: 'new_status', path: [], type: 'Picklist', available: true, writable: true }
const motorista: CatalogField = {
  id: 'cr40f_reservadeveculos@cr40f_servicorelacionadogeral.cr40f_motorista', label: 'Motorista', table: 'cr40f_reservadeveculos', attribute: 'cr40f_motorista',
  primaryIdAttribute: 'cr40f_reservadeveculosid', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'Lookup', available: true, writable: true,
}

async function sheetOf(blob: Blob) {
  // O Blob do jsdom não tem arrayBuffer(): lê pelo FileReader.
  const bytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(blob) }))
  const view = new DataView(bytes.buffer)
  let at = 0
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true)
    const nameLength = view.getUint16(at + 26, true)
    const name = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLength))
    const start = at + 30 + nameLength
    if (name === 'xl/worksheets/sheet1.xml') return new TextDecoder().decode(bytes.slice(start, start + size))
    at = start + size
  }
  throw new Error('Planilha sem sheet1.xml')
}

function fakeXrm(views: { personal?: Record<string, unknown>[]; publicViews?: Record<string, unknown>[]; pins?: Record<string, unknown>[] }, record: Record<string, unknown>) {
  const retrieveMultipleRecords = vi.fn((entity: string, query = '') => {
    if (entity === 'userquery') return Promise.resolve({ entities: views.personal ?? [] })
    if (entity === 'savedquery') return Promise.resolve({ entities: views.publicViews ?? [] })
    if (entity === 'new_configuracaovisualizacaocomposicao') return Promise.resolve({ entities: views.pins ?? [] })
    if (entity === 'cr40f_composicaodeprecos') return Promise.resolve({ entities: decodeURIComponent(query).includes('aggregate') ? [{ total: 1 }] : [{ cr40f_composicaodeprecosid: ID, new_status: 1, [`new_status${F}`]: 'Aprovada', versionnumber: 1, ...record }] })
    return Promise.resolve({ entities: [] })
  })
  window.Xrm = { WebApi: { retrieveMultipleRecords }, Utility: { getGlobalContext: () => ({ getClientUrl: () => CLIENT_URL }) } } as unknown as typeof window.Xrm
}

/** Marca a linha, extrai pelo menu ⋮ e devolve o XML da planilha gerada. */
async function exportSelected() {
  let blob: Blob | null = null
  URL.createObjectURL = vi.fn((value: Blob) => { blob = value; return 'blob:planilha' })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  fireEvent.click(screen.getAllByRole('checkbox', { name: /^Selecionar / })[0])
  fireEvent.click(await screen.findByRole('button', { name: /^Mais ações/ }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /Extrair 1 para Excel/, hidden: true }))
  await waitFor(() => expect(blob).not.toBeNull())
  return sheetOf(blob!)
}

beforeEach(() => { try { localStorage.clear() } catch { /* sem storage */ } })
afterEach(() => { cleanup(); catalog.load.mockReset(); delete (window as { Xrm?: unknown }).Xrm; vi.restoreAllMocks() })

it('visão nativa com coluna ligada: o Excel das linhas marcadas traz o valor da relação (alias da própria view)', async () => {
  catalog.load.mockResolvedValue([status, motorista])
  const fetchxml = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a_67d5" link-type="outer"><attribute name="cr40f_motorista"/></link-entity></entity></fetch>'
  const layoutxml = '<grid name="resultset" object="1" jump="new_status" select="1" icon="1" preview="1"><row name="result" id="cr40f_composicaodeprecosid"><cell name="new_status" width="140"/><cell name="a_67d5.cr40f_motorista" width="160"/></row></grid>'
  fakeXrm({ publicViews: [{ savedqueryid: 'vvvvvvvv-0000-4000-8000-000000000001', name: 'Visualização Padrão', description: '', fetchxml, layoutxml, querytype: 0, isdefault: true }] }, { 'a_67d5.cr40f_motorista': 'm1', [`a_67d5.cr40f_motorista${F}`]: 'João Motorista' })

  render(<ComposicaoPage host={host} />)
  expect(await screen.findByText('João Motorista')).toBeTruthy()
  await act(async () => { await Promise.resolve() })

  const sheet = await exportSelected()
  expect(sheet).toContain('João Motorista')
  expect(sheet).toContain('Aprovada')
})

it('visão salva pela tela com coluna ligada: o Excel das linhas marcadas traz o valor da relação', async () => {
  catalog.load.mockResolvedValue([status, motorista])
  const definition: ViewDefinition = { columns: [{ id: 'new_status', width: 140, pinned: false }, { id: motorista.id, width: 160, pinned: false }], filters: [], sort: [] }
  const viewId = 'uuuuuuuu-0000-4000-8000-000000000002'
  localStorage.setItem(LAST_VIEW_KEY, viewId)
  fakeXrm({
    personal: [{ userqueryid: viewId, name: 'Minha visão', description: VIEW_MARKER, fetchxml: buildFetchXml(definition, [status, motorista]), layoutxml: buildLayoutXml(definition, [status, motorista], 1) }],
    pins: [{ new_viewid: viewId, new_pins: '', new_definition: JSON.stringify(definition) }],
  }, { 'r1.cr40f_motorista': 'm1', [`r1.cr40f_motorista${F}`]: 'Maria Motorista' })

  render(<ComposicaoPage host={host} />)
  expect(await screen.findByText('Maria Motorista')).toBeTruthy()
  await act(async () => { await Promise.resolve() })

  const sheet = await exportSelected()
  expect(sheet).toContain('Maria Motorista')
})
