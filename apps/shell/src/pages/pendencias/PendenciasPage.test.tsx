// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendenciasPage } from './PendenciasPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = '#/pendencias'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const rows = () => document.querySelectorAll('.pg-open').length

describe('Pendências', () => {
  it('mostra as 4 pendências do mock e filtra pela visão Rateio', async () => {
    render(<PendenciasPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-501')
    expect(rows()).toBe(4)
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    await waitFor(() => expect(screen.getAllByText('Rateio').length).toBeGreaterThan(1))
    fireEvent.click(screen.getAllByText('Rateio').find((el) => !el.closest('.bt-button'))!)
    await waitFor(() => expect(rows()).toBe(1))
    expect(screen.getByText('OP-505')).toBeTruthy()
  })

  it('abre a ficha da pendência', async () => {
    render(<PendenciasPage host={{ mode: 'mock' }} />)
    fireEvent.click((await screen.findByText('OP-501')).closest('button')!)
    const ficha = await screen.findByRole('dialog', { name: 'OP-501' })
    expect(within(ficha).getByText('RES-701')).toBeTruthy()
    expect(within(ficha).getByRole('button', { name: 'Corrigir' })).toBeTruthy()
  })
})
