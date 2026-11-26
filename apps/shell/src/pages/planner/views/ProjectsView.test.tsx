// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sourceModule from '../projetos/data/source'
import { createMockProjetos } from '../projetos/data/mock'
import ProjectsView from './ProjectsView'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/planner?view=projects'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }))
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

/** Fonte de exemplo com alguns métodos trocados; `spy` guarda a fonte real para os testes chamarem por dentro. */
function stubSource(over: (real: sourceModule.Source) => Partial<sourceModule.Source>) {
  const real = sourceModule.createSource
  return vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => { const r = real(host); return { ...r, ...over(r) } })
}

/** Microfone falso: getUserMedia devolve uma faixa e o MediaRecorder entrega um pedaço de áudio ao parar. */
function microfone(falha?: string) {
  const getUserMedia = vi.fn(async () => {
    if (falha) throw new DOMException('negado', falha)
    return { getTracks: () => [{ stop: () => undefined }] }
  })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  class FakeRecorder {
    static isTypeSupported = (t: string) => t === 'audio/webm'
    state = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['som'], { type: 'audio/webm' }) }); this.onstop?.() }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  return getUserMedia
}

const nomeDe = (codigo: string) => createMockProjetos().find((p) => p.codigo === codigo)!.nome
const painel = (codigo: string) => screen.findByRole('dialog', { name: new RegExp(`^${codigo} ·`) })

/** Abre o quadro e clica no cartão do projeto (`PRJ-n`); devolve o drawer do detalhe. */
async function abrir(codigo: string, render0 = true) {
  if (render0) render(<ProjectsView host={{ mode: 'mock' }} />)
  fireEvent.click(await screen.findByRole('button', { name: nomeDe(codigo) }))
  return painel(codigo)
}

