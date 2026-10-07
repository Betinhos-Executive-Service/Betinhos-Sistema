// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PagantesPage } from './PagantesPage'
import { VIEWS_KEY } from './domain/filters'

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const openRow = async (code: string) => fireEvent.click((await screen.findByText(code)).closest('button')!)

describe('Pagantes', () => {
  it('lista no mock, abre a ficha com rateio e marca como pago com recibo', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await openRow('PAG-1201')

    const ficha = await screen.findByRole('dialog', { name: 'Mariana Albuquerque' })
    expect(within(ficha).getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5511998124410/)
    expect(await within(ficha).findByText(/2 parcelas/)).toBeTruthy()

    fireEvent.click(within(ficha).getByRole('button', { name: 'Marcar como pago' }))
    const confirm = await screen.findByRole('dialog', { name: /Marcar Mariana Albuquerque/ })
    expect(within(confirm).getByRole('checkbox', { name: /Gerar e enviar o recibo/ })).toHaveProperty('checked', true)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Marcar como pago' }))

    expect(await screen.findByText(/marcado como pago\. O recibo entra na fila/)).toBeTruthy()
    await waitFor(() => expect(within(ficha).getByText(/status não pode mais ser alterado/)).toBeTruthy())
    expect(within(ficha).getByRole('button', { name: 'Gerar recibo' })).toBeTruthy()
  })

  it('salva a visão atual no navegador', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await screen.findByText('PAG-1201')
    fireEvent.click(screen.getByLabelText('Só com falha de envio'))
    expect(screen.queryByText('PAG-1201')).toBeNull()
    expect(screen.getByText('PAG-1204')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Visões' }))
    fireEvent.click(await screen.findByText('Salvar filtros como visão'))
    fireEvent.change(await screen.findByLabelText(/Nome da visão/), { target: { value: 'Falhas da semana' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar visão' }))

    expect(await screen.findByText(/Visão “Falhas da semana” salva/)).toBeTruthy()
    const stored = JSON.parse(window.localStorage.getItem(VIEWS_KEY)!)
    expect(stored.views[0]).toMatchObject({ nome: 'Falhas da semana', filters: { falhas: true } })
    expect(stored.last).toBe(stored.views[0].id)
  })
})
