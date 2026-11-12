// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'

const save = vi.hoisted(() => vi.fn())
vi.mock('./data/dataverse', async (original) => ({
  ...await original<typeof import('./data/dataverse')>(),
  applyCompositionCellInput: save,
}))

afterEach(() => { cleanup(); save.mockReset() })

it('serializa colagens em duas células da mesma composição e atualiza a grade', async () => {
  let finishFirst!: (value: unknown) => void
  save.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
    .mockImplementationOnce(async (row) => ({ rowId: row.id, rowVersion: 'v3', updatedValues: { cr40f_valortempodeespera: '30.00' }, formulas: {} }))

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await screen.findByLabelText(/Aurora Logística, Hora motorista:/)
  // Use o nó atual: o catálogo inicial pode substituir o retornado por findBy.
  const first = screen.getByLabelText(/Aurora Logística, Hora motorista:/)
  expect(first.isConnected).toBe(true)
  fireEvent.paste(first, { clipboardData: { getData: () => '20' } })
  fireEvent.paste(screen.getByLabelText(/Aurora Logística, Tempo de espera:/), { clipboardData: { getData: () => '30' } })
  expect(save).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.getAllByRole('status', { name: 'Salvando' })).toHaveLength(2))
  expect(screen.getByLabelText(/Aurora Logística, Hora motorista: R\$\s*20,00/)).toBeTruthy()
  expect(screen.getByLabelText(/Aurora Logística, Tempo de espera: R\$\s*30,00/)).toBeTruthy()

  await act(async () => { finishFirst({ rowId: save.mock.calls[0][0].id, rowVersion: 'v2', updatedValues: { cr40f_valorhoramotorista: '20.00' }, formulas: {} }) })
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1][0]).toMatchObject({ rowVersion: 'v2', values: { cr40f_valorhoramotorista: '20.00' } })
  await waitFor(() => {
    expect(screen.getByLabelText(/Aurora Logística, Hora motorista: R\$\s*20,00/)).toBeTruthy()
    expect(screen.getByLabelText(/Aurora Logística, Tempo de espera: R\$\s*30,00/)).toBeTruthy()
  })
})

it('desfaz o valor otimista no erro e guarda o rascunho para nova tentativa', async () => {
  let failSave!: (reason: unknown) => void
  save.mockImplementationOnce(() => new Promise((_resolve, reject) => { failSave = reject }))
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await screen.findByLabelText(/Aurora Logística, Hora motorista:/)
  const cell = screen.getByLabelText(/Aurora Logística, Hora motorista:/)
  expect(cell.isConnected).toBe(true)
  const previousLabel = cell.getAttribute('aria-label')
  fireEvent.paste(cell, { clipboardData: { getData: () => '45,45' } })
  await waitFor(() => expect(screen.getByLabelText(/Aurora Logística, Hora motorista: R\$\s*45,45/)).toBeTruthy())
  expect(screen.getByRole('status', { name: 'Salvando' })).toBeTruthy()

  await act(async () => { failSave({ message: 'Acesso negado ao registro.' }) })

  expect(await screen.findByRole('status', { name: 'Acesso negado ao registro.' })).toBeTruthy()
  const revertedCell = screen.getByLabelText(/Aurora Logística, Hora motorista:/)
  expect(revertedCell.getAttribute('aria-label')).toBe(previousLabel)
  fireEvent.doubleClick(revertedCell)
  expect(screen.getByRole('textbox', { name: 'Editar Hora motorista' })).toHaveProperty('value', '45,45')
})
