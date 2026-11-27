// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import { AcessosProvider } from '../../../app/AcessosProvider'
import { AcessosPage } from '../AcessosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const host = { mode: 'mock' } as Host
const tela = () => render(<AcessosProvider host={host}><AcessosPage host={host} /></AcessosProvider>)

beforeEach(() => { localStorage.clear(); window.location.hash = '#/acessos?visao=papel' })
afterEach(() => { cleanup(); window.location.hash = ''; window.history.replaceState(null, '', '/') })

describe('Acessos por papel', () => {
  it('lista as pessoas ativas com as colunas e os chips com contagem', async () => {
    tela()
    expect(await screen.findByText('Bruno Modelo')).toBeTruthy()
    for (const c of ['Operacional', 'Financeiro', 'Frota', 'RH', 'Admin acessos', 'Amplo']) expect(screen.getAllByText(c).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Todos/ }).textContent).toContain('5')
    expect(screen.getByRole('button', { name: /Ainda com o amplo/ }).textContent).toContain('3')
    expect(screen.getByRole('button', { name: /Só o Base/ }).textContent).toContain('1')
    await waitFor(() => expect(screen.getByRole('button', { name: /Encerrados/ }).textContent).toContain('1'))
  })

  it('o chip Encerrados mostra a data e leva à ficha; a linha sem ficha abre a gaveta', async () => {
    tela()
    fireEvent.click(await screen.findByText('Bruno Modelo'))
    expect(window.location.hash).toBe('#/acessos?ver=22222222-2222-4222-8222-222222222222')
    window.location.hash = '#/acessos?visao=papel&filtro=encerrados'
    expect(await screen.findByText(/Encerrado em 10\/11\/2026 por Ana Exemplo/)).toBeTruthy()
    fireEvent.click(screen.getByText('Joana Encerrada Teste'))
    expect(window.location.hash).toBe('#/funcionarios?ficha=m9&secao=acesso')
  })

  it('a busca filtra por nome ou e-mail', async () => {
    tela()
    await screen.findByText('Bruno Modelo')
    fireEvent.change(screen.getByLabelText('Buscar pessoas'), { target: { value: 'carla@' } })
    await waitFor(() => expect(screen.queryByText('Bruno Modelo')).toBeNull())
    expect(screen.getByText('Carla Amostra')).toBeTruthy()
  })
})
