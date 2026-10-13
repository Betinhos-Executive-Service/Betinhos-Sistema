// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource, type DocsSource } from '../data/source'
import { Checklist } from './Checklist'

configure({ asyncUtilTimeout: 8000 })
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Checklist', () => {
  it('lista os tipos da categoria com estado e abre a renovação', async () => {
    render(<ToastProvider><Checklist source={createMockDocsSource()} donoId="f-ana" /></ToastProvider>)
    const cnh = await screen.findByRole('listitem', { name: 'CNH' })
    expect(within(cnh).getByText(/^Vencido/)).toBeTruthy()
    expect(within(screen.getByRole('listitem', { name: 'Antecedentes criminais' })).getByText('Faltando')).toBeTruthy()
    expect(within(screen.getByRole('listitem', { name: 'Certidões' })).getByText('Não enviado')).toBeTruthy()
    fireEvent.click(within(cnh).getByRole('button', { name: 'Histórico (1)' }))
    expect(within(cnh).getAllByText(/Substituído/).length).toBe(1)
    fireEvent.click(within(cnh).getByRole('button', { name: 'Renovar' }))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })

  it('mostra o aviso quando não há arquivo enviado e quando o cadastro não está na lista', async () => {
    const { unmount } = render(<ToastProvider><Checklist source={createMockDocsSource()} donoId="f-ana" /></ToastProvider>)
    const cnh = await screen.findByRole('listitem', { name: 'CNH' })
    fireEvent.click(within(cnh).getByRole('button', { name: 'Arquivos' }))
    expect(await within(cnh).findByText('Nenhum arquivo enviado.')).toBeTruthy()
    unmount()
    render(<ToastProvider><Checklist source={createMockDocsSource()} donoId="inexistente" /></ToastProvider>)
    expect(await screen.findByText('Cadastro não encontrado na lista de documentos.')).toBeTruthy()
  })

  async function renovarCnh(arquivo?: File) {
    const cnh = await screen.findByRole('listitem', { name: 'CNH' })
    fireEvent.click(within(cnh).getByRole('button', { name: 'Renovar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renovar CNH' })
    fireEvent.change(within(dialog).getByLabelText('Emissão'), { target: { value: '2026-10-10' } })
    fireEvent.change(within(dialog).getByLabelText(/^Validade/), { target: { value: '2036-10-10' } })
    if (arquivo) fireEvent.change(within(dialog).getByLabelText('Escolher arquivos', { selector: 'input' }), { target: { files: [arquivo] } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    return dialog
  }

  it('renova pelo mock: fecha o drawer, avisa que salvou e atualiza o estado', async () => {
    render(<ToastProvider><Checklist source={createMockDocsSource()} donoId="f-ana" /></ToastProvider>)
    const antes = await screen.findByRole('listitem', { name: 'CNH' })
    expect(within(antes).getByText(/^Vencido/)).toBeTruthy()
    await renovarCnh()
    expect(await screen.findByText('Documento salvo')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renovar CNH' })).toBeNull())
    await waitFor(() => expect(within(screen.getByRole('listitem', { name: 'CNH' })).queryByText(/^Vencido/)).toBeNull())
    expect(within(screen.getByRole('listitem', { name: 'CNH' })).getByText(/Validade 10\/10\/2036/)).toBeTruthy()
  })

  it('após renovar com arquivo, a lista de Arquivos é do novo documento e abre a janela no clique', async () => {
    const criar = vi.fn(() => 'blob:teste')
    const revogar = vi.fn()
    const original = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL }
    URL.createObjectURL = criar; URL.revokeObjectURL = revogar
    const janela = { location: { href: '' }, close: vi.fn() }
    const abrirJanela = vi.fn(() => janela)
    vi.stubGlobal('open', abrirJanela)
    try {
      render(<ToastProvider><Checklist source={createMockDocsSource()} donoId="f-ana" /></ToastProvider>)
      const cnhAntes = await screen.findByRole('listitem', { name: 'CNH' })
      fireEvent.click(within(cnhAntes).getByRole('button', { name: 'Arquivos' }))
      expect(await within(cnhAntes).findByText('Nenhum arquivo enviado.')).toBeTruthy()
      await renovarCnh(new File(['pdf'], 'cnh.pdf', { type: 'application/pdf' }))
      expect(await screen.findByText('Documento salvo')).toBeTruthy()
      await waitFor(() => expect(within(screen.getByRole('listitem', { name: 'CNH' })).queryByText('Nenhum arquivo enviado.')).toBeNull())
      const cnh = screen.getByRole('listitem', { name: 'CNH' })
      fireEvent.click(within(cnh).getByRole('button', { name: 'Arquivos' }))
      const link = await within(cnh).findByRole('button', { name: /\.pdf$/i })
      fireEvent.click(link)
      expect(abrirJanela).toHaveBeenCalledWith('', '_blank')
      await waitFor(() => expect(janela.location.href).toBe('blob:teste'))
      expect(janela.close).not.toHaveBeenCalled()
    } finally {
      URL.createObjectURL = original.criar; URL.revokeObjectURL = original.revogar
    }
  })

  it('pop-up bloqueado mostra o erro inline e não baixa o arquivo', async () => {
    vi.stubGlobal('open', vi.fn(() => null))
    const base = createMockDocsSource()
    const abrirArquivo = vi.fn(base.abrirArquivo)
    const source: DocsSource = { ...base, abrirArquivo }
    render(<ToastProvider><Checklist source={source} donoId="f-ana" /></ToastProvider>)
    await renovarCnh(new File(['pdf'], 'cnh.pdf', { type: 'application/pdf' }))
    await screen.findByText('Documento salvo')
    await waitFor(() => expect(within(screen.getByRole('listitem', { name: 'CNH' })).queryByText(/^Vencido/)).toBeNull())
    const cnh = screen.getByRole('listitem', { name: 'CNH' })
    fireEvent.click(within(cnh).getByRole('button', { name: 'Arquivos' }))
    fireEvent.click(await within(cnh).findByRole('button', { name: /\.pdf$/i }))
    expect((await within(cnh).findByRole('alert')).textContent).toMatch(/bloqueou/i)
    expect(abrirArquivo).not.toHaveBeenCalled()
  })

  it('falha ao listar arquivos mostra a mensagem no item', async () => {
    const base = createMockDocsSource()
    const source: DocsSource = { ...base, arquivos: () => Promise.reject(new Error('SharePoint indisponível.')) }
    render(<ToastProvider><Checklist source={source} donoId="f-ana" /></ToastProvider>)
    const cnh = await screen.findByRole('listitem', { name: 'CNH' })
    fireEvent.click(within(cnh).getByRole('button', { name: 'Arquivos' }))
    expect((await within(cnh).findByRole('alert')).textContent).toBe('SharePoint indisponível.')
  })

  it('recarga que falha depois de salvar mantém a lista e mostra o alerta com Tentar de novo', async () => {
    const base = createMockDocsSource()
    let chamadas = 0
    const source: DocsSource = { ...base, carregar: () => (++chamadas === 2 ? Promise.reject(new Error('Sem conexão.')) : base.carregar()) }
    render(<ToastProvider><Checklist source={source} donoId="f-ana" /></ToastProvider>)
    await renovarCnh()
    expect(await screen.findByText('Não foi possível atualizar os documentos')).toBeTruthy()
    expect(screen.getByText('Sem conexão.')).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'CNH' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(screen.queryByText('Não foi possível atualizar os documentos')).toBeNull())
  })
})
