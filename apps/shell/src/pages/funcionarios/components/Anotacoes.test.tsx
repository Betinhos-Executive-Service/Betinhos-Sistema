// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createMockSource } from '../data/mock'
import { AnotacoesTab, relativeTime } from './Anotacoes'
import { ToastProvider } from '@betinhos/ui'

beforeAll(() => {
  URL.createObjectURL ??= () => 'blob:teste'
  URL.revokeObjectURL ??= () => {}
})
afterEach(cleanup)

async function renderTab() {
  render(<ToastProvider><AnotacoesTab source={createMockSource()} id="m1" /></ToastProvider>)
  await screen.findByRole('button', { name: /Abrir anotação de Operação/ }, { timeout: 4000 })
}

async function abrir(nome: RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: nome })) })
}

describe('AnotacoesTab', () => {
  it('abre a anotação completa e volta com Esc devolvendo o foco', async () => {
    await renderTab()
    await abrir(/Abrir anotação de Operação/)
    expect(screen.getByRole('heading', { name: 'Advertência verbal' })).toBeTruthy()
    expect(screen.getByText(/Acompanhar nas próximas duas semanas/)).toBeTruthy()
    expect(screen.getByText(/Editada em/)).toBeTruthy()
    await act(async () => { fireEvent.keyDown(screen.getByRole('article'), { key: 'Escape' }) })
    expect(screen.queryByRole('article')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Abrir anotação de Operação/ }))
  })

  it('cria anotação com título, texto e imagem anexada', async () => {
    await renderTab()
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Foto do veículo' } })
    fireEvent.change(screen.getByLabelText('Texto da anotação'), { target: { value: 'Avaria no para-choque.' } })
    const input = document.querySelector('form[aria-label="Nova anotação"] input[type=file]') as HTMLInputElement
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['png'], 'avaria.png', { type: 'image/png' })] } }) })
    expect(screen.getByText('avaria.png')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Adicionar anotação/ })) })
    expect(await screen.findByText('Foto do veículo', undefined, { timeout: 4000 })).toBeTruthy()
    // Vai para o SharePoint com prefixo de data e aparece como anexo da nota.
    expect(screen.getByText(/^\d{8}-\d{6} avaria\.png$/)).toBeTruthy()
    expect((screen.getByLabelText('Texto da anotação') as HTMLTextAreaElement).value).toBe('')
  })

  it('recusa anexo bloqueado pelo Dataverse', async () => {
    await renderTab()
    const input = document.querySelector('form[aria-label="Nova anotação"] input[type=file]') as HTMLInputElement
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'script.bat')] } }) })
    expect(screen.getByRole('alert').textContent).toContain('.bat')
  })

  it('mostra imagem embutida no texto e bloqueia edição de nota formatada', async () => {
    await renderTab()
    await abrir(/Abrir anotação de RH, há/)
    expect(document.querySelector('.note-inline-img')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Editar/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('edita nota simples e exclui só após confirmar', async () => {
    await renderTab()
    await abrir(/Abrir anotação de Operação/)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Editar/ })) })
    fireEvent.change(screen.getByLabelText('Texto da anotação'), { target: { value: 'Texto revisado.' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/ })) })
    await screen.findByRole('button', { name: /Editar/ }, { timeout: 4000 })
    expect(document.querySelector('.note-body')?.textContent).toBe('Texto revisado.')

    fireEvent.click(screen.getByRole('button', { name: 'Excluir anotação' }))
    expect(screen.getByText('Excluir esta anotação?')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Excluir anotação$/ })) })
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull())
    await waitFor(() => expect(screen.queryByRole('button', { name: /Abrir anotação de Operação/ })).toBeNull())
  })
})

describe('migração de imagens', () => {
  it('botão discreto copia a imagem anexada para o SharePoint', async () => {
    await renderTab()
    const trigger = screen.getByRole('button', { name: /Copiar 1 imagem anexada para o SharePoint/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Copiar imagens para o SharePoint' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copiar 1 imagem$/ })) })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Copiar 1 imagem anexada/ })).toBeNull(), { timeout: 6000 })
    expect(screen.getByText(/^\d{8}-\d{6} cnh-renovada\.png$/)).toBeTruthy()
  }, 15_000)
})

describe('relativeTime', () => {
  it('formata em pt-BR', () => {
    const now = Date.parse('2026-10-01T12:00:00Z')
    expect(relativeTime('2026-10-01T11:59:40Z', now)).toBe('agora')
    expect(relativeTime('2026-10-01T09:00:00Z', now)).toBe('há 3 horas')
    expect(relativeTime('2026-09-30T12:00:00Z', now)).toBe('ontem')
  })
})
