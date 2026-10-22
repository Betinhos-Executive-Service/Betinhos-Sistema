// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sourceModule from '../data/source'
import { createMockEquipamentos } from '../data/mock'
import { EquipamentosPage } from '../EquipamentosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

/** IntersectionObserver simulado: o teste diz quais elementos "apareceram" na tela. */
class FakeObserver {
  static todos: FakeObserver[] = []
  alvos: Element[] = []
  constructor(private cb: IntersectionObserverCallback) { FakeObserver.todos.push(this) }
  observe(el: Element) { this.alvos.push(el) }
  unobserve(el: Element) { this.alvos = this.alvos.filter((a) => a !== el) }
  disconnect() { this.alvos = [] }
  takeRecords() { return [] }
}
function aparecer(els: Element[]) {
  act(() => {
    for (const io of [...FakeObserver.todos]) {
      const vistos = io.alvos.filter((a) => els.includes(a))
      if (vistos.length) io['cb'](vistos.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry), io as unknown as IntersectionObserver)
    }
  })
}

const base = createMockEquipamentos()[0]
const itens = Array.from({ length: 50 }, (_, i) => ({
  ...base, id: `eeeeeeee-0000-4000-8000-${String(900 + i).padStart(12, '0')}`, descricao: `Item ${String(i + 1).padStart(2, '0')}`,
  numeroSerie: `S${i}`, capa: `Equipamentos/DEV/${i}/capa.jpg`,
}))

function montar(falha?: (caminho: string) => boolean) {
  const baixarFoto = vi.fn(async (caminho: string) => {
    if (falha?.(caminho)) throw new Error('O SharePoint não respondeu (HTTP 404)')
    return new File(['x'], caminho, { type: 'image/jpeg' })
  })
  const real = sourceModule.createSource
  vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => {
    const s = real(host)
    return { ...s, baixarFoto, load: async () => ({ ...(await s.load()), equipamentos: itens }) }
  })
  render(<EquipamentosPage host={{ mode: 'mock' }} />)
  return baixarFoto
}
const thumbs = () => [...document.querySelectorAll('.bt-table__row .eq-thumb')]
const pedidos = (fn: ReturnType<typeof montar>) => fn.mock.calls.map((c) => c[0])

beforeEach(() => {
  FakeObserver.todos = []
  window.location.hash = '#/equipamentos'
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  URL.createObjectURL = (b: Blob) => `blob:${b instanceof File ? b.name : 'imagem'}`
  URL.revokeObjectURL = () => undefined
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('capa na lista (SharePoint sob demanda)', () => {
  it('com 50 itens só as linhas visíveis pedem a capa; rolar pede as próximas; voltar não pede de novo', async () => {
    const baixar = montar()
    await screen.findByRole('button', { name: /^Item 01/ })
    await waitFor(() => expect(thumbs()).toHaveLength(50))
    await new Promise((r) => setTimeout(r, 50))
    expect(baixar).not.toHaveBeenCalled()
    // Enquanto não chega, o ícone do tipo.
    expect(thumbs()[0].querySelector('img')).toBeNull()

    aparecer(thumbs().slice(0, 10))
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(10))
    expect(pedidos(baixar)).toEqual(itens.slice(0, 10).map((e) => e.capa))
    await waitFor(() => expect(thumbs()[0].querySelector('img')?.getAttribute('src')).toBe('blob:Equipamentos/DEV/0/capa.jpg'))
    expect(thumbs()[10].querySelector('img')).toBeNull()

    aparecer(thumbs().slice(10, 20))
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(20))
    expect(pedidos(baixar).slice(10)).toEqual(itens.slice(10, 20).map((e) => e.capa))

    // As linhas saem (busca) e voltam: aparecem de novo, mas a capa vem do cache.
    const busca = screen.getByRole('searchbox', { name: 'Buscar equipamentos' })
    fireEvent.change(busca, { target: { value: 'Item 49' } })
    await waitFor(() => expect(thumbs().length).toBeLessThan(3))
    fireEvent.change(busca, { target: { value: '' } })
    await waitFor(() => expect(thumbs()).toHaveLength(50))
    aparecer(thumbs().slice(0, 20))
    await new Promise((r) => setTimeout(r, 50))
    expect(baixar).toHaveBeenCalledTimes(20)
    expect(thumbs()[0].querySelector('img')?.getAttribute('src')).toBe('blob:Equipamentos/DEV/0/capa.jpg')
  })

  it('capa que falha ao baixar mostra o ícone do tipo, sem imagem quebrada', async () => {
    const baixar = montar((c) => c.includes('/1/'))
    await screen.findByRole('button', { name: /^Item 01/ })
    aparecer(thumbs().slice(0, 2))
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(thumbs()[0].querySelector('img')).toBeTruthy())
    expect(thumbs()[1].querySelector('img')).toBeNull()
    expect(thumbs()[1].querySelector('svg')).toBeTruthy()
  })
})
