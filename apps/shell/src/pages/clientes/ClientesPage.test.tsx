// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientesPage } from './ClientesPage'
import { buildPayload, validateForm } from './domain/form'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = '' })

const row = async (nome: string) => (await screen.findAllByText(nome))[0].closest('.bt-table__row') as HTMLElement

describe('Clientes', () => {
  it('lista os clientes, busca e abre a ficha com link para as pessoas', async () => {
    render(<ClientesPage host={{ mode: 'mock' }} />)
    await row('Tenaris')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar clientes' }), { target: { value: 'pinda' } })
    await waitFor(() => expect(screen.queryAllByText('Tenaris')).toHaveLength(0))
    fireEvent.click((await row('Lumen Consultoria')).querySelectorAll('[role="cell"]')[1])
    const ficha = await screen.findByRole('dialog', { name: 'Lumen Consultoria' })
    expect(within(ficha).getByRole('link', { name: /Ver pessoas deste cliente/ }).getAttribute('href')).toBe('#/pessoas?cliente=22222222-2222-4222-8222-222222222222')
  })

  it('cadastra cliente novo, exige nome e registro, e mostra na lista', async () => {
    render(<ClientesPage host={{ mode: 'mock' }} />)
    await row('Tenaris')
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar cliente' }))
    expect(await screen.findByText('Informe o nome do cliente.')).toBeTruthy()
    fireEvent.change(document.querySelector('input[name="nome"]') as HTMLInputElement, { target: { value: 'Acme Ltda' } })
    fireEvent.change(document.querySelector('input[name="registro"]') as HTMLInputElement, { target: { value: 'Taubaté' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }))
    expect(await screen.findByText('Acme Ltda cadastrado.')).toBeTruthy()
    await screen.findByRole('dialog', { name: 'Acme Ltda' })
  })

  it('fechar com alteração não salva pede confirmação', async () => {
    render(<ClientesPage host={{ mode: 'mock' }} />)
    await row('Tenaris')
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }))
    fireEvent.change(await screen.findByRole('textbox', { name: /Nome do cliente/ }), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
  })
})

describe('formulário', () => {
  it('payload de edição leva só o que mudou; vazio vira null', () => {
    const base = { nome: 'A', registro: 'SJCampos', endereco: 'Rua 1' }
    expect(buildPayload(base, { ...base, endereco: ' ' })).toEqual({ cr40f_endereco: null })
    expect(buildPayload(null, { nome: 'B', registro: 'Pinda', endereco: '' })).toEqual({ cr40f_nomedocliente: 'B', cr40f_registro: 'Pinda' })
    expect(validateForm({ nome: ' ', registro: '', endereco: '' })).toEqual({ nome: 'Informe o nome do cliente.', registro: 'Informe o registro.' })
  })
})
