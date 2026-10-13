// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource } from '../data/source'
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
})
