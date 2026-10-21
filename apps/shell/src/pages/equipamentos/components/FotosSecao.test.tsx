// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sourceModule from '../data/source'
import { EquipamentosPage } from '../EquipamentosPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/equipamentos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const openButton = (nome: string) => screen.findByRole('button', { name: new RegExp(`^${nome}`) })
const rowOf = async (nome: string) => (await openButton(nome)).closest('.bt-table__row') as HTMLElement
const thumbDaLinha = async (nome: string) => (await rowOf(nome)).querySelector<HTMLImageElement>('.eq-thumb img')

/** Fonte de exemplo com `addFoto` espionado (e as demais trocadas quando o teste pede). */
function espionar(over: Partial<sourceModule.Source> = {}) {
  const real = sourceModule.createSource
  const addFoto = vi.fn<sourceModule.Source['addFoto']>()
  vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => {
    const s = real(host)
    addFoto.mockImplementation(s.addFoto)
    return { ...s, addFoto, ...over }
  })
  return addFoto
}

async function abrir(nome: string) {
  render(<EquipamentosPage host={{ mode: 'mock' }} />)
  fireEvent.click(await openButton(nome))
  return screen.findByRole('dialog', { name: nome })
}

const secao = (dialog: HTMLElement) => within(dialog).getByRole('region', { name: /^Fotos/ })
const fotosCarregadas = (dialog: HTMLElement) => waitFor(() => expect(within(dialog).queryByText('Carregando fotos…')).toBeNull())
const imagem = (nome: string, type = 'image/png', size = 2048) => {
  const f = new File(['conteudo'], nome, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

/** Ctrl+V no elemento (o listener é da janela, como na ficha do veículo). */
function colar(alvo: Element, files: File[], texto?: string) {
  const items = [
    ...(texto != null ? [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] : []),
    ...files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
  ]
  const types = [...(texto != null ? ['text/plain'] : []), ...(files.length ? ['Files'] : [])]
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { items, types } })
  act(() => { alvo.dispatchEvent(event) })
  return event
}

const soltar = (alvo: Element, files: File[]) => fireEvent.drop(alvo, { dataTransfer: { types: ['Files'], files } })
const nomesDasFotos = (dialog: HTMLElement) => within(dialog).queryAllByRole('button', { name: /^Ver / }).map((b) => b.getAttribute('aria-label')!.slice(4))
const capas = (dialog: HTMLElement) => [...dialog.querySelectorAll('.eq-foto--capa .eq-foto__nome')].map((e) => e.textContent)

