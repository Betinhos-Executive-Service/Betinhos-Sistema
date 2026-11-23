// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sourceModule from './data/source'
import { ProjetosPage } from './ProjetosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/projetos'
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

const painel = () => screen.findByRole('complementary', { name: 'Detalhe' })

/** Abre a tela e clica na linha do projeto pelo código (`PRJ-n`); devolve o painel lateral. */
async function abrir(codigo: string, render0 = true) {
  if (render0) render(<ProjetosPage host={{ mode: 'mock' }} />)
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${codigo} `) }))
  const p = await painel()
  await within(p).findByText(new RegExp(`^${codigo}`))
  return p
}

describe('Projetos', () => {
  it('lista com uma linha por projeto (nome, situação, o que falta), chips com contagem e selo de exemplo', async () => {
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('button', { name: /^PRJ-1 Painel de indicadores\. Conferir\. O que falta: Conferir os valores com o relatório de outubro\./ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^PRJ-4 .*Ideia\. O que falta: Montar o brief\./ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^PRJ-5 .*Pausado/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^PRJ-\d / })).toHaveLength(5)
    expect(screen.queryByRole('radio', { name: 'Provas' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Instruções' })).toBeNull()
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
    const chips = screen.getByRole('group', { name: 'Filtros rápidos' })
    expect(within(chips).getByRole('button', { name: /^Precisa de mim · \d/ })).toBeTruthy()
    fireEvent.click(within(chips).getByRole('button', { name: 'Conferir · 1' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^PRJ-2 / })).toBeNull())
    expect(screen.getByRole('button', { name: /^PRJ-1 / })).toBeTruthy()
    fireEvent.click(within(chips).getByRole('button', { name: /^Prontos com prova/ }))
    expect(await screen.findByRole('button', { name: /^PRJ-3 / })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^PRJ-1 / })).toBeNull()
    // Gestor não tem o chip "Precisa de mim" (a regra é do Renan).
    fireEvent.click(screen.getByRole('radio', { name: 'Gestor' }))
    await waitFor(() => expect(within(chips).queryByRole('button', { name: /^Precisa de mim/ })).toBeNull())
  })

  it('anda entre as linhas pelo teclado', async () => {
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    const p1 = await screen.findByRole('button', { name: /^PRJ-1 / })
    p1.focus()
    fireEvent.keyDown(p1, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^PRJ-2 / }))
  })

  it('gestor cria o projeto (PRJ-6) e a etapa 1 nasce PRJ-6.1 em Ideia, com o que falta', async () => {
    const createEtapa = vi.fn()
    stubSource((r) => ({ createEtapa: async (c, n) => { createEtapa(c, n); return r.createEtapa(c, n) } }))
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Gestor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Novo' }))
    const novo = await screen.findByRole('dialog', { name: 'Novo projeto' })
    expect(within(novo).queryByRole('combobox', { name: /^Situação/ })).toBeNull()
    fireEvent.change(within(novo).getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Agenda de manutenção' } })
    fireEvent.change(within(novo).getByRole('textbox', { name: /^O que falta/ }), { target: { value: 'Listar as revisões' } })
    fireEvent.change(within(novo).getByRole('textbox', { name: /^O que precisa/ }), { target: { value: 'Quero ver as revisões da semana.' } })
    fireEvent.click(within(novo).getByRole('button', { name: 'Cadastrar projeto' }))
    const p = await painel()
    expect(await within(p).findByRole('heading', { name: 'Agenda de manutenção' })).toBeTruthy()
    expect(within(p).getByText('Quero ver as revisões da semana.')).toBeTruthy()
    await waitFor(() => expect(createEtapa).toHaveBeenCalledWith(expect.objectContaining({ cr40f_name: 'Listar as revisões', cr40f_status: 100000000 }), expect.objectContaining({ numero: 1, codigo: 'PRJ-6.1' })))
    expect(await screen.findByRole('button', { name: /^PRJ-6 Agenda de manutenção\. Ideia\. O que falta: Listar as revisões\./ })).toBeTruthy()
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
    render(<ProjetosPage host={{ mode: 'mock' }} />)
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

  it('alteração não registrada no painel ou no drawer pede para descartar', async () => {
    const p = await abrir('PRJ-2')
    fireEvent.click(within(p).getByRole('button', { name: 'Nova atualização' }))
    fireEvent.change(within(p).getByRole('textbox', { name: /^Texto/ }), { target: { value: 'Rascunho' } })
    fireEvent.click(screen.getByRole('button', { name: /^PRJ-1 / }))
    const confirmar = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Continuar editando' }))
    expect(within(await painel()).getByRole('heading', { name: 'Cadastro de documentos' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^PRJ-1 / }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    expect(await within(await painel()).findByRole('heading', { name: 'Painel de indicadores' })).toBeTruthy()

    fireEvent.click(within(await painel()).getByRole('button', { name: 'Editar projeto' }))
    const drawer = await screen.findByRole('dialog', { name: /^PRJ-1 ·/ })
    fireEvent.change(within(drawer).getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Outro nome' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^PRJ-1 ·/ })).toBeNull())
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
