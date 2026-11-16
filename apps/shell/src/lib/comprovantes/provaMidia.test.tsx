// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComprovantesGaleria } from './Galeria'
import type { Comprovante } from './arquivo'
import { createCarregarProvas, mapProva, provasPaths, type CarregarProvas, type ProvaMidia } from './provaMidia'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = '' })

const comProva: Comprovante = { id: 'a1', nome: 'comprovante-1.jpg', url: 'https://betinhos.sharepoint.com/a1.jpg' }
const semProva: Comprovante = { id: 'a2', nome: 'comprovante-2.jpg', url: 'https://betinhos.sharepoint.com/a2.jpg' }
const ler = async (a: Comprovante) => ({ nome: a.nome, mime: 'image/jpeg', url: `blob:${a.id}` })

const prova: ProvaMidia = {
  link: comProva.url!, origem: 'galeria', selos: ['fora-da-janela', 'repetida'], dataGravada: new Date('2026-11-01T13:30:00Z'),
  aparelho: 'Apple iPhone 15', emitidoEm: new Date('2026-11-16T12:00:00Z'), recebidoEm: new Date('2026-11-16T12:04:00Z'), atrasoMinutos: 4,
}

describe('prova de captura nos anexos', () => {
  it('mapeia a linha da tabela: origem, selos pela ordem das choices e detalhes', () => {
    const p = mapProva({
      cr40f_link: 'https://x/1.jpg', cr40f_origemcaptura: 100000002, cr40f_selos: '100000003,100000006', cr40f_datagravada: '2026-11-01T13:30:00Z',
      cr40f_marca: 'Apple', cr40f_modelo: 'iPhone 15', cr40f_emitidoem: '2026-11-16T12:00:00Z', cr40f_recebidoem: '2026-11-16T12:04:00Z', cr40f_atrasominutos: 4,
    })
    expect(p.origem).toBe('galeria')
    expect(p.selos).toEqual(['fora-da-janela', 'parecida'])
    expect(p.aparelho).toBe('Apple iPhone 15')
    expect(mapProva({ cr40f_link: 'l', cr40f_origemcaptura: 100000000, cr40f_selos: '100000000' })).toMatchObject({ origem: 'camera', selos: ['capturada-sem-rede'], dataGravada: null })
  })

  it('consulta por link em lotes de 10, com aspas escapadas', () => {
    const links = Array.from({ length: 12 }, (_, i) => `https://x/${i}'a.jpg`)
    const paths = provasPaths('cr40f_provamidias', [...links, links[0], ''])
    expect(paths).toHaveLength(2)
    expect(decodeURIComponent(paths[0])).toContain("cr40f_link eq 'https://x/0''a.jpg' or")
    expect(decodeURIComponent(paths[1]).match(/cr40f_link eq/g)).toHaveLength(2)
  })

  it('anexo com prova mostra origem e selos; o detalhe abre num toque; anexo sem prova não mostra nada', async () => {
    const carregar: CarregarProvas = vi.fn(async () => new Map([[prova.link, prova]]))
    render(<ComprovantesGaleria anexos={[comProva, semProva]} ler={ler} provas={carregar} />)
    const origem = await screen.findByRole('button', { name: /Galeria\/arquivo/ })
    expect(screen.getByText('Fora da janela')).toBeTruthy()
    expect(screen.getByText('Repetida')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Galeria\/arquivo|Câmera do app/ })).toHaveLength(1)
    expect(origem.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(origem)
    expect(origem.getAttribute('aria-expanded')).toBe('true')
    const detalhe = screen.getByRole('tooltip', { hidden: true })
    expect(detalhe.textContent).toContain('01/11/2026 10:30')
    expect(detalhe.textContent).toContain('Apple iPhone 15')
    expect(detalhe.textContent).toContain('4 min')
    expect(carregar).toHaveBeenCalledWith([comProva.url, semProva.url])
  })

  it('sem prova (ou falha na leitura) não aparece selo nem erro', async () => {
    const carregar: CarregarProvas = vi.fn(async () => { throw new Error('sem acesso') })
    render(<ComprovantesGaleria anexos={[comProva]} ler={ler} provas={carregar} />)
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: /Galeria\/arquivo|Câmera do app/ })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('no Dataverse, tabela ausente vira mapa vazio', async () => {
    const host = { mode: 'dataverse', metadata: { entities: async () => new Map() }, client: { getAll: vi.fn() } } as never
    expect((await createCarregarProvas(host)(['https://x/1.jpg'])).size).toBe(0)
  })
})
