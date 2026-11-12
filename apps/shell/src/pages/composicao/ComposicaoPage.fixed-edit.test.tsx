// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { initialCompositions } from './data/compositions'
import type { CatalogField } from './data/views'
import { ComposicaoPage } from './ComposicaoPage'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), catalog: vi.fn() }))
const serviceId = '11111111-2222-4333-8444-555555555555'
const clientId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const source: CatalogField[] = [['cr40f_cliente', 'Lookup'], ['cr40f_trajeto', 'String'], ['cr40f_dataehorriodesada', 'DateTime']].map(([attribute, type]) => ({ id: attribute, label: attribute, attribute, type, table: 'cr40f_reservadeveculos', path: ['cr40f_reservadeveculos'], primaryIdAttribute: 'cr40f_reservadeveculosid', relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], available: true, writable: true }))
source.push({ ...source[1], id: 'route', label: 'Trajeto' }, { id: 'client', label: 'Cliente', table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', type: 'String', available: true, path: ['cr40f_reservadeveculos', 'cr40f_clientes1'], relationships: [...source[0].relationships!, { from: 'cr40f_clientes1id', to: 'cr40f_cliente' }] })
vi.mock('./data/dataverse', async (original) => ({ ...await original<typeof import('./data/dataverse')>(), loadCompositions: mocks.load, getDataverseEnvironmentLabel: () => 'DEV' }))
vi.mock('./data/views', async (original) => ({ ...await original<typeof import('./data/views')>(), loadColumnCatalog: mocks.catalog, loadViews: async () => [], buildViews: () => [], fetchViewRows: async () => ({ personal: [], publicViews: [], pins: [] }) }))
vi.mock('./data/related-field-edit', async (original) => ({ ...await original<typeof import('./data/related-field-edit')>(), saveRelatedField: mocks.save, lookupOptions: async () => [{ value: clientId, label: 'Novo cliente', navigation: 'cr40f_cliente', entitySet: 'cr40f_clientes1s' }], dateFieldConfig: async () => ({ behavior: 'UserLocal', dateOnly: false }) }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.catalog.mockResolvedValue(source)
  mocks.load.mockResolvedValue({ source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()), records: [{ ...initialCompositions[0], serviceId, clientId: null, client: 'Cliente atual', route: 'Trajeto atual', departureAt: '2026-09-30T15:30:00Z' }] })
  mocks.save.mockImplementation(async (field: CatalogField, recordId: string, value: unknown, option?: { label: string }) => ({ table: field.table, attribute: field.attribute, recordId, value, formatted: option?.label }))
})
afterEach(cleanup)

it('aguarda a metadata e exibe os campos editáveis já na primeira carga, com horário na Data', async () => {
  let resolveCatalog!: (fields: CatalogField[]) => void
  mocks.catalog.mockReturnValueOnce(new Promise<CatalogField[]>((resolve) => { resolveCatalog = resolve }))
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  expect(mocks.load).not.toHaveBeenCalled()
  await act(async () => { resolveCatalog(source) })
  const cell = await screen.findByLabelText('Data: 2026-09-30T15:30:00Z')
  expect(cell.textContent).toContain('12:30')
  expect(cell.dataset.gridEditable).toBe('true')
  expect(screen.getByLabelText('Cliente: Cliente atual').dataset.gridEditable).toBe('true')
  expect(screen.getByLabelText('Trajeto: Trajeto atual').dataset.gridEditable).toBe('true')
  expect(mocks.catalog).toHaveBeenCalledTimes(1)
  expect(mocks.load).toHaveBeenCalledTimes(1)
})

it('duplo clique no Cliente abre lookup e grava na reserva, sem renomear o cadastro do cliente', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await screen.findByLabelText('Cliente: Cliente atual')
  await act(async () => {})
  const cell = screen.getByLabelText('Cliente: Cliente atual')
  expect(cell.dataset.gridEditable).toBe('true')
  fireEvent.doubleClick(cell.querySelector('span[title]')!)
  fireEvent.click(await screen.findByRole('option', { name: 'Novo cliente' }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ table: 'cr40f_reservadeveculos', attribute: 'cr40f_cliente' }), serviceId, clientId, expect.objectContaining({ navigation: 'cr40f_cliente' })))
})

it('duplo clique no Trajeto edita o texto e mantém o resultado na coluna fixa', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await screen.findByLabelText('Trajeto: Trajeto atual')
  await act(async () => {})
  const cell = screen.getByLabelText('Trajeto: Trajeto atual')
  expect(cell.dataset.gridEditable).toBe('true')
  expect(screen.getByRole('button', { name: /^Trajeto$/ })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Rota$/ })).toBeNull()
  fireEvent.doubleClick(cell.querySelector('span[title]')!)
  const input = screen.getByRole('textbox', { name: 'Editar Trajeto' })
  fireEvent.change(input, { target: { value: 'Aeroporto → Hotel' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ attribute: 'cr40f_trajeto' }), serviceId, 'Aeroporto → Hotel', undefined))
  expect(await screen.findByLabelText('Trajeto: Aeroporto → Hotel')).toBeTruthy()
})

it('duplo clique na Data edita a saída da reserva, mantendo limite de quatro dígitos no ano', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await screen.findByLabelText('Data: 2026-09-30T15:30:00Z')
  await act(async () => {})
  const cell = screen.getByLabelText('Data: 2026-09-30T15:30:00Z')
  expect(cell.dataset.gridEditable).toBe('true')
  fireEvent.doubleClick(cell.querySelector('span[title]')!)
  const input = screen.getByLabelText('Editar Data') as HTMLInputElement
  await waitFor(() => expect(input.disabled).toBe(false))
  expect(input.max).toBe('9999-12-31T23:59')
  fireEvent.input(input, { target: { value: '2026-10-01T09:45' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ table: 'cr40f_reservadeveculos', attribute: 'cr40f_dataehorriodesada' }), serviceId, new Date('2026-10-01T09:45').toISOString(), undefined))
})
