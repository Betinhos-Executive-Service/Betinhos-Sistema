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
  it('cartão abre o detalhe com título, descrição e checklist; mostra o progresso no cartão', async () => {
    render(<ProjectsView host={{ mode: 'mock' }} />)
    expect(await screen.findByLabelText('Checklist 2/3')).toBeTruthy()
    const p = await abrir('PRJ-1', false)
    expect((within(p).getByRole('textbox', { name: /^Título/ }) as HTMLInputElement).value).toBe('Painel de indicadores')
    expect(within(p).getByRole('checkbox', { name: 'Filtro por período' })).toBeTruthy()
    expect(window.location.hash).toMatch(/projeto=/)
    expect(document.querySelector('a[href*="#/projetos"]')).toBeNull()
    expect(within(p).queryByText(/Marcar como Pronto/)).toBeNull()
  })

  it('edita título, descrição e checklist (adicionar com Enter, marcar e remover) e salva no projeto', async () => {
    const updateProjeto = vi.fn(async () => undefined)
    stubSource(() => ({ updateProjeto }))
    const p = await abrir('PRJ-2')
    const salvar = within(p).getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    expect(salvar.disabled).toBe(true)
    fireEvent.change(within(p).getByRole('textbox', { name: /^Título/ }), { target: { value: 'Documentos da frota' } })
    fireEvent.change(within(p).getByRole('textbox', { name: /^Descrição/ }), { target: { value: 'Com vencimento.' } })
    const novo = within(p).getByRole('textbox', { name: 'Novo item do checklist' })
    fireEvent.change(novo, { target: { value: 'Testar no DEV' } })
    fireEvent.keyDown(novo, { key: 'Enter' })
    fireEvent.click(within(p).getByRole('checkbox', { name: 'Alerta de vencimento' }))
    fireEvent.click(within(p).getByRole('button', { name: 'Remover Tela de cadastro' }))
    fireEvent.click(salvar)
    await waitFor(() => expect(updateProjeto).toHaveBeenCalledWith(expect.any(String), {
      cr40f_name: 'Documentos da frota', cr40f_briefing: 'Com vencimento.',
      cr40f_checklist: JSON.stringify([{ texto: 'Alerta de vencimento', feito: true }, { texto: 'Testar no DEV', feito: false }]),
    }))
    expect(await screen.findByText('PRJ-2 salvo.')).toBeTruthy()
  })

  it('salvar só o título não regrava descrição nem checklist', async () => {
    const updateProjeto = vi.fn(async () => undefined)
    stubSource(() => ({ updateProjeto }))
    const p = await abrir('PRJ-2')
    fireEvent.change(within(p).getByRole('textbox', { name: /^Título/ }), { target: { value: 'Documentos da frota' } })
    fireEvent.click(within(p).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(updateProjeto).toHaveBeenCalledWith(expect.any(String), { cr40f_name: 'Documentos da frota' }))
  })

  it('Ctrl+S salva e o rodapé avisa alteração não salva', async () => {
    const updateProjeto = vi.fn(async () => undefined)
    stubSource(() => ({ updateProjeto }))
    const p = await abrir('PRJ-2')
    expect(within(p).queryByText('Alterações não salvas')).toBeNull()
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    expect(updateProjeto).not.toHaveBeenCalled()
    const titulo = within(p).getByRole('textbox', { name: /^Título/ })
    fireEvent.change(titulo, { target: { value: 'Documentos da frota' } })
    expect(within(p).getByText('Alterações não salvas')).toBeTruthy()
    fireEvent.keyDown(titulo, { key: 's', ctrlKey: true })
    await waitFor(() => expect(updateProjeto).toHaveBeenCalledWith(expect.any(String), { cr40f_name: 'Documentos da frota' }))
  })

  it('título vazio não salva', async () => {
    const updateProjeto = vi.fn(async () => undefined)
    stubSource(() => ({ updateProjeto }))
    const p = await abrir('PRJ-3')
    fireEvent.change(within(p).getByRole('textbox', { name: /^Título/ }), { target: { value: '  ' } })
    fireEvent.click(within(p).getByRole('button', { name: 'Salvar' }))
    expect(await within(p).findByText('Dê um título para o projeto.')).toBeTruthy()
    expect(updateProjeto).not.toHaveBeenCalled()
  })

  it('anexos ficam numa grade; áudio mostra a transcrição ou "Transcrição pendente"', async () => {
    const p = await abrir('PRJ-1')
    expect(within(p).getByRole('button', { name: /Abrir anexo relatorio-atual.svg/ })).toBeTruthy()
    expect(within(p).getByRole('button', { name: /Ouvir áudio audio-conferencia.wav/ })).toBeTruthy()
    expect(within(p).getByText(/Só falta o filtro por cliente/)).toBeTruthy()
    expect(within(p).getByText('Transcrição')).toBeTruthy()
    const p4 = await abrir('PRJ-4', false)
    expect(within(p4).getByText('Transcrição pendente')).toBeTruthy()
  })

  it('a zona de soltar abre o seletor de arquivos', async () => {
    const p = await abrir('PRJ-3')
    const input = within(p).getByLabelText('Escolher anexos') as HTMLInputElement
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined)
    fireEvent.click(within(p).getByRole('button', { name: /Arraste, cole ou clique para anexar/ }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('anexar arquivo envia na hora como anexo do projeto, com o autor do perfil', async () => {
    const add = vi.fn()
    stubSource((r) => ({ addAtualizacao: async (n, f) => { add(n, f); return r.addAtualizacao(n, f) } }))
    const p = await abrir('PRJ-3')
    fireEvent.change(within(p).getByLabelText('Escolher anexos'), { target: { files: [new File(['x'], 'tela.png', { type: 'image/png' })] } })
    expect(await within(p).findByRole('button', { name: /Abrir anexo tela.png/ })).toBeTruthy()
    const [nova, arquivos] = add.mock.calls[0] as [sourceModule.NovaAtualizacao, File[]]
    expect(nova).toMatchObject({ etapaId: null, texto: '', prova: false })
    expect(arquivos[0].name).toBe('tela.png')
  })

  it('gravar áudio (MediaRecorder simulado) envia o áudio como anexo', async () => {
    microfone()
    const add = vi.fn()
    stubSource((r) => ({ addAtualizacao: async (n, f) => { add(n, f); return r.addAtualizacao(n, f) } }))
    const p = await abrir('PRJ-5')
    fireEvent.click(within(p).getByRole('button', { name: 'Gravar áudio' }))
    expect(await within(p).findByText(/Gravando/)).toBeTruthy()
    fireEvent.click(within(p).getByRole('button', { name: 'Parar gravação' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    expect((add.mock.calls[0][1] as File[])[0].type).toBe('audio/webm')
    expect(await within(p).findByText('Transcrição pendente')).toBeTruthy()
  })

  it('microfone negado mostra o aviso', async () => {
    microfone('NotAllowedError')
    const p = await abrir('PRJ-4')
    fireEvent.click(within(p).getByRole('button', { name: 'Gravar áudio' }))
    expect(await within(p).findByText(/não liberou o microfone/)).toBeTruthy()
  })

  it('arquivo acima de 5 MB é recusado com a mensagem do limite', async () => {
    const add = vi.fn()
    stubSource(() => ({ addAtualizacao: async () => { add(); throw new Error('não devia') } }))
    const p = await abrir('PRJ-2')
    const grande = new File(['x'], 'video.mp4', { type: 'video/mp4' })
    Object.defineProperty(grande, 'size', { value: 6 * 1024 * 1024 })
    fireEvent.change(within(p).getByLabelText('Escolher anexos'), { target: { files: [grande] } })
    expect(await within(p).findByText(/passa do limite de 5 MB/)).toBeTruthy()
    expect(add).not.toHaveBeenCalled()
  })

  it('alteração não salva pede para descartar', async () => {
    const p = await abrir('PRJ-2')
    fireEvent.change(within(p).getByRole('textbox', { name: /^Título/ }), { target: { value: 'Rascunho' } })
    fireEvent.click(within(p).getByRole('button', { name: 'Fechar painel' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Continuar editando' }))
    expect((within(await painel('PRJ-2')).getByRole('textbox', { name: /^Título/ }) as HTMLInputElement).value).toBe('Rascunho')
    fireEvent.click(within(await painel('PRJ-2')).getByRole('button', { name: 'Fechar painel' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^PRJ-2 ·/ })).toBeNull())
  })

  it('arrastar o cartão muda a coluna, inclusive para Pronto sem prova; sem botões de mover', async () => {
    const updateEtapa = vi.fn(async () => undefined)
    stubSource(() => ({ updateEtapa }))
    render(<ProjectsView host={{ mode: 'mock' }} />)
    const cartao = (await screen.findByRole('button', { name: nomeDe('PRJ-1') })).closest('article')!
    expect(within(cartao).queryByRole('button', { name: /Mover|Voltar/ })).toBeNull()
    const dataTransfer = { setData: () => undefined, effectAllowed: '' }
    fireEvent.dragStart(cartao, { dataTransfer })
    const pronto = screen.getByRole('region', { name: 'Pronto' })
    fireEvent.dragOver(pronto, { dataTransfer })
    fireEvent.drop(pronto, { dataTransfer })
    await waitFor(() => expect(updateEtapa).toHaveBeenCalledWith(expect.any(String), { cr40f_status: 100000003 }))
    expect(screen.queryByRole('radio', { name: 'Gestor' })).toBeNull()
  })

  it('soltar em Pausado pede o motivo (opcional), grava junto e mostra no cartão', async () => {
    const updateEtapa = vi.fn(async () => undefined)
    stubSource(() => ({ updateEtapa }))
    render(<ProjectsView host={{ mode: 'mock' }} />)
    const cartao = (await screen.findByRole('button', { name: nomeDe('PRJ-1') })).closest('article')!
    const dataTransfer = { setData: () => undefined, effectAllowed: '' }
    const pausado = screen.getByRole('region', { name: 'Pausado' })
    fireEvent.dragStart(cartao, { dataTransfer }); fireEvent.dragOver(pausado, { dataTransfer }); fireEvent.drop(pausado, { dataTransfer })
    let dialogo = await screen.findByRole('dialog', { name: `Pausar “${nomeDe('PRJ-1')}”` })
    fireEvent(dialogo, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Pausar/ })).toBeNull())
    expect(updateEtapa).not.toHaveBeenCalled()
    fireEvent.dragStart(cartao, { dataTransfer }); fireEvent.dragOver(pausado, { dataTransfer }); fireEvent.drop(pausado, { dataTransfer })
    dialogo = await screen.findByRole('dialog', { name: /^Pausar/ })
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: ' Esperando o cliente ' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Pausar' }))
    await waitFor(() => expect(updateEtapa).toHaveBeenCalledWith(expect.any(String), { cr40f_status: 100000004, cr40f_motivopausa: 'Esperando o cliente' }))
    expect(await within(screen.getByRole('region', { name: 'Pausado' })).findByText('Esperando o cliente')).toBeTruthy()
  })

  it('sair de Pausado limpa o motivo', async () => {
    const updateEtapa = vi.fn(async () => undefined)
    stubSource(() => ({ updateEtapa }))
    render(<ProjectsView host={{ mode: 'mock' }} />)
    const cartao = (await screen.findByRole('button', { name: nomeDe('PRJ-5') })).closest('article')!
    expect(within(cartao).getByText(/Esperando o financeiro/)).toBeTruthy()
    const dataTransfer = { setData: () => undefined, effectAllowed: '' }
    const ideia = screen.getByRole('region', { name: 'Ideia' })
    fireEvent.dragStart(cartao, { dataTransfer }); fireEvent.dragOver(ideia, { dataTransfer }); fireEvent.drop(ideia, { dataTransfer })
    await waitFor(() => expect(updateEtapa).toHaveBeenCalledWith(expect.any(String), { cr40f_status: 100000000, cr40f_motivopausa: null }))
  })

  it('quadro sem tags: sem filtro no topo nem tag no cartão', async () => {
    render(<ProjectsView host={{ mode: 'mock' }} />)
    const cartao = (await screen.findByRole('button', { name: nomeDe('PRJ-1') })).closest('article')!
    expect(screen.queryByRole('group', { name: 'Filtrar por tag' })).toBeNull()
    expect(within(cartao).queryByRole('list', { name: 'Tags' })).toBeNull()
  })

  it('detalhe mostra a coluna e o prazo recolhido; escolher a semana fecha o seletor e grava só o prazo', async () => {
    const updateProjeto = vi.fn(async () => undefined)
    stubSource(() => ({ updateProjeto }))
    const p = await abrir('PRJ-4')
    expect(within(p).getByText('Ideia', { selector: '.pj-coluna' })).toBeTruthy()
    expect(within(p).queryByRole('tab', { name: 'Semana' })).toBeNull()
    expect(within(p).queryByRole('textbox', { name: 'Nova tag' })).toBeNull()
    const prazo = within(p).getByRole('button', { expanded: false, name: /2026/ })
    fireEvent.click(prazo)
    fireEvent.keyDown(within(p).getByRole('group', { name: 'Escolher prazo' }), { key: 'Escape' })
    expect(within(p).queryByRole('group', { name: 'Escolher prazo' })).toBeNull()
    fireEvent.click(prazo)
    fireEvent.click(within(p).getByRole('tab', { name: 'Semana' }))
    fireEvent.click(within(p).getByRole('button', { name: /Semana 3/ }))
    expect(within(p).queryByRole('group', { name: 'Escolher prazo' })).toBeNull()
    fireEvent.click(within(p).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(updateProjeto).toHaveBeenCalledWith(expect.any(String), { cr40f_prazo: '2026-12-20', cr40f_prazotipo: 100000001 }))
  })

  it('detalhe de projeto pausado mostra a coluna Pausado com o motivo', async () => {
    const p = await abrir('PRJ-5')
    expect(within(p).getByText('Pausado', { selector: '.pj-coluna' })).toBeTruthy()
    expect(within(p).getByText(/Esperando o financeiro/)).toBeTruthy()
  })
})
