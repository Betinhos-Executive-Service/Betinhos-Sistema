// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource, type DocsSource } from '../data/source'
import type { Arquivo, DocEmitido } from '../domain/types'
import { Checklist } from './Checklist'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const pdf = (nome = 'cnh.pdf') => new File(['pdf'], nome, { type: 'application/pdf' })

/** Mock com um arquivo já enviado na CNH vigente da Ana. */
async function comArquivoNaCnh(nome = 'cnh.pdf') {
  const source = createMockDocsSource()
  const data = await source.carregar()
  const doc = data.docs.find((d) => d.donoId === 'f-ana' && d.tipoId === 't-cnh' && d.situacao === 'vigente')!
  const arq = await source.enviarArquivo(doc, pdf(nome))
  return { source, doc, arq }
}

const renderChecklist = (source: DocsSource, donoId = 'f-ana') => render(<ToastProvider><Checklist source={source} donoId={donoId} /></ToastProvider>)
const itemCnh = () => screen.findByRole('listitem', { name: 'CNH' })

describe('Checklist', () => {
  it('lista os tipos com estado, abre o histórico pelo ícone e abre a renovação', async () => {
    renderChecklist(createMockDocsSource())
    const cnh = await itemCnh()
    expect(within(cnh).getByText(/^Vencido/)).toBeTruthy()
    expect(within(screen.getByRole('listitem', { name: 'Antecedentes criminais' })).getByText('Faltando')).toBeTruthy()
    expect(within(screen.getByRole('listitem', { name: 'Certidões' })).getByText('Não enviado')).toBeTruthy()
    const historico = within(cnh).getByRole('button', { name: 'Histórico (1)' })
    expect(historico.getAttribute('aria-expanded')).toBe('false')
    expect(within(cnh).queryByText(/Substituído/)).toBeNull()
    fireEvent.click(historico)
    expect(historico.getAttribute('aria-expanded')).toBe('true')
    expect(within(cnh).getAllByText(/Substituído/).length).toBe(1)
    fireEvent.click(within(cnh).getByRole('button', { name: 'Renovar' }))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })

  it('sem vigente: só Adicionar, como ação primária', async () => {
    renderChecklist(createMockDocsSource())
    const ant = await screen.findByRole('listitem', { name: 'Antecedentes criminais' })
    expect(within(ant).getByRole('button', { name: 'Adicionar' }).className).toContain('bt-button--primary')
    expect(within(ant).queryByRole('button', { name: 'Enviar arquivo' })).toBeNull()
    expect(within(ant).queryByRole('button', { name: 'Renovar' })).toBeNull()
  })

  it('vigente sem arquivo: Enviar arquivo é a ação primária e Renovar fica secundário', async () => {
    renderChecklist(createMockDocsSource())
    const cnh = await itemCnh()
    expect(await within(cnh).findByText('Nenhum arquivo enviado.')).toBeTruthy()
    expect(within(cnh).getByRole('button', { name: 'Enviar arquivo' }).className).toContain('bt-button--primary')
    expect(within(cnh).getByRole('button', { name: 'Renovar' }).className).toContain('bt-button--secondary')
  })

  it('arquivos do vigente aparecem sem clicar, com nome amigável; Enviar arquivo vira ícone discreto', async () => {
    const { source, arq } = await comArquivoNaCnh('carteira-nacional-de-habilitacao-digital-frente-e-verso.pdf')
    renderChecklist(source)
    const cnh = await itemCnh()
    const chip = await within(cnh).findByRole('button', { name: 'Abrir carteira-nacional-de-habilitacao-digital-frente-e-verso.pdf' })
    expect(chip.getAttribute('title')).toBe(arq.nome)
    expect(chip.textContent).toContain('…')
    expect(chip.textContent).not.toContain('CNH_')
    const enviar = within(cnh).getByRole('button', { name: 'Enviar arquivo' })
    expect(enviar.className).not.toContain('bt-button--primary')
    expect(enviar.textContent).toBe('')
    expect(within(cnh).queryByText('Nenhum arquivo enviado.')).toBeNull()
    expect(within(cnh).queryByRole('button', { name: 'Arquivos' })).toBeNull()
  })

  it('no máximo 3 listagens de arquivos ao mesmo tempo', async () => {
    const base = createMockDocsSource()
    const extra = (tipoId: string, id: string): DocEmitido => ({ id, tipoId, donoId: 'f-ana', categoria: 'pessoas', numero: '', emissao: null, validade: null, situacao: 'vigente', pasta: '', observacao: '', ultimoMarco: null, modificadoEm: null })
    let ativas = 0
    let pico = 0
    let chamadas = 0
    const source: DocsSource = {
      ...base,
      carregar: async () => { const d = await base.carregar(); d.docs.push(extra('t-cpf', 'x-1'), extra('t-res', 'x-2')); return d },
      arquivos: async () => { chamadas++; ativas++; pico = Math.max(pico, ativas); await new Promise((r) => setTimeout(r, 40)); ativas--; return [] },
    }
    renderChecklist(source)
    await waitFor(() => expect(screen.getAllByText('Nenhum arquivo enviado.')).toHaveLength(5))
    expect(chamadas).toBe(5)
    expect(pico).toBe(3)
  })

  it('clique no arquivo abre a janela no gesto do usuário e carrega o arquivo nela', async () => {
    const criar = vi.fn(() => 'blob:teste')
    const original = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL }
    URL.createObjectURL = criar; URL.revokeObjectURL = vi.fn()
    const janela = { location: { href: '' }, close: vi.fn() }
    const abrirJanela = vi.fn(() => janela)
    vi.stubGlobal('open', abrirJanela)
    try {
      const { source } = await comArquivoNaCnh()
      renderChecklist(source)
      const cnh = await itemCnh()
      fireEvent.click(await within(cnh).findByRole('button', { name: 'Abrir cnh.pdf' }))
      expect(abrirJanela).toHaveBeenCalledWith('', '_blank')
      await waitFor(() => expect(janela.location.href).toBe('blob:teste'))
      expect(janela.close).not.toHaveBeenCalled()
    } finally {
      URL.createObjectURL = original.criar; URL.revokeObjectURL = original.revogar
    }
  })

  it('pop-up bloqueado mostra o erro inline e não baixa o arquivo', async () => {
    vi.stubGlobal('open', vi.fn(() => null))
    const { source: base } = await comArquivoNaCnh()
    const abrirArquivo = vi.fn(base.abrirArquivo)
    renderChecklist({ ...base, abrirArquivo })
    const cnh = await itemCnh()
    fireEvent.click(await within(cnh).findByRole('button', { name: 'Abrir cnh.pdf' }))
    expect((await within(cnh).findByRole('alert')).textContent).toMatch(/bloqueou/i)
    expect(abrirArquivo).not.toHaveBeenCalled()
  })

  it('falha ao listar arquivos mostra o erro no item e Tentar de novo lista outra vez', async () => {
    const base = createMockDocsSource()
    let falhar = true
    const arquivos = vi.fn((doc: DocEmitido) => (falhar ? Promise.reject(new Error('SharePoint indisponível.')) : base.arquivos(doc)))
    renderChecklist({ ...base, arquivos })
    const cnh = await itemCnh()
    const alerta = await within(cnh).findByRole('alert')
    expect(alerta.textContent).toMatch(/SharePoint indisponível\./)
    falhar = false
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(cnh).findByText('Nenhum arquivo enviado.')).toBeTruthy()
    expect(within(cnh).queryByRole('alert')).toBeNull()
  })

  it('excluir pede confirmação: Cancelar mantém; Excluir remove o arquivo e avisa', async () => {
    const { source: base, doc, arq } = await comArquivoNaCnh()
    const excluirArquivo = vi.fn(base.excluirArquivo)
    renderChecklist({ ...base, excluirArquivo })
    const cnh = await itemCnh()
    fireEvent.click(await within(cnh).findByRole('button', { name: 'Excluir cnh.pdf' }))
    let dialogo = await screen.findByRole('dialog', { name: 'Excluir arquivo?' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Excluir arquivo?' })).toBeNull())
    expect(excluirArquivo).not.toHaveBeenCalled()
    fireEvent.click(within(cnh).getByRole('button', { name: 'Excluir cnh.pdf' }))
    dialogo = await screen.findByRole('dialog', { name: 'Excluir arquivo?' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Arquivo excluído')).toBeTruthy()
    expect(excluirArquivo).toHaveBeenCalledWith(expect.objectContaining({ id: doc.id }), expect.objectContaining({ id: arq.id }))
    await waitFor(() => expect(within(cnh).queryByRole('button', { name: 'Abrir cnh.pdf' })).toBeNull())
    expect(within(cnh).getByRole('button', { name: 'Enviar arquivo' }).className).toContain('bt-button--primary')
  })

  it('falha ao excluir mostra o erro no item e Tentar de novo exclui', async () => {
    const { source: base } = await comArquivoNaCnh()
    let chamadas = 0
    const excluirArquivo = vi.fn((doc: DocEmitido, a: Arquivo) => (++chamadas === 1 ? Promise.reject(new Error('Flow fora do ar.')) : base.excluirArquivo(doc, a)))
    renderChecklist({ ...base, excluirArquivo })
    const cnh = await itemCnh()
    fireEvent.click(await within(cnh).findByRole('button', { name: 'Excluir cnh.pdf' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Excluir arquivo?' })).getByRole('button', { name: 'Excluir' }))
    const alerta = await within(cnh).findByRole('alert')
    expect(alerta.textContent).toMatch(/Arquivo não excluído/)
    expect(alerta.textContent).toMatch(/Flow fora do ar\./)
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Arquivo excluído')).toBeTruthy()
    expect(excluirArquivo).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(within(cnh).queryByRole('button', { name: 'Abrir cnh.pdf' })).toBeNull())
  })

  it('mostra o aviso quando o cadastro não está na lista', async () => {
    renderChecklist(createMockDocsSource(), 'inexistente')
    expect(await screen.findByText('Cadastro não encontrado na lista de documentos.')).toBeTruthy()
  })

  async function renovarCnh(arquivo?: File) {
    const cnh = await itemCnh()
    fireEvent.click(within(cnh).getByRole('button', { name: 'Renovar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renovar CNH' })
    fireEvent.change(within(dialog).getByLabelText('Emissão'), { target: { value: '2026-10-10' } })
    fireEvent.change(within(dialog).getByLabelText(/^Validade/), { target: { value: '2036-10-10' } })
    if (arquivo) fireEvent.change(within(dialog).getByLabelText('Escolher arquivos', { selector: 'input' }), { target: { files: [arquivo] } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    return dialog
  }

  it('renova pelo mock: fecha o drawer, avisa que salvou e atualiza o estado', async () => {
    renderChecklist(createMockDocsSource())
    expect(within(await itemCnh()).getByText(/^Vencido/)).toBeTruthy()
    await renovarCnh()
    expect(await screen.findByText('Documento salvo')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renovar CNH' })).toBeNull())
    await waitFor(() => expect(within(screen.getByRole('listitem', { name: 'CNH' })).queryByText(/^Vencido/)).toBeNull())
    expect(within(screen.getByRole('listitem', { name: 'CNH' })).getByText(/Validade 10\/10\/2036/)).toBeTruthy()
  })

  it('após renovar com arquivo, os arquivos do novo documento aparecem sem clicar', async () => {
    renderChecklist(createMockDocsSource())
    expect(await within(await itemCnh()).findByText('Nenhum arquivo enviado.')).toBeTruthy()
    await renovarCnh(pdf())
    expect(await screen.findByText('Documento salvo')).toBeTruthy()
    const cnh = await waitFor(() => {
      const item = screen.getByRole('listitem', { name: 'CNH' })
      if (!within(item).queryByText(/Validade 10\/10\/2036/)) throw new Error('ainda não renovou')
      return item
    })
    expect(await within(cnh).findByRole('button', { name: 'Abrir cnh.pdf' })).toBeTruthy()
  })

  it('Enviar arquivo só aparece em item com documento vigente', async () => {
    renderChecklist(createMockDocsSource())
    const cnh = await itemCnh()
    expect(await within(cnh).findByRole('button', { name: 'Enviar arquivo' })).toBeTruthy()
    expect(within(screen.getByRole('listitem', { name: 'Antecedentes criminais' })).queryByRole('button', { name: 'Enviar arquivo' })).toBeNull()
  })

  it('Enviar arquivo no vigente: envia, avisa e mostra o arquivo', async () => {
    const base = createMockDocsSource()
    const enviarArquivo = vi.fn(base.enviarArquivo)
    renderChecklist({ ...base, enviarArquivo })
    const cnh = await itemCnh()
    fireEvent.click(await within(cnh).findByRole('button', { name: 'Enviar arquivo' }))
    fireEvent.change(within(cnh).getByLabelText('Arquivo para CNH', { selector: 'input' }), { target: { files: [pdf()] } })
    expect(await screen.findByText('Arquivo enviado')).toBeTruthy()
    expect(enviarArquivo).toHaveBeenCalledTimes(1)
    expect(await within(cnh).findByRole('button', { name: 'Abrir cnh.pdf' })).toBeTruthy()
  })

  it('falha no envio mostra o erro no item e Tentar de novo reenvia o mesmo arquivo', async () => {
    const base = createMockDocsSource()
    let chamadas = 0
    const enviarArquivo = vi.fn((doc: DocEmitido, file: File) => (++chamadas === 1 ? Promise.reject(new Error('SharePoint fora do ar.')) : base.enviarArquivo(doc, file)))
    renderChecklist({ ...base, enviarArquivo })
    const cnh = await itemCnh()
    const arquivo = pdf()
    fireEvent.change(within(cnh).getByLabelText('Arquivo para CNH', { selector: 'input' }), { target: { files: [arquivo] } })
    const alerta = await within(cnh).findByRole('alert')
    expect(alerta.textContent).toMatch(/Arquivo não enviado/)
    expect(alerta.textContent).toMatch(/SharePoint fora do ar\./)
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Arquivo enviado')).toBeTruthy()
    expect(enviarArquivo).toHaveBeenCalledTimes(2)
    expect(enviarArquivo.mock.calls[1][1]).toBe(arquivo)
    await waitFor(() => expect(within(cnh).queryByText(/Arquivo não enviado/)).toBeNull())
  })

  it('arquivo de tipo não aceito ou acima do limite não é enviado', async () => {
    const base = createMockDocsSource()
    const enviarArquivo = vi.fn(base.enviarArquivo)
    renderChecklist({ ...base, enviarArquivo })
    const cnh = await itemCnh()
    const input = within(cnh).getByLabelText('Arquivo para CNH', { selector: 'input' })
    fireEvent.change(input, { target: { files: [new File(['x'], 'planilha.xlsx', { type: 'application/vnd.ms-excel' })] } })
    expect((await within(cnh).findByRole('alert')).textContent).toBe('planilha.xlsx não é PDF, JPG ou PNG.')
    const grande = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
    Object.defineProperty(grande, 'size', { value: 11 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [grande] } })
    expect((await within(cnh).findByRole('alert')).textContent).toMatch(/^grande\.pdf passa de 10/)
    expect(enviarArquivo).not.toHaveBeenCalled()
  })

  it('renovar com arquivo que falhou orienta a usar Enviar arquivo', async () => {
    const base = createMockDocsSource()
    const source: DocsSource = { ...base, salvarDocumento: async (input) => ({ ...(await base.salvarDocumento({ ...input, arquivos: [] })), falhas: [{ nome: 'cnh.pdf', erro: 'Tempo esgotado' }] }) }
    renderChecklist(source)
    await renovarCnh()
    expect(await screen.findByText('Documento salvo, mas arquivos não foram enviados: cnh.pdf (Tempo esgotado). Use “Enviar arquivo” neste documento para tentar de novo.')).toBeTruthy()
  })

  it('recarga que falha depois de salvar mantém a lista e mostra o alerta com Tentar de novo', async () => {
    const base = createMockDocsSource()
    let chamadas = 0
    const source: DocsSource = { ...base, carregar: () => (++chamadas === 2 ? Promise.reject(new Error('Sem conexão.')) : base.carregar()) }
    renderChecklist(source)
    await renovarCnh()
    const alerta = (await screen.findByText('Não foi possível atualizar os documentos')).closest('[role="alert"]') as HTMLElement
    expect(within(alerta).getByText('Sem conexão.')).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'CNH' })).toBeTruthy()
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(screen.queryByText('Não foi possível atualizar os documentos')).toBeNull())
  })
})
