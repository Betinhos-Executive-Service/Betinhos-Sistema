// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LazyFooter } from './LazyList'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

class FakeObserver {
  static instances: FakeObserver[] = []
  constructor(readonly callback: IntersectionObserverCallback) { FakeObserver.instances.push(this) }
  observe() {}
  disconnect() {}
  fire() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
}

describe('LazyFooter', () => {
  it('sem paginação visível: nada de botão nem contador; a rolagem até o fim pede o próximo lote', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const onLoadMore = vi.fn()
    render(<LazyFooter loaded={50} more onLoadMore={onLoadMore} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/de \d+/)).toBeNull()
    FakeObserver.instances.at(-1)!.fire()
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('fim dos dados: sem sentinela; com a carga completa ainda chegando, avisa discretamente', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const { container, rerender } = render(<LazyFooter loaded={80} more={false} onLoadMore={() => {}} />)
    expect(container.querySelector('.gr-sentinel')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<LazyFooter loaded={80} more={false} onLoadMore={() => {}} pending />)
    expect(screen.getByRole('status').textContent).toBe('Carregando o restante da lista…')
  })

  it('sem IntersectionObserver revela o resto sozinho', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const onLoadMore = vi.fn()
    render(<LazyFooter loaded={50} more onLoadMore={onLoadMore} />)
    expect(onLoadMore).toHaveBeenCalled()
  })
})
