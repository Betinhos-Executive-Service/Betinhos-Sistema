// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AditivoAssinatura } from './AditivoAssinatura'

const HOJE = '2026-11-18'
const pdf = (nome = 'aditivo.pdf', conteudo = '%PDF-1.4') => new File([conteudo], nome, { type: 'application/pdf' })

function montar(extra: Partial<Parameters<typeof AditivoAssinatura>[0]> = {}) {
  const gerarAditivo = vi.fn(async () => ({ pdfBase64: btoa('%PDF-1.4'), nomeArquivo: 'aditivo-ana-v1.pdf' }))
  const registrarAditivo = vi.fn(async () => {})
  const onRegistrado = vi.fn()
  render(<AditivoAssinatura id="f1" atual={null} assinadoEm={null} source={{ gerarAditivo, registrarAditivo }} onRegistrado={onRegistrado} hoje={HOJE} {...extra} />)
  return { gerarAditivo, registrarAditivo, onRegistrado }
}

const anexar = () => fireEvent.click(screen.getByRole('button', { name: 'Anexar assinado' }))
const escolher = (file: File) => fireEvent.change(screen.getByLabelText('Arquivo do aditivo (PDF)'), { target: { files: [file] } })

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AditivoAssinatura', () => {
  it('sem aditivo mostra Gerar aditivo e Anexar assinado', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Gerar aditivo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Anexar assinado' })).toBeTruthy()
    expect(screen.queryByText(/Assinado em/)).toBeNull()
  })

  it('Gerar aditivo baixa o PDF com o nome do servidor', async () => {
    const criar = vi.fn(() => 'blob:aditivo')
    vi.stubGlobal('URL', { ...URL, createObjectURL: criar, revokeObjectURL: vi.fn() })
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('aditivo-ana-v1.pdf') })
    const { gerarAditivo } = montar()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Gerar aditivo' })) })
    expect(gerarAditivo).toHaveBeenCalledWith('f1')
    expect(criar).toHaveBeenCalledTimes(1)
    expect(clique).toHaveBeenCalledTimes(1)
    clique.mockRestore()
  })

  it('Anexar assinado pede o PDF e a data, que começa em hoje', () => {
    montar()
    anexar()
    expect((screen.getByLabelText('Data da assinatura') as HTMLInputElement).value).toBe(HOJE)
    expect(screen.getByRole('button', { name: 'Escolher PDF' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Registrar aditivo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('registra com o PDF em base64 (sem prefixo data:) e a data escolhida, e avisa a ficha', async () => {
    const { registrarAditivo, onRegistrado } = montar()
    anexar()
    escolher(pdf())
    fireEvent.change(screen.getByLabelText('Data da assinatura'), { target: { value: '2026-11-17' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registrar aditivo' })) })
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1))
    expect(registrarAditivo).toHaveBeenCalledWith('f1', btoa('%PDF-1.4'), '2026-11-17')
  })

  it('mostra a recusa do servidor sem alteração, abaixo do campo, e mantém o formulário aberto', async () => {
    const msg = 'Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu.'
    const onRegistrado = vi.fn()
    const registrarAditivo = vi.fn(async () => { throw new Error(msg) })
    montar({ source: { gerarAditivo: vi.fn(), registrarAditivo }, onRegistrado })
    anexar()
    escolher(pdf('sem-assinatura.pdf'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registrar aditivo' })) })
    const alerta = await screen.findByText(msg)
    expect(alerta.getAttribute('role')).toBe('alert')
    expect(onRegistrado).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Data da assinatura')).toBeTruthy()
  })

  it('data futura bloqueia o registro com a mensagem', () => {
    const { registrarAditivo } = montar()
    anexar()
    escolher(pdf())
    fireEvent.change(screen.getByLabelText('Data da assinatura'), { target: { value: '2026-11-19' } })
    expect(screen.getByText('A data da assinatura não pode ser no futuro.')).toBeTruthy()
    const botao = screen.getByRole('button', { name: 'Registrar aditivo' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.click(botao)
    expect(registrarAditivo).not.toHaveBeenCalled()
  })

  it('recusa arquivo que não é PDF e acima de 5 MB no cliente', () => {
    const { registrarAditivo } = montar()
    anexar()
    escolher(new File(['x'], 'foto.png', { type: 'image/png' }))
    expect(screen.getByText('Envie o aditivo em PDF.')).toBeTruthy()
    const grande = pdf('grande.pdf')
    Object.defineProperty(grande, 'size', { value: 5 * 1024 * 1024 + 1 })
    escolher(grande)
    expect(screen.getByText('O PDF passa de 5 MB.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Registrar aditivo' }) as HTMLButtonElement).disabled).toBe(true)
    expect(registrarAditivo).not.toHaveBeenCalled()
  })

  it('com aditivo mostra a data, Baixar e o link do validador do ITI em nova aba', () => {
    montar({ atual: { nome: 'aditivo.pdf', url: 'https://x/y/$value' }, assinadoEm: '2026-10-15' })
    expect(screen.getByText('Assinado em 15/10/2026')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Baixar/ }).getAttribute('href')).toBe('https://x/y/$value')
    const validador = screen.getByRole('link', { name: /Conferir no validar\.iti\.gov\.br/ })
    expect(validador.getAttribute('href')).toBe('https://validar.iti.gov.br')
    expect(validador.getAttribute('target')).toBe('_blank')
    expect(validador.getAttribute('rel')).toContain('noopener')
  })

  it('colaborador novo (sem id) não gera nem anexa', () => {
    montar({ id: null })
    expect((screen.getByRole('button', { name: 'Gerar aditivo' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Anexar assinado' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
