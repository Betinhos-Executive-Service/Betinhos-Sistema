// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComprovantesGaleria } from './Galeria'
import type { Arquivo, Comprovante } from './arquivo'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = '' })

/** IntersectionObserver controlado: `mostrar()` faz todas as miniaturas observadas entrarem na tela. */
function stubObserver() {
  const callbacks: (() => void)[] = []
  vi.stubGlobal('IntersectionObserver', class {
    private ativo = true
    constructor(cb: IntersectionObserverCallback) { callbacks.push(() => { if (this.ativo) cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }) }
    observe() {}
    disconnect() { this.ativo = false }
  })
  return { mostrar: () => act(() => callbacks.forEach((cb) => cb())) }
}

const foto: Comprovante = { id: 'f1', nome: 'recebimento-1.jpg', url: 'https://exemplo.test/f1' }
const video: Comprovante = { id: 'v1', nome: 'recebimento-2', url: 'https://exemplo.test/v1', midia: 'video' }
const imagem = (a: Comprovante): Arquivo => ({ nome: a.nome, mime: 'image/jpeg', url: `blob:${a.id}` })

describe('galeria de comprovantes', () => {
  it('miniatura só busca o arquivo quando entra na tela', async () => {
    const { mostrar } = stubObserver()
    const ler = vi.fn(async (a: Comprovante) => imagem(a))
    render(<ComprovantesGaleria anexos={[foto]} ler={ler} />)
    expect(ler).not.toHaveBeenCalled()
    mostrar()
    expect(await screen.findByRole('button', { name: 'Ver recebimento-1.jpg' })).toBeTruthy()
    expect(ler).toHaveBeenCalledTimes(1)
  })

  it('vídeo fica com ícone na miniatura e só é buscado ao abrir', async () => {
    const { mostrar } = stubObserver()
    const ler = vi.fn(async (a: Comprovante): Promise<Arquivo> => ({ nome: 'recebimento-2.mp4', mime: 'video/mp4', url: `blob:${a.id}` }))
    const { container } = render(<ComprovantesGaleria anexos={[video]} ler={ler} />)
    mostrar()
    expect(screen.getByText('Vídeo')).toBeTruthy()
    expect(ler).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver recebimento-2' }))
    await screen.findByRole('dialog', { name: /Comprovante recebimento-2/ })
    expect(ler).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(container.ownerDocument.querySelector('video.cmp-previa__video')?.getAttribute('src')).toBe('blob:v1'))
  })

  it('vídeo que falha oferece abrir no SharePoint pelo link do anexo', async () => {
    stubObserver()
    const ler = vi.fn(async () => { throw new Error('O arquivo demorou mais de 60 s para chegar.') })
    render(<ComprovantesGaleria anexos={[video]} ler={ler} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver recebimento-2' }))
    const viewer = await screen.findByRole('dialog', { name: /Comprovante recebimento-2/ })
    expect(await within(viewer).findByText('O arquivo demorou mais de 60 s para chegar.')).toBeTruthy()
    expect(within(viewer).getByRole('link', { name: 'Abrir no SharePoint' }).getAttribute('href')).toBe('https://exemplo.test/v1')
  })
})
