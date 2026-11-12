// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'

afterEach(cleanup)

it('mostra somente o resultado da exclusão após atualizar a grade local', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await screen.findByRole('checkbox', { name: 'Selecionar Aurora Logística' })
  // O catálogo pode remontar as células entre findBy resolver e o teste continuar.
  const selection = screen.getByRole('checkbox', { name: 'Selecionar Aurora Logística' }) as HTMLInputElement
  expect(selection.isConnected).toBe(true)
  fireEvent.click(selection)
  expect(screen.getByRole('checkbox', { name: 'Selecionar Aurora Logística' })).toHaveProperty('checked', true)
  const exclude = screen.getByRole('button', { name: 'Excluir' })
  expect(exclude).toHaveProperty('disabled', false)
  fireEvent.click(exclude)
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir 1' }))

  expect(await screen.findByText('17 registros')).toBeTruthy()
  expect(await screen.findByText(/^Composições excluídas\./)).toBeTruthy()
  expect(screen.queryByText(/Dados atualizados/)).toBeNull()
})
