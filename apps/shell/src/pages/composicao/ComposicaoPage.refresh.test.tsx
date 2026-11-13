// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { initialCompositions } from './data/compositions'
import { ComposicaoPage } from './ComposicaoPage'

const load = vi.hoisted(() => vi.fn())
vi.mock('./data/dataverse', async (original) => ({
  ...await original<typeof import('./data/dataverse')>(),
  loadCompositions: load,
  getDataverseEnvironmentLabel: () => 'DEV',
}))
vi.mock('./data/views', async (original) => ({
  ...await original<typeof import('./data/views')>(),
  loadColumnCatalog: async () => [
    { id: 'client', label: 'Cliente', table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', path: ['cr40f_reservadeveiculos', 'cr40f_clientes1'], relationships: [{ from: 'cr40f_reservadeveiculosid', to: 'cr40f_servicorelacionadogeral' }, { from: 'cr40f_clientes1id', to: 'cr40f_cliente' }], type: 'String', available: true },
    { id: 'route', label: 'Rota', table: 'cr40f_reservadeveiculos', attribute: 'cr40f_trajeto', path: ['cr40f_reservadeveiculos'], relationships: [{ from: 'cr40f_reservadeveiculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'String', available: true },
  ],
  loadViews: async () => [], buildViews: () => [], fetchViewRows: async () => ({ personal: [], publicViews: [], pins: [] }),
}))

afterEach(() => { cleanup(); load.mockReset() })

it('ignora resposta antiga de Atualizar após mudar a busca', async () => {
  let finishRefresh!: (page: unknown) => void
  let deferRefresh = false
  load.mockImplementation((_link, view) => {
    if (view?.fetchXml?.includes('%Horizonte%')) return Promise.resolve({ records: [initialCompositions[1]], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) })
    if (deferRefresh) return new Promise((resolve) => { finishRefresh = resolve })
    return Promise.resolve({ records: [initialCompositions[0]], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) })
  })

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  expect(await screen.findByText('1 registro')).toBeTruthy()
  await waitFor(() => expect((screen.getByRole('searchbox', { name: 'Buscar cliente ou trajeto' }) as HTMLInputElement).disabled).toBe(false))

  deferRefresh = true
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  await waitFor(() => expect(finishRefresh).toBeTypeOf('function'))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cliente ou trajeto' }), { target: { value: 'Horizonte' } })
  await waitFor(() => expect(load.mock.calls.some(([, view]) => view?.fetchXml?.includes('%Horizonte%'))).toBe(true))
  expect(await screen.findByText('Horizonte Sistemas')).toBeTruthy()

  await act(async () => { finishRefresh({ records: [initialCompositions[0]], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) }) })
  expect(screen.getByText('Horizonte Sistemas')).toBeTruthy()
  expect(screen.queryByText('Aurora Logística')).toBeNull()
})
