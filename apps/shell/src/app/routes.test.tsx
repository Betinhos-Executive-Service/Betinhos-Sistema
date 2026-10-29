// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findItem } from '../nav/menu'
import { RouteLayout } from './RouteLayout'
import { HOVER_DELAY_MS, isChunkLoadError, limparCacheDeTelas, navegador, PAGE_LOADERS, usePrefetchOnIntent } from './routes'

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

describe('prefetch por intenção', () => {
  function Links() {
    usePrefetchOnIntent()
    return (
      <nav>
        <a href="#/pessoas"><span>Pessoas</span></a>
        <a href="#/clientes">Clientes</a>
        <a href="#/new_telacomposicaopreco">Composição</a>
        <a href="https://app.infleet.com.br/monitoring">Infleet</a>
        <span>Grupo</span>
      </nav>
    )
  }
  const stubLoaders = () => {
    const pessoas = vi.fn(() => Promise.resolve(() => null))
    const clientes = vi.fn(() => Promise.resolve(() => null))
    PAGE_LOADERS.pessoas = pessoas
    PAGE_LOADERS.clientes = clientes
    return { pessoas, clientes }
  }
  beforeEach(() => { limparCacheDeTelas() })
  afterEach(() => { vi.useRealTimers() })

  it('mouse parado sobre o link baixa a tela uma vez, depois do atraso', () => {
    vi.useFakeTimers()
    const { pessoas } = stubLoaders()
    render(<Links />)
    fireEvent.pointerOver(screen.getByText('Pessoas'))
    vi.advanceTimersByTime(HOVER_DELAY_MS - 1)
    expect(pessoas).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(pessoas).toHaveBeenCalledTimes(1)
    fireEvent.pointerOver(screen.getByText('Pessoas'))
    vi.advanceTimersByTime(HOVER_DELAY_MS)
    expect(pessoas).toHaveBeenCalledTimes(1)
  })

  it('passar o mouse rápido por vários itens não baixa nenhum', () => {
    vi.useFakeTimers()
    const { pessoas, clientes } = stubLoaders()
    render(<Links />)
    fireEvent.pointerOver(screen.getByText('Pessoas'))
    vi.advanceTimersByTime(40)
    fireEvent.pointerOver(screen.getByText('Clientes'))
    vi.advanceTimersByTime(40)
    fireEvent.pointerOut(screen.getByText('Clientes'), { relatedTarget: document.body })
    vi.advanceTimersByTime(HOVER_DELAY_MS)
    expect(pessoas).not.toHaveBeenCalled()
    expect(clientes).not.toHaveBeenCalled()
  })

  it('foco por teclado e toque baixam na hora; WebResource, link externo e grupo não quebram', () => {
    vi.useFakeTimers()
    const { pessoas, clientes } = stubLoaders()
    render(<Links />)
    fireEvent.focusIn(screen.getByText('Pessoas'))
    fireEvent.touchStart(screen.getByText('Clientes'))
    expect(pessoas).toHaveBeenCalledTimes(1)
    expect(clientes).toHaveBeenCalledTimes(1)
    for (const text of ['Composição', 'Infleet', 'Grupo']) {
      expect(() => { fireEvent.pointerOver(screen.getByText(text)); fireEvent.focusIn(screen.getByText(text)) }).not.toThrow()
    }
    vi.advanceTimersByTime(HOVER_DELAY_MS)
  })

  it('com economia de dados não pré-carrega nada', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { connection: { saveData: true } }))
    const { pessoas } = stubLoaders()
    render(<Links />)
    fireEvent.focusIn(screen.getByText('Pessoas'))
    fireEvent.pointerOver(screen.getByText('Pessoas'))
    vi.advanceTimersByTime(HOVER_DELAY_MS)
    expect(pessoas).not.toHaveBeenCalled()
  })

  it('com prefers-reduced-data não pré-carrega nada', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-data'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    const { pessoas } = stubLoaders()
    render(<Links />)
    fireEvent.touchStart(screen.getByText('Pessoas'))
    expect(pessoas).not.toHaveBeenCalled()
  })
})

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
