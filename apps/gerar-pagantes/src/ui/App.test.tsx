// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoEditOperation, demoOperation } from '../demo'

vi.stubGlobal('__APP_VERSION__', '0.2.69')
vi.stubGlobal('__APP_DATE__', '23/07/2026')

// jsdom não implementa <dialog> modal nem matchMedia, usados pelos componentes do design system.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
Element.prototype.scrollIntoView ??= function () {}
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia

const mocks = vi.hoisted(() => ({
  loadOperation: vi.fn(),
  submitOperation: vi.fn(),
  searchDirectoryPeople: vi.fn(),
  updatePersonEmail: vi.fn(),
  logAppError: vi.fn()
}))

vi.mock('../dataverse', () => ({
  getRecordIdFromLocation: () => null,
  loadOperation: mocks.loadOperation,
  submitOperation: mocks.submitOperation,
  searchDirectoryPeople: mocks.searchDirectoryPeople,
  updatePersonEmail: mocks.updatePersonEmail
}))
vi.mock('../errorLogger', () => ({ logAppError: mocks.logAppError }))

const [mariana, carlos, ana] = demoOperation.people
const row = (name: string) => screen.getByRole('article', { name: `Pagante ${name}` })
const saveButton = (name: RegExp) => screen.getByRole('button', { name })

async function renderApp() {
  const { App } = await import('./App')
  render(<App />)
  await screen.findByRole('combobox', { name: /adicionar pagante/i })
}

function addPerson(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: /adicionar pagante/i }))
  fireEvent.click(screen.getByRole('option', { name: new RegExp(name, 'i'), hidden: true }))
}

function typeAmount(name: string, value: string) {
  const input = within(row(name)).getByRole('textbox', { name: new RegExp(`valor de ${name}`, 'i') })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.searchDirectoryPeople.mockResolvedValue({ people: [] })
  mocks.updatePersonEmail.mockImplementation(async (_id: string, email: string) => email)
  mocks.submitOperation.mockResolvedValue({ success: true, requestId: 'request-id', financeiroId: demoOperation.id, totalCents: demoOperation.totalCents, results: [], errors: [] })
})

describe('criar pagantes', () => {
  beforeEach(() => { mocks.loadOperation.mockResolvedValue(demoOperation) })

  it('sugere o solicitante único e gera com um clique', async () => {
    await renderApp()
    expect(row(mariana.name)).toBeTruthy()
    fireEvent.click(saveButton(/gerar pagantes/i))
    await waitFor(() => expect(mocks.submitOperation).toHaveBeenCalledOnce())
    expect(mocks.submitOperation.mock.calls[0][1].pagantes).toEqual([expect.objectContaining({ paganteId: mariana.id, amountCents: demoOperation.totalCents })])
    expect(await screen.findByText('Pagantes gerados')).toBeTruthy()
  })

  it('adiciona pela busca e divide só o saldo sem sobrescrever valor digitado', async () => {
    await renderApp()
    typeAmount(mariana.name, '3.000,00')
    addPerson(carlos.name)
    expect((within(row(mariana.name)).getByRole('textbox', { name: /valor de mariana/i }) as HTMLInputElement).value).toMatch(/3\.000,00$/)
    expect((within(row(carlos.name)).getByRole('textbox', { name: /valor de carlos/i }) as HTMLInputElement).value).toMatch(/1\.827,50$/)
  })

  it('focar e sair do campo de valor sem alterar não trava o valor', async () => {
    await renderApp()
    addPerson(carlos.name)
    const input = within(row(mariana.name)).getByRole('textbox', { name: /valor de mariana/i })
    fireEvent.focus(input)
    fireEvent.blur(input)
    addPerson(ana.name)
    const values = [mariana, carlos, ana].map((person) => (within(row(person.name)).getByRole('textbox', { name: new RegExp(`valor de ${person.name}`, 'i') }) as HTMLInputElement).value)
    expect(values.every((value) => /1\.609,1[67]$/.test(value))).toBe(true)
  })

  it('exige e-mail para envio e grava o e-mail novo antes de gerar', async () => {
    await renderApp()
    addPerson(ana.name)
    fireEvent.click(within(row(ana.name)).getByRole('switch', { name: 'E-mail' }))
    expect(within(row(ana.name)).getByText('Informe um e-mail válido para o envio.')).toBeTruthy()
    expect(saveButton(/gerar pagantes/i).getAttribute('aria-disabled')).toBe('true')
    fireEvent.change(within(row(ana.name)).getByLabelText(/e-mail de ana paula silva/i), { target: { value: 'ana@empresa.com.br' } })
    fireEvent.click(within(row(ana.name)).getByRole('button', { name: /usar e-mail/i }))
    fireEvent.click(saveButton(/gerar pagantes/i))
    await waitFor(() => expect(mocks.submitOperation).toHaveBeenCalledOnce())
    expect(mocks.updatePersonEmail).toHaveBeenCalledWith(ana.id, 'ana@empresa.com.br')
    expect(mocks.updatePersonEmail.mock.invocationCallOrder[0]).toBeLessThan(mocks.submitOperation.mock.invocationCallOrder[0])
    expect(mocks.submitOperation.mock.calls[0][1].pagantes).toContainEqual(expect.objectContaining({ paganteId: ana.id, email: 'ana@empresa.com.br', recipientEmail: 'ana@empresa.com.br', sendEmail: true }))
  })
})

