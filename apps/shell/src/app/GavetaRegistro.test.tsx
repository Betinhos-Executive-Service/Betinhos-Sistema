// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GavetaRegistro } from './GavetaRegistro'
import { abrirGavetaRegistro, avisarRegistroAlterado, fecharGavetaRegistro, gavetaRegistroAberta, REGISTRO_ALTERADO, useRegistroAlterado } from './registroAberto'

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

it('manutenção abre a gaveta única da Frota por cima da lista, sem trocar a rota', async () => {
  render(<GavetaRegistro host={host} />)
  act(() => abrirGavetaRegistro('cr40f_manutencoes', 'm1'))
  const gaveta = await screen.findByRole('dialog', { name: 'Freio com ruído (fictício)' })
  expect(within(gaveta).getByRole('button', { name: 'Encaixar' })).toBeTruthy()
  expect(window.location.hash).toBe('#/geral?q=ana')
})

it('a gaveta da manutenção tem o ToastProvider do hospedeiro: a ação grava e o aviso aparece', async () => {
  render(<GavetaRegistro host={host} />)
  act(() => abrirGavetaRegistro('cr40f_manutencoes', 'm1'))
  const gaveta = await screen.findByRole('dialog', { name: 'Freio com ruído (fictício)' })
  fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar manutenção' }))
  await act(async () => { fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar manutenção' })) })
  expect(await screen.findByText('Manutenção cancelada.')).toBeTruthy()
  expect(await within(gaveta).findByText('Cancelado')).toBeTruthy()
})

it('manutenção que não existe mostra o aviso na própria gaveta', async () => {
  render(<GavetaRegistro host={host} />)
  act(() => abrirGavetaRegistro('cr40f_manutencoes', 'nao-existe'))
  expect(await screen.findByRole('dialog', { name: 'Manutenção não encontrada' })).toBeTruthy()
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

it('enquanto carrega mostra só o loader no meio da tela, sem gaveta provisória, e uma gaveta só depois', async () => {
  render(<GavetaRegistro host={host} />)
  act(() => abrirGavetaRegistro('cr40f_clientes1', '11111111-1111-4111-8111-111111111111'))
  expect(screen.getByRole('status', { name: /^Carregando/ })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  await screen.findByRole('dialog', { name: 'Grupo Atlântico' })
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.queryByRole('status', { name: /^Carregando/ })).toBeNull()
})

it('Esc durante o carregamento desiste da abertura', () => {
  render(<GavetaRegistro host={host} />)
  act(() => abrirGavetaRegistro('cr40f_clientes1', '11111111-1111-4111-8111-111111111111'))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(gavetaRegistroAberta()).toBeNull()
})

it('ação na gaveta da manutenção avisa a lista que está atrás (REGISTRO_ALTERADO), uma vez por ação', async () => {
  const ouvido = vi.fn()
  const ouvir = (event: Event) => ouvido((event as CustomEvent).detail)
  window.addEventListener(REGISTRO_ALTERADO, ouvir)
  try {
    // Host novo: a fonte da Frota é guardada por host, e o teste anterior já cancelou a m1 no host do arquivo.
    render(<GavetaRegistro host={{ mode: 'mock' }} />)
    act(() => abrirGavetaRegistro('cr40f_manutencoes', 'm1'))
    const gaveta = await screen.findByRole('dialog', { name: 'Freio com ruído (fictício)' })
    expect(ouvido).not.toHaveBeenCalled()
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar manutenção' }))
    await act(async () => { fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar manutenção' })) })
    await waitFor(() => expect(ouvido).toHaveBeenCalledWith({ table: 'cr40f_manutencoes', id: 'm1' }))
    expect(ouvido).toHaveBeenCalledTimes(1)
  } finally {
    window.removeEventListener(REGISTRO_ALTERADO, ouvir)
  }
})

it('useRegistroAlterado chama só para a tabela pedida, com o id do registro, e para ao desmontar', () => {
  const chamado = vi.fn()
  function Ouvinte() { useRegistroAlterado('cr40f_manutencoes', chamado); return null }
  const { unmount } = render(<Ouvinte />)
  act(() => avisarRegistroAlterado('cr40f_veiculos', 'v1'))
  act(() => avisarRegistroAlterado('cr40f_manutencoes', 'm2'))
  expect(chamado).toHaveBeenCalledTimes(1)
  expect(chamado).toHaveBeenCalledWith('m2')
  unmount()
  act(() => avisarRegistroAlterado('cr40f_manutencoes', 'm3'))
  expect(chamado).toHaveBeenCalledTimes(1)
})
