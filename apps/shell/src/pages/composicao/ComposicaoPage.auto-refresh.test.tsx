// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { initialCompositions } from './data/compositions'
import { ComposicaoPage } from './ComposicaoPage'

const AUTO_REFRESH_INTERVAL = 30_000

const load = vi.hoisted(() => vi.fn())
vi.mock('./data/dataverse', async (original) => ({
  ...await original<typeof import('./data/dataverse')>(),
  loadCompositions: load,
  getDataverseEnvironmentLabel: () => 'DEV',
}))
vi.mock('./data/views', async (original) => ({
  ...await original<typeof import('./data/views')>(),
  loadColumnCatalog: async () => [],
  loadViews: async () => [], buildViews: () => [], fetchViewRows: async () => ({ personal: [], publicViews: [], pins: [] }),
}))

const row = (diaria: string) => {
  const base = initialCompositions[0]
  return { ...base, values: { ...base.values, cr40f_valordadiaria: diaria } }
}
const page = (diaria: string) => ({ records: [row(diaria)], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) })

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => {
  cleanup()
  load.mockReset()
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

it('relê as composições a cada 30 segundos e mostra o valor gravado por outra pessoa', async () => {
  load.mockResolvedValueOnce(page('100.00')).mockResolvedValue(page('250.00'))
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getAllByText('R$ 100,00').length).toBeGreaterThan(0))
  const calls = load.mock.calls.length

  await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL) })
  await waitFor(() => expect(screen.getAllByText('R$ 250,00').length).toBeGreaterThan(0))
  expect(load.mock.calls.length).toBe(calls + 1)
  expect(screen.queryByText('Dados atualizados')).toBeNull()
})

it('não relê com a aba em segundo plano', async () => {
  load.mockResolvedValue(page('100.00'))
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getAllByText('R$ 100,00').length).toBeGreaterThan(0))
  const calls = load.mock.calls.length
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })

  await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL * 2) })
  expect(load.mock.calls.length).toBe(calls)
})

it('não trava a tela enquanto a releitura automática busca os dados', async () => {
  let finishBackground: (value: unknown) => void = () => undefined
  load.mockResolvedValueOnce(page('100.00'))
    .mockReturnValueOnce(new Promise((resolve) => { finishBackground = resolve }))
    .mockResolvedValue(page('300.00'))
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getAllByText('R$ 100,00').length).toBeGreaterThan(0))
  await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL) })
  const calls = load.mock.calls.length

  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  await waitFor(() => expect(screen.getAllByText('R$ 300,00').length).toBeGreaterThan(0))
  expect(load.mock.calls.length).toBe(calls + 1)

  await act(async () => { finishBackground(page('250.00')) })
  expect(screen.queryAllByText('R$ 250,00')).toHaveLength(0)
})
