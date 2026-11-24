// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../host'
import { AcessosProvider } from '../../app/AcessosProvider'
import { AcessosPage } from './AcessosPage'

let falharReleitura = false
vi.mock('./data/source', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./data/source')>()
  return {
    ...mod,
    createSource: (h: Host) => {
      const s = mod.createSource(h)
      return { ...s, load: () => (falharReleitura ? Promise.reject(new Error('Falha na releitura.')) : s.load()) }
    },
  }
})

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const host = { mode: 'mock' } as Host
const tela = () => render(<AcessosProvider host={host}><AcessosPage host={host} /></AcessosProvider>)
const row = async (nome: string) => (await screen.findAllByText(nome))[0].closest('.bt-table__row') as HTMLElement

beforeEach(() => {
  falharReleitura = false
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ''; window.history.replaceState(null, '', '/') })

describe('AcessosPage', () => {
  it('lista as pessoas com os perfis de cada uma', async () => {
    tela()
    expect((await row('Bruno Modelo')).textContent).toContain('Financeiro · Operador')
    expect((await row('Carla Amostra')).textContent).toContain('Operacional · Gestor')
    expect((await row('Diego Teste')).textContent).toContain('Só o Base')
  })

  it('mostra só quem não tem ficha de funcionário', async () => {
    tela()
    await row('Bruno Modelo')
    expect(screen.queryAllByText('Ana Exemplo')).toHaveLength(0)
    expect(screen.getAllByText('Diego Teste').length).toBeGreaterThan(0)
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

  it('depois de salvar a linha já mostra o perfil novo, mesmo se a releitura falhar', async () => {
    tela()
    fireEvent.click((await row('Diego Teste')).querySelectorAll('[role="cell"]')[1])
    await screen.findByRole('dialog', { name: 'Diego Teste' })
    fireEvent.click(screen.getAllByRole('radio', { name: 'Operador' })[1])
    falharReleitura = true
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await screen.findByText('A última atualização falhou')
    expect((await row('Diego Teste')).textContent).toContain('Financeiro · Operador')
  })
})
