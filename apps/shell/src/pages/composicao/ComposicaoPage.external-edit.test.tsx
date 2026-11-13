// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { initialCompositions } from './data/compositions'
import { viewValueKey, type CatalogField, type SavedView } from './data/views'
import { ComposicaoPage } from './ComposicaoPage'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))
const guid = '11111111-2222-4333-8444-555555555555'
const catalog: CatalogField[] = ['Money', 'Lookup'].map((type, index) => ({ id: `external${index}`, table: 'reservation', attribute: `field${index}`, primaryIdAttribute: 'reservationid', path: ['reservation'], relationships: [{ from: 'reservationid', to: 'reservationlookup' }], label: index ? 'OP externa' : 'Valor externo', type, available: true, writable: true }))
const view: SavedView = { id: 'test', kind: 'personal', name: 'Campos externos', managed: true, definition: { columns: catalog.map((field) => ({ id: field.id, width: 160, pinned: false })), filters: [], sort: [] } }
vi.mock('./data/dataverse', async (original) => ({ ...await original<typeof import('./data/dataverse')>(), loadCompositions: mocks.load, getDataverseEnvironmentLabel: () => 'DEV' }))
vi.mock('./data/views', async (original) => ({ ...await original<typeof import('./data/views')>(), loadColumnCatalog: async () => catalog, loadViews: async () => [view], buildViews: () => [view], fetchViewRows: async () => ({ personal: [], publicViews: [], pins: [] }) }))
vi.mock('./data/related-field-edit', async (original) => ({ ...await original<typeof import('./data/related-field-edit')>(), saveRelatedField: mocks.save, lookupOptions: async () => [{ value: guid, label: 'OP nova', navigation: 'field1', entitySet: 'ops' }] }))

let remoteAmount = 50
let remoteOp = 'OP anterior'
beforeEach(() => {
  remoteAmount = 50; remoteOp = 'OP anterior'; vi.clearAllMocks()
  mocks.load.mockImplementation(async () => ({ source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()), records: initialCompositions.slice(0, 2).map((row) => ({ ...row, viewFields: {
    'r1.reservationid': guid,
    [viewValueKey(catalog[0].id, view.definition, catalog)]: remoteAmount,
    [viewValueKey(catalog[1].id, view.definition, catalog)]: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    [`${viewValueKey(catalog[1].id, view.definition, catalog)}@OData.Community.Display.V1.FormattedValue`]: remoteOp,
  } })) }))
  mocks.save.mockImplementation(async (field: CatalogField, recordId: string, value: unknown, option?: { label: string }) => {
    if (field.type === 'Money') remoteAmount = Number(value)
    else remoteOp = option!.label
    return { table: field.table, recordId, attribute: field.attribute, value, formatted: option?.label }
  })
})
afterEach(cleanup)

/** Troca de visão pelo seletor da `ViewBar` (título da lista). */
async function openView(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Visão: / }))
  // As visões chegam depois da abertura: o menu aberto recebe o item quando elas chegam. O jsdom não abre o
  // `popover`, então o item conta como oculto para a árvore de acessibilidade.
  fireEvent.click(await screen.findByRole('menuitemradio', { name, hidden: true }, { timeout: 5000 }))
}

async function open() {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getByRole('button', { name: /^Visão: / })).toBeTruthy())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveProperty('disabled', false))
  await openView('Campos externos')
  await waitFor(() => expect(mocks.load.mock.calls.some(([, query]) => query?.id === 'test')).toBe(true))
  await waitFor(() => expect(screen.getAllByLabelText('Valor externo: 50')).toHaveLength(2))
}

it('atualiza todas as linhas do mesmo registro relacionado sem recarregar a grade por um valor', async () => {
  await open()
  const requests = mocks.load.mock.calls.length
  fireEvent.doubleClick(screen.getAllByLabelText('Valor externo: 50')[0])
  fireEvent.change(screen.getByRole('textbox', { name: 'Editar Valor externo' }), { target: { value: '123,45' } })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar Valor externo' }), { key: 'Enter' })
  await waitFor(() => expect(screen.getAllByLabelText('Valor externo: 123.45')).toHaveLength(2))
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ table: 'reservation' }), guid, 123.45, undefined)
  expect(mocks.load).toHaveBeenCalledTimes(requests)
})

it('reconsulta a relação após trocar lookup e espera o outro rascunho terminar', async () => {
  await open()
  const requests = mocks.load.mock.calls.length
  fireEvent.click(screen.getAllByRole('button', { name: 'Escolher OP externa' })[0])
  fireEvent.click(await screen.findByRole('option', { name: 'OP nova' }))
  fireEvent.doubleClick(screen.getAllByLabelText('Valor externo: 50')[1])
  fireEvent.change(screen.getByRole('textbox', { name: 'Editar Valor externo' }), { target: { value: '789,00' } })
  expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveProperty('disabled', true)
  await waitFor(() => expect(screen.getAllByLabelText('OP externa: OP nova')).toHaveLength(2))
  await new Promise((resolve) => setTimeout(resolve, 350))
  expect(mocks.load).toHaveBeenCalledTimes(requests)
  expect(screen.getByRole('textbox', { name: 'Editar Valor externo' })).toHaveProperty('value', '789,00')
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar Valor externo' }), { key: 'Escape' })
  await waitFor(() => expect(mocks.load.mock.calls.length).toBeGreaterThan(requests))
})