describe('editar pagantes', () => {
  beforeEach(() => { mocks.loadOperation.mockResolvedValue(demoEditOperation) })
  afterEach(() => { window.history.pushState({}, '', '/') })

  it('abre com status, pago somente leitura e sem alteração para salvar', async () => {
    await renderApp()
    expect(screen.getByText('EDITAR PAGANTES')).toBeTruthy()
    expect(screen.getByText('Nenhuma alteração para salvar')).toBeTruthy()
    expect(saveButton(/salvar alterações/i).getAttribute('aria-disabled')).toBe('true')
    expect(within(row(carlos.name)).getByRole('textbox', { name: /valor de carlos/i }).hasAttribute('disabled')).toBe(true)
    expect(within(row(carlos.name)).queryByRole('button', { name: /remover/i })).toBeNull()
  })

  it('remove e desfaz, e salva alteração de valor com um único resumo', async () => {
    await renderApp()
    fireEvent.click(within(row(mariana.name)).getByRole('button', { name: /remover mariana/i }))
    expect(within(row(mariana.name)).getByText('Será removido')).toBeTruthy()
    fireEvent.click(within(row(mariana.name)).getByRole('button', { name: /desfazer/i }))
    typeAmount(mariana.name, '2.000,00')
    expect(within(row(mariana.name)).getByText('Alterado')).toBeTruthy()
    fireEvent.click(saveButton(/salvar alterações \(1\)/i))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar alterações' })
    fireEvent.click(within(dialog).getByRole('button', { name: /confirmar e salvar/i }))
    await waitFor(() => expect(mocks.submitOperation).toHaveBeenCalledOnce())
    expect(mocks.submitOperation.mock.calls[0][1]).toMatchObject({ allowTotalMismatch: true })
    expect(mocks.submitOperation.mock.calls[0][1].pagantes).toEqual([
      expect.objectContaining({ paganteId: mariana.id, existingPaganteId: demoEditOperation.payers[0].existingPayerId, amountCents: 200000 }),
      expect.objectContaining({ paganteId: carlos.id, existingPaganteId: demoEditOperation.payers[1].existingPayerId })
    ])
    expect(await screen.findByText('Alterações salvas')).toBeTruthy()
  })

  it('reenvia o e-mail de quem não mudou', async () => {
    await renderApp()
    fireEvent.click(within(row(mariana.name)).getByRole('button', { name: /reenviar e-mail/i }))
    fireEvent.click(saveButton(/salvar alterações \(1\)/i))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar alterações' })
    expect(within(dialog).getByText('Reenvio')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /confirmar e salvar/i }))
    await waitFor(() => expect(mocks.submitOperation).toHaveBeenCalledOnce())
    expect(mocks.submitOperation.mock.calls[0][1].pagantes[0]).toMatchObject({ paganteId: mariana.id, resendEmail: true })
  })

  it('pedido de fechamento com alteração abre a confirmação de descarte', async () => {
    window.history.pushState({}, '', '/?embedded=1')
    await renderApp()
    typeAmount(mariana.name, '1.000,00')
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'cr40f-gerar-pagantes:request-close' }, origin: window.location.origin, source: window }))
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
  })
})
