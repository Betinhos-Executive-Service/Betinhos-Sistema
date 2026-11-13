// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'

afterEach(cleanup)

it('abre em modo local sem contexto Xrm', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getByText(/Modo local · 18 registros de demonstração/)).toBeTruthy())
  expect(screen.getByRole('region', { name: 'Tabela de composições' })).toBeTruthy()
})

it('permite zerar uma busca sem resultados e recuperar as composições', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  expect(await screen.findByText('18 registros')).toBeTruthy()

  const search = screen.getByRole('searchbox', { name: 'Buscar cliente ou trajeto' }) as HTMLInputElement
  fireEvent.change(search, { target: { value: 'cliente inexistente xyz' } })
  expect(await screen.findByText('Nenhum resultado para os filtros atuais')).toBeTruthy()
  expect(screen.getByText('0 registros')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Zerar filtros' }))
  expect(search.value).toBe('')
  expect(await screen.findByText('18 registros')).toBeTruthy()
})
