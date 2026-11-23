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
const esc = (t: string) => t.replace(/\./g, '\\.')

/** Abre a tela e clica na linha (etapa `PRJ-n.m` ou projeto `PRJ-n`); devolve o painel lateral. */
async function abrir(codigo: string, render0 = true) {
  if (render0) render(<ProjetosPage host={{ mode: 'mock' }} />)
  const nome = codigo.includes('.') ? new RegExp(`^${esc(codigo)} `) : new RegExp(`^Projeto ${esc(codigo)} `)
  fireEvent.click(await screen.findByRole('button', { name: nome }))
  const p = await painel()
  await within(p).findAllByText(codigo.includes('.') ? new RegExp(`^${esc(codigo)} ·`) : new RegExp(`^${esc(codigo)}`))
  return p
}

describe('Projetos', () => {
  it('lista agrupada com trilha, ação pendente, chips com contagem e selo de exemplo', async () => {
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    const linha = await screen.findByRole('button', { name: /^PRJ-1\.2 Seletor de período\. PRJ-1\.2: fase 3 de 5, DEV \(Conferir\)\. Pendente: Conferir\./ })
    expect(within(linha).getByRole('img', { name: 'PRJ-1.2: fase 3 de 5, DEV (Conferir)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^PRJ-3\.2 .*fase 4 de 5, PROD.*Pendente: Anexar prova\./ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Projeto PRJ-4 .*Pendente: Montar brief\./ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^PRJ-5\.1 .*pausada/ })).toBeTruthy()
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
    const chips = screen.getByRole('group', { name: 'Filtros rápidos' })
    expect(within(chips).getByRole('button', { name: 'Precisa de mim · 3' })).toBeTruthy()
    fireEvent.click(within(chips).getByRole('button', { name: 'Em validação · 1' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^PRJ-2\.1 / })).toBeNull())
    expect(screen.getByRole('button', { name: /^PRJ-1\.2 / })).toBeTruthy()
    fireEvent.click(within(chips).getByRole('button', { name: /^Concluídos com prova/ }))
    expect(await screen.findByRole('button', { name: /^PRJ-3\.1 / })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^PRJ-1\.1 / })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^PRJ-1\.2 / })).toBeNull()
    // Gestor não tem o chip "Precisa de mim" (a regra é do Renan).
    fireEvent.click(screen.getByRole('radio', { name: 'Gestor' }))
    await waitFor(() => expect(within(chips).queryByRole('button', { name: /^Precisa de mim/ })).toBeNull())
  })

  it('recolhe o grupo e anda entre as linhas pelo teclado', async () => {
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    const toggle = await screen.findByRole('button', { name: 'Recolher etapas de PRJ-1' })
    fireEvent.click(toggle)
    await waitFor(() => expect(screen.queryByRole('button', { name: /^PRJ-1\.2 / })).toBeNull())
    expect(screen.getByRole('button', { name: 'Mostrar etapas de PRJ-1' }).getAttribute('aria-expanded')).toBe('false')
    const p1 = screen.getByRole('button', { name: /^Projeto PRJ-1 / })
    p1.focus()
    fireEvent.keyDown(p1, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Projeto PRJ-2 / }))
  })

  it('gestor cria o projeto (PRJ-6) e a primeira etapa nasce PRJ-6.1 em Ideia', async () => {
    const createEtapa = vi.fn()
    stubSource((r) => ({ createEtapa: async (c, n) => { createEtapa(c, n); return r.createEtapa(c, n) } }))
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Gestor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }))
    const novo = await screen.findByRole('dialog', { name: 'Novo projeto' })
    fireEvent.change(within(novo).getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Agenda de manutenção' } })
    fireEvent.change(within(novo).getByRole('textbox', { name: /^O que precisa/ }), { target: { value: 'Quero ver as revisões da semana.' } })
    fireEvent.click(within(novo).getByRole('button', { name: 'Cadastrar projeto' }))
    const p = await painel()
    expect(await within(p).findByRole('heading', { name: 'Agenda de manutenção' })).toBeTruthy()
    expect(within(p).getByText('Quero ver as revisões da semana.')).toBeTruthy()
    fireEvent.click(within(p).getByRole('button', { name: 'Nova etapa' }))
    const etapa = await screen.findByRole('dialog', { name: 'Nova etapa PRJ-6.1' })
    expect(within(etapa).queryByRole('combobox', { name: /^Status/ })).toBeNull()
    fireEvent.change(within(etapa).getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Lista de revisões' } })
    fireEvent.click(within(etapa).getByRole('button', { name: 'Cadastrar etapa' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Nova etapa/ })).toBeNull())
    expect(await within(await painel()).findByRole('heading', { name: 'Lista de revisões' })).toBeTruthy()
    expect(createEtapa).toHaveBeenCalledWith(expect.objectContaining({ cr40f_name: 'Lista de revisões', cr40f_status: 100000000 }), expect.objectContaining({ numero: 1, codigo: 'PRJ-6.1' }))
    expect(screen.getByRole('button', { name: /^PRJ-6\.1 Lista de revisões\. PRJ-6\.1: fase 1 de 5, Ideia/ })).toBeTruthy()
  })

  it('Concluir fica travado sem prova da etapa; com prova registrada nela, grava', async () => {
    const updateEtapa = vi.fn(async () => undefined)
    stubSource(() => ({ updateEtapa }))
    const p = await abrir('PRJ-1.2')
    const travado = within(p).getByRole('button', { name: 'Concluir (falta prova)' }) as HTMLButtonElement
    expect(travado.disabled).toBe(true)

    fireEvent.click(within(p).getByRole('button', { name: 'Nova atualização' }))
    fireEvent.change(within(p).getByRole('textbox', { name: /^Texto/ }), { target: { value: 'Seletor publicado no DEV.' } })
    fireEvent.change(within(p).getByLabelText('Escolher anexos'), { target: { files: [new File(['x'], 'seletor.png', { type: 'image/png' })] } })
    fireEvent.click(within(p).getByRole('checkbox', { name: /É prova/ }))
    fireEvent.click(within(p).getByRole('button', { name: 'Registrar atualização' }))
    const linha = await within(p).findByRole('list', { name: 'Atualizações da etapa' })
    expect(await within(linha).findByRole('button', { name: /Abrir anexo seletor.png/ })).toBeTruthy()
    expect(within(p).getByRole('heading', { name: 'Provas · 1' })).toBeTruthy()
    const concluir = within(p).getByRole('button', { name: 'Concluir' }) as HTMLButtonElement
    expect(concluir.disabled).toBe(false)
    fireEvent.click(concluir)
    await waitFor(() => expect(updateEtapa).toHaveBeenCalledWith(expect.any(String), { cr40f_status: 100000003 }))
    expect(await within(p).findByRole('img', { name: /fase 5 de 5, Prova/ })).toBeTruthy()
  })

  it('gestor: Concluir travado ("só o Renan") e status travado no drawer da etapa', async () => {
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Gestor' }))
    const p = await abrir('PRJ-1.2', false)
    expect((within(p).getByRole('button', { name: 'Concluir (só o Renan)' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(p).getByRole('button', { name: 'Editar etapa' }))
    const etapa = await screen.findByRole('dialog', { name: /^PRJ-1\.2 ·/ })
    expect((within(etapa).getByRole('combobox', { name: /^Status/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(etapa).getAllByText('Só o Renan muda o status da etapa.').length).toBeGreaterThan(0)
  })

  it('transcrição preenchida aparece na etapa; áudio do briefing sem transcrição mostra "Transcrição pendente"', async () => {
    const p = await abrir('PRJ-1.2')
    expect(within(p).getByText(/Só falta o filtro por cliente/)).toBeTruthy()
    expect(within(p).getByRole('button', { name: /Ouvir áudio audio-conferencia.wav/ })).toBeTruthy()
    const p4 = await abrir('PRJ-4', false)
    const brief = within(p4).getByRole('group', { name: 'Briefing do gestor' })
    expect(within(brief).getByText('Transcrição pendente')).toBeTruthy()
    expect(within(p4).getByText(/Nenhuma etapa ainda/)).toBeTruthy()
  })

  it('Gravar áudio no painel grava (MediaRecorder simulado), pré-escuta e registra no briefing com o autor do perfil', async () => {
    microfone()
    const add = vi.fn()
    stubSource((r) => ({ addAtualizacao: async (n, f) => { add(n, f); return r.addAtualizacao(n, f) } }))
    const p = await abrir('PRJ-4')
    fireEvent.click(within(p).getByRole('button', { name: 'Gravar áudio' }))
    expect(await within(p).findByText(/Gravando/)).toBeTruthy()
    expect(within(p).getByText('Renan')).toBeTruthy()
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
    const p = await abrir('PRJ-2.1')
    fireEvent.click(within(p).getByRole('button', { name: 'Nova atualização' }))
    fireEvent.change(within(p).getByRole('textbox', { name: /^Texto/ }), { target: { value: 'Rascunho' } })
    fireEvent.click(screen.getByRole('button', { name: /^PRJ-1\.2 / }))
    const confirmar = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Continuar editando' }))
    expect(within(await painel()).getByRole('heading', { name: 'Tabela e tela de cadastro' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^PRJ-1\.2 / }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    expect(await within(await painel()).findByRole('heading', { name: 'Seletor de período' })).toBeTruthy()

    fireEvent.click(within(await painel()).getByRole('button', { name: 'Editar etapa' }))
    const etapa = await screen.findByRole('dialog', { name: /^PRJ-1\.2 ·/ })
    fireEvent.change(within(etapa).getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Outro nome' } })
    fireEvent.click(within(etapa).getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^PRJ-1\.2 ·/ })).toBeNull())
  })

  it('abas Provas (filtro por tipo) e Instruções (edita e grava)', async () => {
    const updateProjeto = vi.fn(async () => undefined)
    stubSource(() => ({ updateProjeto }))
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Provas' }))
    const galeria = await screen.findByRole('list', { name: 'Provas' })
    expect(within(galeria).getAllByRole('listitem').length).toBe(3)
    fireEvent.click(screen.getByRole('radio', { name: 'Vídeos' }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Provas' })).getAllByRole('listitem')).toHaveLength(1))
    fireEvent.click(screen.getByRole('radio', { name: 'Áudios' }))
    expect(await screen.findByText('Nenhuma prova com estes filtros')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Instruções' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Editar instruções de PRJ-2' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Como usar PRJ-2' }), { target: { value: 'Abra Cadastros > Documentos.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar instruções' }))
    await waitFor(() => expect(updateProjeto).toHaveBeenCalledWith(expect.any(String), { cr40f_instrucoes: 'Abra Cadastros > Documentos.' }))
    expect(await screen.findByText('Abra Cadastros > Documentos.')).toBeTruthy()
  })
})
