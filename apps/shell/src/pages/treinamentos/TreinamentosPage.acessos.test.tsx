// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComAcessos } from '../../app/ComAcessos'
import { TreinamentosPage } from './TreinamentosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/treinamentos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const montar = (perfis: string) => render(<ComAcessos perfis={perfis}><TreinamentosPage host={{ mode: 'mock' }} /></ComAcessos>)

async function abrirRascunho() {
  fireEvent.click(await screen.findByRole('row', { name: /Atendimento a passageiros com mobilidade reduzida/ }))
  await screen.findByRole('heading', { name: 'Editar treinamento' })
}

async function editarPublicado() {
  fireEvent.click(await screen.findByRole('row', { name: /Embarque no GRU/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Editar conteúdo' }))
  await screen.findByRole('heading', { name: 'Editar treinamento publicado' })
}

describe('Treinamentos por nível', () => {
  it('RH Operador edita o rascunho sem Excluir rascunho', async () => {
    montar('rh:operador')
    await abrirRascunho()
    expect(screen.queryByRole('button', { name: 'Excluir rascunho' })).toBeNull()
  })

  it('RH Operador edita o publicado sem excluir anexo', async () => {
    montar('rh:operador')
    await editarPublicado()
    expect(screen.getByText('mapa-terminal-3.pdf')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Excluir mapa-terminal-3.pdf' })).toBeNull()
  })

  it('RH Gestor vê Excluir rascunho e excluir anexo', async () => {
    montar('rh:gestor')
    await abrirRascunho()
    expect(screen.getByRole('button', { name: 'Excluir rascunho' })).toBeTruthy()
    cleanup()
    window.location.hash = '#/treinamentos'
    montar('rh:gestor')
    await editarPublicado()
    expect(screen.getByRole('button', { name: 'Excluir mapa-terminal-3.pdf' })).toBeTruthy()
  })
})
