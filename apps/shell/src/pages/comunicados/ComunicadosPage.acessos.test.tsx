// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComAcessos } from '../../app/ComAcessos'
import { ComunicadosPage } from './ComunicadosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/comunicados'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function abrirRascunho(perfis: string) {
  render(<ComAcessos perfis={perfis}><ComunicadosPage host={{ mode: 'mock' }} /></ComAcessos>)
  return screen.findByRole('button', { name: /^Revisão dos veículos/ })
}

describe('Comunicados por nível', () => {
  it('Operacional Operador não vê Excluir rascunho na lista nem no editor', async () => {
    const linha = await abrirRascunho('operacional:operador')
    expect(screen.queryByRole('button', { name: 'Excluir rascunho Revisão dos veículos' })).toBeNull()
    fireEvent.click(linha)
    await screen.findByDisplayValue('Revisão dos veículos')
    expect(screen.queryByRole('button', { name: 'Excluir rascunho' })).toBeNull()
  })

  it('Operacional Gestor vê os dois', async () => {
    const linha = await abrirRascunho('operacional:gestor')
    expect(screen.getByRole('button', { name: 'Excluir rascunho Revisão dos veículos' })).toBeTruthy()
    fireEvent.click(linha)
    await screen.findByDisplayValue('Revisão dos veículos')
    expect(screen.getByRole('button', { name: 'Excluir rascunho' })).toBeTruthy()
  })
})