describe('Fotos do equipamento', () => {
  it('mostra as fotos do item com a capa marcada e a miniatura da capa na lista', async () => {
    const dialog = await abrir('Notebook do Financeiro')
    await waitFor(() => expect(nomesDasFotos(dialog)).toEqual(['notebook-frente.jpg', 'notebook-etiqueta.jpg']))
    expect(capas(dialog)).toEqual(['notebook-frente.jpg'])
    expect(within(secao(dialog)).getByText('Capa')).toBeTruthy()
    expect((await thumbDaLinha('Notebook do Financeiro'))?.getAttribute('src')).toContain('frente')
    // Sem foto: ícone do tipo, sem <img> (nada de imagem quebrada).
    expect(await thumbDaLinha('Notebook reserva')).toBeNull()
  })

  it('Ctrl+V de uma imagem envia a foto; a primeira vira capa e aparece na lista', async () => {
    const addFoto = espionar()
    const dialog = await abrir('Notebook reserva')
    await fotosCarregadas(dialog)
    expect(within(dialog).getByText(/Nenhuma foto ainda/)).toBeTruthy()
    const event = colar(document.body, [imagem('image.png')])
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(nomesDasFotos(dialog)).toHaveLength(1))
    expect(addFoto).toHaveBeenCalledTimes(1)
    expect(addFoto.mock.calls[0][2]).toMatch(/^Foto colada \d{4}-\d{2}-\d{2} \d{2}h\d{2}m\d{2}s\.png$/)
    expect(addFoto.mock.calls[0][3]).toBe(true)
    expect(capas(dialog)).toHaveLength(1)
    await waitFor(async () => expect((await thumbDaLinha('Notebook reserva'))?.getAttribute('src')).toMatch(/^data:image\/png/))
  })

  it('colar texto num campo do formulário não cria foto', async () => {
    const addFoto = espionar()
    const dialog = await abrir('Notebook reserva')
    await fotosCarregadas(dialog)
    const descricao = dialog.querySelector('.eq-form [name="descricao"]')!
    expect(colar(descricao, [], 'Notebook da recepção').defaultPrevented).toBe(false)
    // Imagem copiada de uma página vem com texto: no campo, vale o texto.
    expect(colar(descricao, [imagem('image.png')], 'texto').defaultPrevented).toBe(false)
    await new Promise((r) => setTimeout(r, 50))
    expect(addFoto).not.toHaveBeenCalled()
    expect(within(dialog).getByText(/Nenhuma foto ainda/)).toBeTruthy()
  })

  it('arrastar 3 imagens envia uma a uma, na ordem, com progresso; só a primeira vira capa', async () => {
    const addFoto = espionar()
    const dialog = await abrir('Monitor 24" recepção')
    await fotosCarregadas(dialog)
    soltar(secao(dialog), [imagem('1-frente.png'), imagem('2-lado.jpg', 'image/jpeg'), imagem('3-etiqueta.png')])
    expect(await within(dialog).findByRole('progressbar', { name: /Enviando foto 1 de 3 · 1-frente\.png/ })).toBeTruthy()
    await waitFor(() => expect(nomesDasFotos(dialog)).toEqual(['1-frente.png', '2-lado.jpg', '3-etiqueta.png']), { timeout: 10_000 })
    expect(addFoto.mock.calls.map((c) => [c[2], c[3]])).toEqual([['1-frente.png', true], ['2-lado.jpg', false], ['3-etiqueta.png', false]])
    expect(capas(dialog)).toEqual(['1-frente.png'])
    await waitFor(() => expect(within(dialog).queryByRole('progressbar')).toBeNull())
  })

  it('PDF ou imagem acima de 5 MB: mensagem clara e nada é enviado', async () => {
    const addFoto = espionar()
    const dialog = await abrir('Notebook reserva')
    await fotosCarregadas(dialog)
    soltar(secao(dialog), [imagem('nota.pdf', 'application/pdf'), imagem('grande.png', 'image/png', 6 * 1024 * 1024)])
    const alerta = await within(dialog).findByText('2 fotos não foram enviadas')
    const box = alerta.closest('.bt-alert') as HTMLElement
    expect(within(box).getByText('nota.pdf: Use PNG, JPG, GIF ou BMP.')).toBeTruthy()
    expect(within(box).getByText('grande.png: A imagem deve ter até 5 MB.')).toBeTruthy()
    expect(addFoto).not.toHaveBeenCalled()
    expect(within(dialog).queryByRole('progressbar')).toBeNull()
  })

  it('definir como capa deixa só a escolhida marcada e troca a miniatura da lista', async () => {
    const dialog = await abrir('Notebook do Financeiro')
    await waitFor(() => expect(nomesDasFotos(dialog)).toHaveLength(2))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Definir notebook-etiqueta.jpg como capa' }))
    await waitFor(() => expect(capas(dialog)).toEqual(['notebook-etiqueta.jpg']))
    expect(within(dialog).queryByRole('button', { name: 'Definir notebook-etiqueta.jpg como capa' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Definir notebook-frente.jpg como capa' })).toBeTruthy()
    await waitFor(async () => expect((await thumbDaLinha('Notebook do Financeiro'))?.getAttribute('src')).toContain('etiqueta'))
  })

  it('excluir a capa (confirmando) promove a mais antiga; excluir a última volta a lista ao ícone', async () => {
    const dialog = await abrir('Notebook do Financeiro')
    await waitFor(() => expect(nomesDasFotos(dialog)).toHaveLength(2))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir notebook-frente.jpg' }))
    const confirma = await screen.findByRole('dialog', { name: 'Excluir foto?' })
    expect(within(confirma).getByText(/A foto mais antiga restante vira a capa/)).toBeTruthy()
    fireEvent.click(within(confirma).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(nomesDasFotos(dialog)).toEqual(['notebook-etiqueta.jpg']))
    await waitFor(() => expect(capas(dialog)).toEqual(['notebook-etiqueta.jpg']))
    await waitFor(async () => expect((await thumbDaLinha('Notebook do Financeiro'))?.getAttribute('src')).toContain('etiqueta'))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir notebook-etiqueta.jpg' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Excluir foto?' })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(within(dialog).getByText(/Nenhuma foto ainda/)).toBeTruthy())
    await waitFor(async () => expect(await thumbDaLinha('Notebook do Financeiro')).toBeNull())
    // O drawer continua aberto depois das exclusões.
    expect(screen.getByRole('dialog', { name: 'Notebook do Financeiro' })).toBeTruthy()
  })

  it('cancelar a exclusão não apaga nada', async () => {
    const dialog = await abrir('Maquininha Carlos')
    await waitFor(() => expect(nomesDasFotos(dialog)).toEqual(['maquininha.jpg']))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir maquininha.jpg' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Excluir foto?' })).getByRole('button', { name: 'Cancelar' }))
    await new Promise((r) => setTimeout(r, 300))
    expect(nomesDasFotos(dialog)).toEqual(['maquininha.jpg'])
  })

  it('item novo: seção desabilitada com o aviso; colar imagem não envia', async () => {
    const addFoto = espionar()
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await openButton('Notebook reserva')
    fireEvent.click(screen.getByRole('button', { name: 'Novo equipamento' }))
    const dialog = await screen.findByRole('dialog', { name: 'Novo equipamento' })
    expect(within(secao(dialog)).getByText('Salve o item para adicionar fotos.')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Adicionar fotos' })).toHaveProperty('disabled', true)
    colar(document.body, [imagem('image.png')])
    expect(await within(dialog).findByText('Uma foto não foi enviada')).toBeTruthy()
    expect(addFoto).not.toHaveBeenCalled()
  })

  it('clicar na miniatura abre a foto grande; Esc fecha só ela', async () => {
    const dialog = await abrir('Notebook do Financeiro')
    await waitFor(() => expect(nomesDasFotos(dialog)).toHaveLength(2))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ver notebook-etiqueta.jpg' }))
    const viewer = await screen.findByRole('dialog', { name: 'notebook-etiqueta.jpg' })
    expect(within(viewer).getByRole('img', { name: 'notebook-etiqueta.jpg' })).toBeTruthy()
    fireEvent(viewer, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'notebook-etiqueta.jpg' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Notebook do Financeiro' })).toBeTruthy()
  })

  it('não fecha o drawer no meio do envio', async () => {
    let liberar!: () => void
    const real = sourceModule.createSource
    vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => {
      const s = real(host)
      return { ...s, addFoto: async (...args) => { await new Promise<void>((r) => { liberar = r }); return s.addFoto(...args) } }
    })
    const dialog = await abrir('Notebook reserva')
    await fotosCarregadas(dialog)
    colar(document.body, [imagem('image.png')])
    await within(dialog).findByRole('progressbar')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar painel' }))
    expect(await screen.findByText('Aguarde o envio das fotos terminar.')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Notebook reserva' })).toBeTruthy()
    act(() => liberar())
    await waitFor(() => expect(nomesDasFotos(dialog)).toHaveLength(1))
  })

  it('falha ao carregar as fotos mostra o erro só na seção, com Tentar de novo', async () => {
    espionar({ fotos: async () => { throw new Error('Tabela cr40f_fotoequipamento não encontrada na metadata.') } })
    const dialog = await abrir('Notebook reserva')
    expect(await within(dialog).findByText('Tabela cr40f_fotoequipamento não encontrada na metadata.')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Adicionar fotos' })).toHaveProperty('disabled', true)
    // O formulário continua utilizável.
    expect(dialog.querySelector('.eq-form [name="descricao"]')).toBeTruthy()
  })

  it('falha no envio de uma foto não para as outras', async () => {
    const real = sourceModule.createSource
    vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => {
      const s = real(host)
      return { ...s, addFoto: async (id, file, nome, capa) => { if (nome === 'b.png') throw new Error('Sem permissão.'); return s.addFoto(id, file, nome, capa) } }
    })
    const dialog = await abrir('Notebook reserva')
    await fotosCarregadas(dialog)
    soltar(secao(dialog), [imagem('a.png'), imagem('b.png'), imagem('c.png')])
    await waitFor(() => expect(nomesDasFotos(dialog)).toEqual(['a.png', 'c.png']), { timeout: 10_000 })
    expect(within(dialog).getByText('b.png: não foi enviada. Sem permissão.')).toBeTruthy()
    expect(capas(dialog)).toEqual(['a.png'])
  })
})
