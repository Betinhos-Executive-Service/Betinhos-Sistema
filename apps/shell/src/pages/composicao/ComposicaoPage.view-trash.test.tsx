// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { defaultViewDefinition } from './data/views'
import { loadMockViews, saveMockView } from './data/mock-views'
import { ComposicaoPage } from './ComposicaoPage'

beforeEach(() => {
  window.localStorage.clear()
  saveMockView('Minhas pendentes', 'personal', defaultViewDefinition([]))
})
afterEach(cleanup)

it('lixeira de uma visão pessoal não ativa pede confirmação e exclui sem abrir a visão', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  const selector = await screen.findByRole('button', { name: /^Visão: / })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveProperty('disabled', false))
  fireEvent.click(selector)
  const trash = await screen.findByRole('button', { name: 'Excluir “Minhas pendentes”', hidden: true }, { timeout: 5000 })
  fireEvent.click(trash)
  expect(screen.getByText(/A visão “Minhas pendentes” será excluída/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Excluir visão', hidden: true })) })
  await waitFor(() => expect(loadMockViews()).toHaveLength(0))
  expect(screen.queryByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true })).toBeNull()
  expect(selector.textContent).not.toMatch(/Minhas pendentes/)
})
