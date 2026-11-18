// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { flexRender } from '@tanstack/react-table'
import { ComposicaoPage } from './ComposicaoPage'

vi.mock('@tanstack/react-table', async (original) => {
  const actual = await original<typeof import('@tanstack/react-table')>()
  return { ...actual, flexRender: vi.fn(actual.flexRender) }
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('seleção e digitação não renderizam as outras composições', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await screen.findByText('18 registros')
  await act(async () => {})
  const bodyCells = document.querySelectorAll('.price-grid tbody td').length
  const rowCells = document.querySelectorAll('.price-grid tbody tr:first-child td').length
  fireEvent.pointerDown(screen.getByLabelText(/Aurora Logística, Hora motorista:/), { button: 0 })
  await waitFor(() => expect(screen.getByLabelText(/Aurora Logística, Hora motorista:/).className).toContain('money-cell--selected'))
  vi.mocked(flexRender).mockClear()
  fireEvent.pointerDown(screen.getByLabelText(/Horizonte Sistemas, Hora motorista:/), { button: 0 })
  expect(flexRender).toHaveBeenCalledTimes(rowCells * 2)
  expect(vi.mocked(flexRender).mock.calls.length).toBeLessThan(bodyCells)
  fireEvent.doubleClick(screen.getByLabelText(/Horizonte Sistemas, Hora motorista:/))
  const editor = screen.getByRole('textbox', { name: 'Editar Hora motorista' })
  vi.mocked(flexRender).mockClear()
  fireEvent.change(editor, { target: { value: '=100+50' } })
  expect(flexRender).toHaveBeenCalledTimes(rowCells)
  expect(editor).toHaveProperty('value', '=100+50')
  fireEvent.keyDown(editor, { key: 'Escape' })
  expect(screen.queryByRole('textbox', { name: 'Editar Hora motorista' })).toBeNull()
  expect(screen.getByLabelText(/Horizonte Sistemas, Hora motorista: R\$\s*69,00/)).toBeTruthy()
})
