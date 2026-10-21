// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoadMore, statusText } from './LoadMore'

/** Observador falso: guarda o callback e as opções; `trigger` simula a interseção. */
class FakeObserver {
  static instances: FakeObserver[] = []
  static trigger(entries: Array<{ isIntersecting: boolean }>) { for (const o of FakeObserver.instances.filter((i) => !i.closed)) o.callback(entries as IntersectionObserverEntry[], o as unknown as IntersectionObserver) }
  closed = false
  observed: Element[] = []
  constructor(public callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) { FakeObserver.instances.push(this) }
  observe(element: Element) { this.observed.push(element) }
  disconnect() { this.closed = true }
  unobserve() {}
  takeRecords() { return [] }
}

const base = { root: null, more: true, loading: false, loadingMore: false, error: null, loaded: 100, total: 220 as number | null, onLoadMore: () => undefined, onRetry: () => undefined }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  FakeObserver.instances = []
})

describe('statusText', () => {
  it('com total, sem total e no fim da lista', () => {
    expect(statusText(100, 220, true)).toBe('100 de 220 serviços')
    expect(statusText(100, null, true)).toBe('100+ serviços')
    expect(statusText(220, 220, false)).toBe('220 serviços')
    expect(statusText(1, 1, false)).toBe('1 serviço')
    expect(statusText(7, null, false)).toBe('7 serviços')
  })
})

describe('LoadMore', () => {
  it('mostra o texto de estado sem paginação visível: nenhum botão, só o sentinela da rolagem', () => {
    const { container } = render(<LoadMore {...base} />)
    expect(screen.getByRole('status').textContent).toContain('100 de 220 serviços')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/Carregar mais$/)).toBeNull()
    expect(container.querySelector('.gr-sentinel')).not.toBeNull()
  })

  it('durante a carga mostra Carregando mais… e esconde o botão', () => {
    render(<LoadMore {...base} loadingMore />)
    expect(screen.getByText('Carregando mais…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('no fim da lista mostra o total e Fim da lista, sem botão nem sentinela', () => {
    const { container } = render(<LoadMore {...base} more={false} loaded={220} />)
    expect(screen.getByText('220 serviços')).toBeTruthy()
    expect(screen.getByText('Fim da lista')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
    expect(container.querySelector('.gr-sentinel')).toBeNull()
  })

  it('em erro mostra a mensagem e Tentar novamente, mantendo as linhas contadas', () => {
    const onRetry = vi.fn()
    const { container } = render(<LoadMore {...base} error="Falha de rede" onRetry={onRetry} />)
    expect(screen.getByText('Falha de rede')).toBeTruthy()
    expect(screen.getByText('100 de 220 serviços')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
    expect(container.querySelector('.gr-sentinel')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('no celular o botão de nova tentativa usa o tamanho de toque', () => {
    render(<LoadMore {...base} error="Falha de rede" touch />)
    expect(screen.getByRole('button', { name: 'Tentar novamente' }).classList.contains('bt-button--touch')).toBe(true)
  })

  it('sem IntersectionObserver não quebra nem pede páginas sozinho', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const onLoadMore = vi.fn()
    const { container } = render(<LoadMore {...base} onLoadMore={onLoadMore} />)
    expect(container.querySelector('.gr-sentinel')).not.toBeNull()
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('o sentinela observa com margem de 800 px e carrega ao intersectar', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const onLoadMore = vi.fn()
    const { container } = render(<LoadMore {...base} onLoadMore={onLoadMore} />)
    const [observer] = FakeObserver.instances
    expect(observer.options).toMatchObject({ root: null, rootMargin: '800px 0px' })
    expect(observer.observed[0]).toBe(container.querySelector('.gr-sentinel'))
    FakeObserver.trigger([{ isIntersecting: false }])
    expect(onLoadMore).not.toHaveBeenCalled()
    FakeObserver.trigger([{ isIntersecting: true }])
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('usa o contêiner de rolagem como raiz, recria o observador quando carrega mais e o desliga ao desmontar', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const scroller = document.createElement('div')
    const root = { current: scroller }
    const { rerender, unmount } = render(<LoadMore {...base} root={root} />)
    expect(FakeObserver.instances[0].options?.root).toBe(scroller)
    rerender(<LoadMore {...base} root={root} loaded={200} />)
    expect(FakeObserver.instances).toHaveLength(2)
    expect(FakeObserver.instances[0].closed).toBe(true)
    expect(FakeObserver.instances[1].closed).toBe(false)
    unmount()
    expect(FakeObserver.instances[1].closed).toBe(true)
  })

  it('sem mais linhas, carregando ou com erro não observa nada', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const { rerender } = render(<LoadMore {...base} more={false} />)
    rerender(<LoadMore {...base} loadingMore />)
    rerender(<LoadMore {...base} error="x" />)
    expect(FakeObserver.instances).toHaveLength(0)
  })

  it('com o sentinela fora do rodapé (tabela), o rodapé não cria observador', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const { container } = render(<LoadMore {...base} sentinel={false} />)
    expect(FakeObserver.instances).toHaveLength(0)
    expect(container.querySelector('.gr-sentinel')).toBeNull()
  })
})
