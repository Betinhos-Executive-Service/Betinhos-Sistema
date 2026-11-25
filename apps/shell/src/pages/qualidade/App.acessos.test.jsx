// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComAcessos } from '../../app/ComAcessos'
import App from './App'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Qualidade por nível', () => {
  it('Gestor do Operacional não vê Configurações (opções de choice são metadata)', async () => {
    render(<ComAcessos perfis="operacional:gestor"><App embedded /></ComAcessos>)
    await screen.findAllByRole('button')
    expect(screen.queryAllByRole('button', { name: /Configurações/ })).toHaveLength(0)
  })

  it('Administrador do Sistema vê Configurações', async () => {
    render(<App embedded />)
    expect((await screen.findAllByRole('button', { name: /Configurações/ })).length).toBeGreaterThan(0)
  })
})
