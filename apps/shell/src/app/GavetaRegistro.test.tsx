// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GavetaRegistro } from './GavetaRegistro'
import { abrirGavetaRegistro, fecharGavetaRegistro, gavetaRegistroAberta } from './registroAberto'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  window.location.hash = '#/geral?q=ana'
})
afterEach(() => { cleanup(); act(() => fecharGavetaRegistro()); vi.unstubAllGlobals(); window.location.hash = '' })

const host = { mode: 'mock' } as const

it('abre a gaveta da tabela do registro por cima da lista e fechar limpa o estado sem trocar a rota', async () => {
  render(<GavetaRegistro host={host} />)
  expect(screen.queryByRole('dialog')).toBeNull()
  act(() => abrirGavetaRegistro('cr40f_clientes1', '11111111-1111-4111-8111-111111111111'))
  const ficha = await screen.findByRole('dialog', { name: 'Grupo Atlântico' })
  expect(within(ficha).getByRole('link', { name: /Ver pessoas deste cliente/ })).toBeTruthy()
  fireEvent.click(within(ficha).getByRole('button', { name: 'Fechar painel' }))
  expect(gavetaRegistroAberta()).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(window.location.hash).toBe('#/geral?q=ana')
})

it('registro que não existe mostra o erro na própria gaveta', async () => {
  render(<GavetaRegistro host={host} />)
  act(() => abrirGavetaRegistro('cr40f_pagantes', 'nao-existe'))
  expect(await screen.findByText('Pagante não encontrado ou inativo.')).toBeTruthy()
})

it('trocar de tela fecha a gaveta', async () => {
  render(<GavetaRegistro host={host} />)
  act(() => abrirGavetaRegistro('cr40f_clientes1', '11111111-1111-4111-8111-111111111111'))
  await screen.findByRole('dialog', { name: 'Grupo Atlântico' })
  await act(async () => {
    window.location.hash = '#/pessoas'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  expect(gavetaRegistroAberta()).toBeNull()
})
