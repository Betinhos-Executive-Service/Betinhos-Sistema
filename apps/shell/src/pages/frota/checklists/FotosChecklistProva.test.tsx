// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { configurarProvas, FotosChecklist } from './components/FotosChecklist'
import type { ProvaMidia } from '../../../lib/comprovantes/provaMidia'

afterEach(() => { cleanup(); configurarProvas(undefined) })

const fotos = [
  { link: 'https://betinhos.sharepoint.com/chk/frente.jpg', nomeArquivo: 'frente.jpg', caminho: '' },
  { link: 'https://betinhos.sharepoint.com/chk/traseira.jpg', nomeArquivo: 'traseira.jpg', caminho: '' },
]
const prova: ProvaMidia = { link: fotos[0].link, origem: 'camera', selos: ['capturada-sem-rede'], dataGravada: null, aparelho: '', emitidoEm: null, recebidoEm: new Date('2026-11-16T12:00:00Z'), atrasoMinutos: 95, valorLido: null, dataLida: null }

describe('fotos do checklist com a prova de captura', () => {
  it('mostra origem e selo só na foto que tem prova', async () => {
    configurarProvas(async () => new Map([[prova.link, prova]]))
    render(<FotosChecklist fotos={fotos} rotulo="Frente" />)
    expect(await screen.findByRole('button', { name: /Câmera do app/ })).toBeTruthy()
    expect(screen.getByText('Sem rede')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Câmera do app|Galeria\/arquivo/ })).toHaveLength(1)
  })

  it('sem carregador de provas, nada aparece', () => {
    render(<FotosChecklist fotos={fotos} rotulo="Frente" />)
    expect(screen.queryByRole('button', { name: /Câmera do app|Galeria\/arquivo/ })).toBeNull()
  })
})
