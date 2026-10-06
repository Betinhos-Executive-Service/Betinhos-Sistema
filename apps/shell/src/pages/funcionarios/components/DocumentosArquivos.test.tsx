// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createMockSource } from '../data/mock'
import { DocumentosArquivos, formatBytes } from './DocumentosArquivos'
import { ToastProvider } from '@betinhos/ui'

afterEach(cleanup)

function renderDocs() {
  render(<ToastProvider><DocumentosArquivos source={createMockSource()} id="m1" /></ToastProvider>)
}

describe('DocumentosArquivos', () => {
  it('lista, envia sem sobrescrever nome repetido e exclui só após confirmar', async () => {
    renderDocs()
    await screen.findByText('CNH frente e verso.pdf', undefined, { timeout: 4000 })

    const input = document.querySelector('input[type=file]') as HTMLInputElement
    const file = new File(['%PDF'], 'CNH frente e verso.pdf', { type: 'application/pdf' })
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
    expect(await screen.findByText('CNH frente e verso (2).pdf', undefined, { timeout: 4000 })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Comprovante de residência.jpg' }))
    expect(screen.getByText('Excluir do SharePoint?')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Excluir arquivo/ })) })
    await waitFor(() => expect(screen.queryByText('Comprovante de residência.jpg')).toBeNull())
  })

  it('mantém o erro de envio na fila com opção de tentar de novo', async () => {
    renderDocs()
    await screen.findByText('CNH frente e verso.pdf', undefined, { timeout: 4000 })
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'erro.pdf', { type: 'application/pdf' })] } }) })
    expect(await screen.findByText(/Falha simulada ao enviar/, undefined, { timeout: 4000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })

  it('formata tamanhos em pt-BR', () => {
    expect(formatBytes(1_204_551)).toBe('1,1 MB')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
  })
})
