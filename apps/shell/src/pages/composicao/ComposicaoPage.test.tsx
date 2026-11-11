// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = '' })

const codigos = () => [...document.querySelectorAll('.cp-open strong')].map((e) => e.textContent)

describe('Composição de Preço', () => {
  it('lista por data de saída decrescente, busca e ordena por coluna da Reserva', async () => {
    render(<ComposicaoPage host={{ mode: 'mock' }} />)
    await screen.findAllByText('CP-1003')
    expect(codigos()[0]).toBe('CP-1003')

    // O título da coluna abre o menu; só na linha de títulos (pela tela inteira o getByRole é lento).
    const header = document.querySelector('[role="columnheader"]')?.closest<HTMLElement>('[role="row"]') as HTMLElement
    fireEvent.click(within(header).getByRole('button', { name: /^Cliente$/, hidden: true }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ordenar A→Z', hidden: true }))
    // Embraer (CP-1003 e CP-1004) vem primeiro; sem sort por cliente a ordem seria 1003, 1001.
    await waitFor(() => expect(new Set(codigos().slice(0, 2))).toEqual(new Set(['CP-1003', 'CP-1004'])))

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar composições' }), { target: { value: 'congonhas' } })
    await waitFor(() => expect(codigos()).toEqual(['CP-1003']))
    expect(within(document.querySelector('.cp-table') as HTMLElement).getByText('1 de 6')).toBeTruthy()
  })
})
