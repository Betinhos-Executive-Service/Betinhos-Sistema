// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { initialCompositions } from './data/compositions'
import { viewValueKey, type CatalogField, type SavedView } from './data/views'
import { ComposicaoPage } from './ComposicaoPage'

const mocks = vi.hoisted(() => ({ load: vi.fn() }))
const guid = '11111111-2222-4333-8444-555555555555'
const catalog: CatalogField[] = ['Money', 'Lookup'].map((type, index) => ({ id: `external${index}`, table: 'reservation', attribute: `field${index}`, primaryIdAttribute: 'reservationid', path: ['reservation'], relationships: [{ from: 'reservationid', to: 'reservationlookup' }], label: index ? 'OP externa' : 'Valor externo', type, available: true, writable: true }))
const view: SavedView = { id: 'test', kind: 'personal', name: 'Campos externos', managed: true, definition: { columns: catalog.map((field) => ({ id: field.id, width: 160, pinned: false })), filters: [], sort: [] } }
vi.mock('./data/dataverse', async (original) => ({ ...await original<typeof import('./data/dataverse')>(), loadCompositions: mocks.load, getDataverseEnvironmentLabel: () => 'DEV' }))
vi.mock('./data/views', async (original) => ({ ...await original<typeof import('./data/views')>(), loadColumnCatalog: async () => catalog, loadViews: async () => [view], buildViews: () => [view], fetchViewRows: async () => ({ personal: [], publicViews: [], pins: [] }) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockImplementation(async () => ({ source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()), records: initialCompositions.slice(0, 2).map((row) => ({ ...row, viewFields: {
    'r1.reservationid': guid,
    [viewValueKey(catalog[0].id, view.definition, catalog)]: 50,
    [viewValueKey(catalog[1].id, view.definition, catalog)]: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  } })) }))
})
afterEach(cleanup)

/** Troca de visão pelo seletor da `ViewBar` (título da lista). */
async function openView(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Visão: / }))
  // As visões chegam depois da abertura: o menu aberto recebe o item quando elas chegam. O jsdom não abre o
  // `popover`, então o item conta como oculto para a árvore de acessibilidade.
  fireEvent.click(await screen.findByRole('menuitemradio', { name, hidden: true }, { timeout: 5000 }))
}

it('escolher de novo a view já ativa mantém as linhas e não deixa o carregamento preso', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getByRole('button', { name: /^Visão: / })).toBeTruthy())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveProperty('disabled', false))
  await openView('Campos externos')
  await waitFor(() => expect(screen.getAllByLabelText('Valor externo: 50')).toHaveLength(2))
  const requests = mocks.load.mock.calls.length
  await openView('Campos externos')
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(screen.getAllByLabelText('Valor externo: 50')).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveProperty('disabled', false)
  expect(mocks.load).toHaveBeenCalledTimes(requests)
})
