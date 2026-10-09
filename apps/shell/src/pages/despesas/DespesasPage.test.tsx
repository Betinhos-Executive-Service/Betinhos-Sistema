// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DespesasPage } from './DespesasPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Despesas operacionais', () => {
  it('abre a ficha com vínculos e comprovantes, sem ações de escrita', async () => {
    render(<DespesasPage host={{ mode: 'mock' }} />)
    const linhas = await screen.findAllByText('Posto Shell Faria Lima')
    fireEvent.click(linhas[0].closest('button')!)
    const ficha = await screen.findByRole('dialog', { name: 'Posto Shell Faria Lima' })
    expect(within(ficha).getByText('Carlos Oliveira', { selector: 'dd' })).toBeTruthy()
    expect(await within(ficha).findByText('painel-km.jpg')).toBeTruthy()
    expect(within(ficha).getAllByRole('link', { name: /Abrir/ }).length).toBeGreaterThan(0)
    expect(within(ficha).queryByRole('button', { name: /Validar|Pagar|Cancelar|Salvar/ })).toBeNull()
  })

  it('a visão Possível duplicidade mostra só as marcadas', async () => {
    render(<DespesasPage host={{ mode: 'mock' }} />)
    await screen.findAllByText('Posto Shell Faria Lima')
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    const opcao = await waitFor(() => {
      const el = screen.getAllByText('Possível duplicidade').map((e) => e.closest('[role="option"]')).find(Boolean)
      if (!el) throw new Error('opção não apareceu')
      return el
    })
    fireEvent.click(opcao)
    await waitFor(() => expect(screen.getAllByRole('row').length).toBe(3))
  })
})
