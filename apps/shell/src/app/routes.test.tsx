// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findItem } from '../nav/menu'
import { RouteLayout } from './RouteLayout'
import { isChunkLoadError, navegador, PAGE_LOADERS, usePrefetchOnIntent } from './routes'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: http://x/assets/OpsPage.abc.js')
const original = { ...PAGE_LOADERS }

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  sessionStorage.clear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); Object.assign(PAGE_LOADERS, original) })

function Rota({ id }: { id: string }) {
  const found = findItem(id)!
  return <RouteLayout host={{ mode: 'mock' }} group={found.group} item={found.item} label={found.item.label ?? id} />
}

function Menu({ href }: { href: string }) {
  usePrefetchOnIntent()
  return <a href={href}>Link</a>
}

describe('falha ao baixar o chunk da tela', () => {
  it('reconhece só erro de import dinâmico (Chrome, Firefox, Safari)', () => {
    expect(isChunkLoadError(chunkError())).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('boom'))).toBe(false)
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false)
  })

  it('prefetch nunca recarrega a página, nem com hover repetido', async () => {
    const recarregar = vi.spyOn(navegador, 'recarregar').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const loader = vi.fn(() => Promise.reject(chunkError()))
    PAGE_LOADERS.ops = loader
    render(<Menu href="#/ops" />)
    fireEvent.pointerOver(screen.getByText('Link'))
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1))
    fireEvent.pointerOver(screen.getByText('Link'))
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2))
    expect(loader).toHaveBeenCalledTimes(2)
    expect(recarregar).not.toHaveBeenCalled()
  })

  it('na renderização recarrega uma vez por build; na segunda falha mostra o erro na tela', async () => {
    const recarregar = vi.spyOn(navegador, 'recarregar').mockImplementation(() => undefined)
    PAGE_LOADERS.ops = () => Promise.reject(chunkError())
    const { unmount } = render(<Rota id="ops" />)
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1))
    unmount()
    render(<Rota id="ops" />)
    expect(await screen.findByText('Não foi possível abrir esta tela')).toBeTruthy()
    expect(recarregar).toHaveBeenCalledTimes(1)
  })

  it('erro que não é de chunk não recarrega; voltar à rota tenta de novo e abre a tela', async () => {
    const recarregar = vi.spyOn(navegador, 'recarregar').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    PAGE_LOADERS.pagantes = () => Promise.reject(new Error('boom'))
    const { unmount } = render(<Rota id="pagantes" />)
    expect(await screen.findByText('Não foi possível abrir esta tela')).toBeTruthy()
    expect(recarregar).not.toHaveBeenCalled()
    unmount()
    PAGE_LOADERS.pagantes = () => Promise.resolve(() => <p>Tela de pagantes</p>)
    render(<Rota id="pagantes" />)
    expect(await screen.findByText('Tela de pagantes')).toBeTruthy()
  })
})
