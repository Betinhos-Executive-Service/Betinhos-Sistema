// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpsPage } from './OpsPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const openRow = async (code: string) => fireEvent.click((await screen.findByText(code)).closest('button')!)

describe('Ordens de Pagamento', () => {
  it('abre a ficha com rateio e bloqueia cancelar OP com pagamento confirmado', async () => {
    render(<OpsPage host={{ mode: 'mock' }} />)
    await openRow('OP-401')
    const ficha = await screen.findByRole('dialog', { name: 'OP-401' })
    expect(await within(ficha).findByText(/2 parcelas ativas/)).toBeTruthy()
    expect(within(ficha).getByText('Mariana Albuquerque')).toBeTruthy()
    expect(within(ficha).getByText(/Há pagamento confirmado/)).toBeTruthy()
    expect(within(ficha).getByRole('button', { name: 'Cancelar OP' })).toHaveProperty('disabled', true)
  })

  it('cancela OP sem pagantes depois de confirmar', async () => {
    render(<OpsPage host={{ mode: 'mock' }} />)
    await openRow('OP-412')
    const ficha = await screen.findByRole('dialog', { name: 'OP-412' })
    expect(await within(ficha).findByText(/Nenhum pagante gerado/)).toBeTruthy()
    const cancelar = within(ficha).getByRole('button', { name: 'Cancelar OP' })
    await waitFor(() => expect(cancelar).toHaveProperty('disabled', false))
    fireEvent.click(cancelar)

    const confirm = await screen.findByRole('dialog', { name: /Cancelar a OP-412/ })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar OP' }))
    expect(await screen.findByText('OP-412 cancelada.')).toBeTruthy()
    await waitFor(() => expect(within(ficha).getByText('OP cancelada')).toBeTruthy())
    expect(within(ficha).queryByRole('button', { name: 'Cancelar OP' })).toBeNull()
  })

  it('filtra pela visão Pagas', async () => {
    render(<OpsPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-401')
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    fireEvent.click(await screen.findByText('Pagas'))
    await waitFor(() => expect(screen.queryByText('OP-401')).toBeNull())
    expect(screen.getByText('OP-404')).toBeTruthy()
  })
})
