// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InfracoesPage } from './InfracoesPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const row = async (codigo: string) => (await screen.findByRole('button', { name: new RegExp(`^${codigo}`) })).closest('.bt-table__row') as HTMLElement

describe('Infrações de trânsito', () => {
  it('clique na linha abre a ficha com o uso nas multas', async () => {
    render(<InfracoesPage host={{ mode: 'mock' }} />)
    fireEvent.click((await row('7455')).querySelectorAll('[role="cell"]')[3])
    const ficha = await screen.findByRole('dialog', { name: 'Infração 7455' })
    expect(within(ficha).getByText('218, I')).toBeTruthy()
    expect(await within(ficha).findByText(/9 no total/)).toBeTruthy()
  })

  it('edita, salva só o que mudou e atualiza a lista', async () => {
    render(<InfracoesPage host={{ mode: 'mock' }} />)
    fireEvent.click(within(await row('5185')).getByRole('button', { name: /^5185/ }))
    const ficha = await screen.findByRole('dialog', { name: 'Infração 5185' })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Editar infração' }))
    await screen.findByRole('button', { name: 'Salvar alterações' })
    fireEvent.change(document.querySelector('input[name="valor"]') as HTMLInputElement, { target: { value: '1.234,50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Infração 5185 salva.')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText('R$ 1.234,50').length).toBeGreaterThan(0))
  })

  it('cadastro bloqueia código repetido e pede confirmação ao fechar com alterações', async () => {
    render(<InfracoesPage host={{ mode: 'mock' }} />)
    await row('7455')
    fireEvent.click(screen.getByRole('button', { name: 'Nova infração' }))
    await screen.findByRole('dialog', { name: 'Nova infração' })
    const codigo = document.querySelector('input[name="codigo"]') as HTMLInputElement
    fireEvent.change(codigo, { target: { value: '7455' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar infração' }))
    expect(await screen.findByText('Já existe a infração 7455.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova infração' })).toBeNull())
  })

  it('inativa com confirmação e some da lista de ativas', async () => {
    render(<InfracoesPage host={{ mode: 'mock' }} />)
    fireEvent.click(within(await row('5746')).getByRole('button', { name: /^5746/ }))
    const ficha = await screen.findByRole('dialog', { name: 'Infração 5746' })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Inativar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Inativar a infração 5746?' })
    expect(within(confirm).getByText(/As 5 multas já registradas continuam com ela/)).toBeTruthy()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Inativar infração' }))
    expect(await screen.findByText('Infração 5746 inativada.')).toBeTruthy()
    expect(within(ficha).getByRole('button', { name: 'Reativar' })).toBeTruthy()
  })

  it('link antigo com situacao=inativas abre filtrado e passa a usar f=', async () => {
    window.location.hash = '#/infracoes?situacao=inativas'
    render(<InfracoesPage host={{ mode: 'mock' }} />)
    await row('5169')
    await waitFor(() => expect(screen.queryAllByText('5746')).toHaveLength(0))
    await waitFor(() => expect(window.location.hash).toMatch(/[?&]f=/))
    expect(window.location.hash).not.toMatch(/situacao=/)
  })
})
