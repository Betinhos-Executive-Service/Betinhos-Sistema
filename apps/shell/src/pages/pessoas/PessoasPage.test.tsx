// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PessoasPage } from './PessoasPage'
import { STATUS } from './domain/choices'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = '' })

const row = async (nome: string) => (await screen.findAllByText(nome))[0].closest('.bt-table__row') as HTMLElement

describe('Pessoas', () => {
  it('clique na linha abre a ficha com histórico e duplicados', async () => {
    render(<PessoasPage host={{ mode: 'mock' }} />)
    fireEvent.click((await row('Mari Albuquerque')).querySelectorAll('[role="cell"]')[3])
    const ficha = await screen.findByRole('dialog', { name: 'Mari Albuquerque' })
    expect(within(ficha).getByText('Possível cadastro duplicado')).toBeTruthy()
    expect(await within(ficha).findByText(/no total/)).toBeTruthy()
    expect(within(ficha).getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/5511998124410')
  })

  it('edita, salva só o que mudou e atualiza a lista', async () => {
    render(<PessoasPage host={{ mode: 'mock' }} />)
    fireEvent.click(within(await row('John Carter')).getByRole('button', { name: /^John Carter/ }))
    const ficha = await screen.findByRole('dialog', { name: 'John Carter' })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Editar cadastro' }))
    await screen.findByRole('button', { name: 'Salvar alterações' })
    fireEvent.change(document.querySelector('input[name="departamento"]') as HTMLInputElement, { target: { value: 'Compras' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Cadastro de John Carter salvo.')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText(/Compras/).length).toBeGreaterThan(0))
  })

  it('link antigo com filtro na URL abre filtrado e passa a usar f=', async () => {
    window.location.hash = `#/pessoas?status=${STATUS.inativo}`
    render(<PessoasPage host={{ mode: 'mock' }} />)
    await row('Paulo Tavares')
    await waitFor(() => expect(screen.queryAllByText('John Carter')).toHaveLength(0))
    await waitFor(() => expect(window.location.hash).toMatch(/[?&]f=/))
    expect(window.location.hash).not.toMatch(/[?&]status=/)
  })

  it('cadastro avisa duplicado, valida e pede confirmação ao fechar com alterações', async () => {
    render(<PessoasPage host={{ mode: 'mock' }} />)
    await row('John Carter')
    fireEvent.click(screen.getByRole('button', { name: 'Nova pessoa' }))
    await screen.findByRole('dialog', { name: 'Nova pessoa' })
    const nome = document.querySelector('input[name="nome"]') as HTMLInputElement
    fireEvent.change(nome, { target: { value: 'X' } })
    fireEvent.change((document.querySelector('input[name="telefone"]') as HTMLInputElement), { target: { value: '11998124410' } })
    expect((await screen.findAllByText(/mesmo celular/)).length).toBe(2)
    expect((document.querySelector('input[name="telefone"]') as HTMLInputElement).value).toBe('(11) 99812-4410')

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar pessoa' }))
    expect(await screen.findByText('Nome muito curto.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
    expect(screen.getByRole('dialog', { name: 'Nova pessoa' })).toBeTruthy()

    fireEvent.change(nome, { target: { value: 'Ana Beatriz Lima' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar pessoa' }))
    expect(await screen.findByText('Ana Beatriz Lima cadastrado.')).toBeTruthy()
    expect(await screen.findByRole('dialog', { name: 'Ana Beatriz Lima' })).toBeTruthy()
  })
})