describe('Projetos no Planner: detalhe do cartão', () => {
  it('cartão abre o detalhe e grava ?projeto= no endereço; sem link para o módulo antigo', async () => {
    const p = await abrir('PRJ-1')
    expect(within(p).getByRole('heading', { name: 'Painel de indicadores' })).toBeTruthy()
    expect(window.location.hash).toMatch(/projeto=/)
    expect(document.querySelector('a[href*="#/projetos"]')).toBeNull()
  })







  it('Marcar como Pronto fica travado sem prova; com prova registrada, grava', async () => {
    const updateEtapa = vi.fn(async () => undefined)
    stubSource(() => ({ updateEtapa }))
    const p = await abrir('PRJ-2')
    expect((within(p).getByRole('button', { name: 'Marcar como Pronto (falta prova)' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(p).getByRole('button', { name: 'Nova atualização' }))
    fireEvent.change(within(p).getByRole('textbox', { name: /^Texto/ }), { target: { value: 'Seletor publicado no DEV.' } })
    fireEvent.change(within(p).getByLabelText('Escolher anexos'), { target: { files: [new File(['x'], 'seletor.png', { type: 'image/png' })] } })
    fireEvent.click(within(p).getByRole('checkbox', { name: /É prova/ }))
    fireEvent.click(within(p).getByRole('button', { name: 'Registrar atualização' }))
    expect((await within(p).findAllByRole('button', { name: /Abrir anexo seletor.png/ })).length).toBeGreaterThan(0)
    const pronto = within(p).getByRole('button', { name: 'Marcar como Pronto' }) as HTMLButtonElement
    expect(pronto.disabled).toBe(false)
    fireEvent.click(pronto)
    await waitFor(() => expect(updateEtapa).toHaveBeenCalledWith(expect.any(String), { cr40f_status: 100000003 }))
    expect(await within(p).findByRole('img', { name: /Fase 5 de 5/ })).toBeTruthy()
  })

  it('gestor: Pronto travado ("só o Renan") e situação travada no drawer do projeto', async () => {
    render(<ProjectsView host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Gestor' }))
    const p = await abrir('PRJ-1', false)
    expect((within(p).getByRole('button', { name: 'Marcar como Pronto (só o Renan)' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(p).getByRole('button', { name: 'Editar projeto' }))
    const drawer = await screen.findByRole('dialog', { name: /^PRJ-1 ·/ })
    expect((within(drawer).getByRole('combobox', { name: /^Situação/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('transcrição aparece na linha do tempo; áudio do briefing sem transcrição mostra "Transcrição pendente"', async () => {
    const p = await abrir('PRJ-1')
    expect(within(p).getByText(/Só falta o filtro por cliente/)).toBeTruthy()
    expect(within(p).getByRole('button', { name: /Ouvir áudio audio-conferencia.wav/ })).toBeTruthy()
    const p4 = await abrir('PRJ-4', false)
    const brief = within(p4).getByRole('group', { name: 'Briefing do gestor' })
    expect(within(brief).getByText('Transcrição pendente')).toBeTruthy()
  })

  it('"Como usar" aparece no painel quando o projeto tem instruções', async () => {
    const p = await abrir('PRJ-1')
    fireEvent.click(within(p).getByText('Como usar'))
    expect(within(p).getByText(/Escolha o período no topo da tela/)).toBeTruthy()
  })

  it('Gravar áudio no painel grava (MediaRecorder simulado), pré-escuta e registra no briefing com o autor do perfil', async () => {
    microfone()
    const add = vi.fn()
    stubSource((r) => ({ addAtualizacao: async (n, f) => { add(n, f); return r.addAtualizacao(n, f) } }))
    const p = await abrir('PRJ-4')
    fireEvent.click(within(p).getByRole('button', { name: 'Gravar áudio' }))
    expect(await within(p).findByText(/Gravando/)).toBeTruthy()
    fireEvent.click(within(p).getByRole('button', { name: 'Parar' }))
    expect(await within(p).findByLabelText('Pré-escuta da gravação')).toBeTruthy()
    fireEvent.click(within(p).getByRole('button', { name: 'Registrar atualização' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    const [nova, arquivos] = add.mock.calls[0] as [sourceModule.NovaAtualizacao, File[]]
    expect(nova).toMatchObject({ etapaId: null, autor: 100000000, prova: false })
    expect(arquivos[0].type).toBe('audio/webm')
    const brief = within(p).getByRole('group', { name: 'Briefing do gestor' })
    await waitFor(() => expect(within(brief).getAllByText('Transcrição pendente')).toHaveLength(2))
  })

  it('microfone negado mostra o aviso e deixa anexar arquivo', async () => {
    microfone('NotAllowedError')
    const p = await abrir('PRJ-4')
    fireEvent.click(within(p).getByRole('button', { name: 'Gravar áudio' }))
    expect(await within(p).findByText(/não liberou o microfone/)).toBeTruthy()
    expect(within(p).getByRole('button', { name: 'Anexar arquivos' })).toBeTruthy()
  })

  it('arquivo acima de 5 MB é recusado com a mensagem do limite', async () => {
    const p = await abrir('PRJ-2')
    fireEvent.click(within(p).getByRole('button', { name: 'Anexar ao briefing' }))
    const grande = new File(['x'], 'video.mp4', { type: 'video/mp4' })
    Object.defineProperty(grande, 'size', { value: 6 * 1024 * 1024 })
    fireEvent.change(within(p).getByLabelText('Escolher anexos'), { target: { files: [grande] } })
    expect(await within(p).findByText(/passa do limite de 5 MB/)).toBeTruthy()
  })

  it('alteração não registrada no detalhe ou no formulário pede para descartar', async () => {
    const p = await abrir('PRJ-2')
    fireEvent.click(within(p).getByRole('button', { name: 'Nova atualização' }))
    fireEvent.change(within(p).getByRole('textbox', { name: /^Texto/ }), { target: { value: 'Rascunho' } })
    fireEvent.click(within(p).getByRole('button', { name: 'Fechar painel' }))
    const confirmar = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Continuar editando' }))
    expect(within(await painel('PRJ-2')).getByRole('heading', { name: 'Cadastro de documentos' })).toBeTruthy()
    fireEvent.click(within(await painel('PRJ-2')).getByRole('button', { name: 'Fechar painel' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^PRJ-2 ·/ })).toBeNull())

    const p1 = await abrir('PRJ-1', false)
    fireEvent.click(within(p1).getByRole('button', { name: 'Editar projeto' }))
    const drawer = await screen.findByRole('dialog', { name: /^PRJ-1 ·/ })
    fireEvent.change(within(drawer).getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Outro nome' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    // Fechar o formulário volta ao detalhe do mesmo projeto.
    expect(await within(await painel('PRJ-1')).findByRole('heading', { name: 'Painel de indicadores' })).toBeTruthy()
  })


  it('editar o projeto grava projeto e etapa 1 (o que falta e situação)', async () => {
    const updateProjeto = vi.fn(async () => undefined)
    const updateEtapa = vi.fn(async () => undefined)
    stubSource(() => ({ updateProjeto, updateEtapa }))
    const p = await abrir('PRJ-2')
    fireEvent.click(within(p).getByRole('button', { name: 'Editar projeto' }))
    const drawer = await screen.findByRole('dialog', { name: /^PRJ-2 ·/ })
    fireEvent.change(within(drawer).getByRole('textbox', { name: /^O que falta/ }), { target: { value: 'Testar o alerta' } })
    fireEvent.change(within(drawer).getByRole('textbox', { name: /^Como usar/ }), { target: { value: 'Abra Cadastros > Documentos.' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(updateProjeto).toHaveBeenCalledWith(expect.any(String), { cr40f_instrucoes: 'Abra Cadastros > Documentos.' }))
    expect(updateEtapa).toHaveBeenCalledWith(expect.any(String), { cr40f_name: 'Testar o alerta' })
  })
})
