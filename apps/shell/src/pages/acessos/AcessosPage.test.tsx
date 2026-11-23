// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../host'
import { AcessosProvider } from '../../app/AcessosProvider'
import { AcessosPage } from './AcessosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const host = { mode: 'mock' } as Host
const tela = () => render(<AcessosProvider host={host}><AcessosPage host={host} /></AcessosProvider>)
const row = async (nome: string) => (await screen.findAllByText(nome))[0].closest('.bt-table__row') as HTMLElement

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ''; window.history.replaceState(null, '', '/') })

describe('AcessosPage', () => {
  it('lista as pessoas com os perfis de cada uma', async () => {
    tela()
    expect((await row('Bruno Modelo')).textContent).toContain('Financeiro · Operador')
    expect((await row('Ana Exemplo')).textContent).toContain('Administrador do Sistema')
    expect((await row('Diego Teste')).textContent).toContain('Só o Base')
  })

  it('a busca filtra por perfil', async () => {
    tela()
    await row('Bruno Modelo')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pessoas' }), { target: { value: 'frota' } })
    await waitFor(() => expect(screen.queryAllByText('Bruno Modelo')).toHaveLength(0))
    expect(screen.getAllByText('Carla Amostra').length).toBeGreaterThan(0)
  })

  it('abre a gaveta, salva e a lista reflete o perfil novo', async () => {
    tela()
    fireEvent.click((await row('Bruno Modelo')).querySelectorAll('[role="cell"]')[1])
    await screen.findByRole('dialog', { name: 'Bruno Modelo' })
    fireEvent.click(screen.getAllByRole('radio', { name: 'Gestor' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(async () => expect((await row('Bruno Modelo')).textContent).toContain('Financeiro · Gestor'))
    expect(screen.queryByRole('dialog', { name: 'Bruno Modelo' })).toBeNull()
  })

  it('o botão Histórico mostra todas as alterações com a pessoa', async () => {
    tela()
    await row('Bruno Modelo')
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    const gaveta = await screen.findByRole('dialog', { name: 'Histórico de acessos' })
    expect(gaveta.textContent).toContain('Carla Amostra')
    expect(gaveta.textContent).toContain('Operacional: Operador → Gestor')
  })
})
