// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PagantesPage } from './PagantesPage'
import { VIEWS_KEY } from './domain/filters'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta e 1 s de espera não basta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

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

    const salvar = async (nome: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Visões' }))
      fireEvent.click(await screen.findByText('Salvar filtros como visão'))
      fireEvent.change(await screen.findByLabelText(/Nome da visão/), { target: { value: nome } })
      fireEvent.click(screen.getByRole('button', { name: 'Salvar visão' }))
    }

    // Mesmos filtros de uma visão pronta: não duplica.
    await salvar('Falhas')
    expect(await screen.findByText(/já estão na visão “Com falha de envio”/)).toBeTruthy()
    expect(window.localStorage.getItem(VIEWS_KEY) ?? '').not.toContain('Falhas"')

    fireEvent.click(screen.getByRole('combobox', { name: 'Período de criação' }))
    fireEvent.click(await screen.findByText('Todo o período'))
    await salvar('Falhas desde sempre')

    expect(await screen.findByText(/Visão “Falhas desde sempre” salva/)).toBeTruthy()
    const stored = JSON.parse(window.localStorage.getItem(VIEWS_KEY)!)
    expect(stored.views[0]).toMatchObject({ nome: 'Falhas desde sempre', filters: { falhas: true, periodo: 'all' } })
    expect(stored.last).toBe(stored.views[0].id)
  })

  it('pagante sem pessoa: ficha pelo código, aviso e recibo automático bloqueado', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await openRow('PAG-1212')
    const ficha = await screen.findByRole('dialog', { name: 'PAG-1212' })
    expect(within(ficha).getByText('Pagante sem pessoa vinculada', { selector: '*' })).toBeTruthy()
    expect(within(ficha).getByRole('button', { name: 'WhatsApp' })).toHaveProperty('disabled', true)

    fireEvent.click(within(ficha).getByRole('button', { name: 'Marcar como pago' }))
    const confirm = await screen.findByRole('dialog', { name: /Marcar PAG-1212/ })
    // Recibo já enviado: a opção de reenviar pelo flow nem aparece.
    expect(within(confirm).queryByRole('checkbox', { name: /Gerar e enviar o recibo/ })).toBeNull()
  })

  it('gerar recibo fecha a ficha antes de abrir o gerador e mostra o erro', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await openRow('PAG-1202')
    const ficha = await screen.findByRole('dialog', { name: 'Ricardo Menezes' })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Reenviar recibo' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ricardo Menezes' })).toBeNull())
    expect(await screen.findByText(/só funciona dentro do Dataverse/)).toBeTruthy()
  })
})
