// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { Funcionarios } from '../FuncionariosPage'
import { createMockSource } from '../data/mock'

beforeAll(() => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('layout mobile', () => {
  it('mostra lista em cartões, filtros rápidos e botão Novo', async () => {
    render(<ToastProvider><Funcionarios source={createMockSource()} /></ToastProvider>)
    expect(await screen.findByRole('button', { name: /Carlos Alberto Teste/ }, { timeout: 4000 })).toBeTruthy()
    expect(document.querySelector('table')).toBeNull()
    expect(screen.getByRole('button', { name: 'Novo' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Desligado/ }))
    expect(await screen.findByRole('button', { name: /Gustavo Amostra Pires/ })).toBeTruthy()
  })

  it('painel de filtros aplica função e mostra contagem', async () => {
    render(<ToastProvider><Funcionarios source={createMockSource()} /></ToastProvider>)
    await screen.findByRole('button', { name: /Carlos Alberto Teste/ }, { timeout: 4000 })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Filtros/ })) })
    const sheet = screen.getByRole('dialog', { name: 'Filtros' })
    await act(async () => { fireEvent.click(Array.from(sheet.querySelectorAll('button')).find((b) => b.textContent === 'Administrativo')!) })
    const cta = Array.from(sheet.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Ver '))!
    expect(cta.textContent).toBe('Ver 2 colaboradores')
    await act(async () => { fireEvent.click(cta) })
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Carlos Alberto Teste/ })).toBeNull()
  })
})
