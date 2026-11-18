// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'

// Teste da grade: a linha de comando real (ViewBar do DS) mantém o painel de colunas montado mesmo fechado, e as consultas
// por papel ficam ~5x mais lentas no jsdom. Os comandos têm testes próprios (ComposicaoPage.commands/view-bar).
vi.mock('./components/CompositionCommandLine', () => ({ CompositionCommandLine: () => null }))

afterEach(cleanup)

it('separa seleção de edição, preserva setas no texto e avança após Enter', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  const cell = await screen.findByLabelText(/Aurora Logística, Hora motorista:/)
  fireEvent.pointerDown(cell, { button: 0 })
  expect(screen.queryByRole('textbox', { name: 'Editar Hora motorista' })).toBeNull()
  fireEvent.keyDown(screen.getByLabelText(/Aurora Logística, Hora motorista:/), { key: 'F2' })
  const editor = await screen.findByRole('textbox', { name: 'Editar Hora motorista' })
  fireEvent.keyDown(editor, { key: 'ArrowLeft' })
  expect(screen.getByRole('textbox', { name: 'Editar Hora motorista' })).toBeTruthy()

  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar Hora motorista' }), { key: 'Enter' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Horizonte Sistemas, Hora motorista:/)))
  fireEvent.keyDown(screen.getByLabelText(/Horizonte Sistemas, Hora motorista:/), { key: 'ArrowUp' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Aurora Logística, Hora motorista:/)))
  fireEvent.keyDown(screen.getByLabelText(/Aurora Logística, Hora motorista:/), { key: 'ArrowRight' })
  const nextCell = screen.getByLabelText(/Aurora Logística, Tempo de espera:/)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Aurora Logística, Tempo de espera:/)))

  fireEvent.keyDown(nextCell, { key: '1' })
  const nextEditor = await screen.findByRole('textbox', { name: 'Editar Tempo de espera' }) as HTMLInputElement
  expect(nextEditor.value).toBe('1')
  expect(nextEditor.selectionStart).toBe(1)
  fireEvent.keyDown(nextEditor, { key: 'ArrowLeft' })
  expect(screen.getByRole('textbox', { name: 'Editar Tempo de espera' })).toBe(nextEditor)
  fireEvent.change(nextEditor, { target: { value: '12' } })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar Tempo de espera' }), { key: 'Enter' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Horizonte Sistemas, Tempo de espera:/)))
  await waitFor(() => expect(screen.getByLabelText(/Aurora Logística, Tempo de espera: R\$\s*12,00/)).toBeTruthy())

  fireEvent.keyDown(screen.getByLabelText(/Horizonte Sistemas, Tempo de espera:/), { key: 'ArrowUp' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Aurora Logística, Tempo de espera:/)))
  fireEvent.keyDown(screen.getByLabelText(/Aurora Logística, Tempo de espera:/), { key: 'ArrowDown' })
  const lowerCell = screen.getByLabelText(/Horizonte Sistemas, Tempo de espera:/)
  await waitFor(() => expect(document.activeElement).toBe(lowerCell))
  fireEvent.keyDown(lowerCell, { key: 'ArrowUp' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Aurora Logística, Tempo de espera:/)))

  fireEvent.keyDown(screen.getByLabelText(/Aurora Logística, Tempo de espera:/), { key: '7' })
  fireEvent.pointerDown(screen.getByLabelText(/Aurora Logística, Diária:/), { button: 0 })
  expect(screen.queryByRole('textbox', { name: 'Editar Diária' })).toBeNull()
  fireEvent.doubleClick(screen.getByLabelText(/Aurora Logística, Diária:/))
  expect(await screen.findByRole('textbox', { name: 'Editar Diária' })).toBeTruthy()
  await waitFor(() => expect(screen.getByLabelText(/Aurora Logística, Tempo de espera: R\$\s*7,00/)).toBeTruthy())
})
