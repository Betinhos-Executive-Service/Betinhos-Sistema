// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource } from '../data/source'
import { ConfigDrawer } from './ConfigDrawer'

configure({ asyncUtilTimeout: 8000 })
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function montar() {
  const source = createMockDocsSource('2026-10-13')
  const data = await source.carregar()
  const onChanged = vi.fn()
  const onClose = vi.fn()
  render(<ToastProvider><ConfigDrawer source={source} data={data} onClose={onClose} onChanged={onChanged} /></ToastProvider>)
  return { source, data, onChanged, onClose, dialog: await screen.findByRole('dialog', { name: 'Configurações de documentos' }) }
}

/** Abre o Select do Design System pelo rótulo e escolhe a opção pelo texto. */
async function escolher(dialog: HTMLElement, rotulo: string, opcao: string) {
  fireEvent.click(within(dialog).getByRole('combobox', { name: rotulo }))
  const item = await waitFor(() => {
    const el = screen.getAllByText(opcao).map((e) => e.closest('[role="option"]')).find(Boolean)
    if (!el) throw new Error(`opção ${opcao} não apareceu`)
    return el
  })
  fireEvent.click(item)
}

describe('ConfigDrawer', () => {
  it('cria um tipo novo com o código em maiúsculas', async () => {
    const { dialog, source, onChanged } = await montar()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Novo tipo' }))
    fireEvent.change(within(dialog).getByLabelText(/^Nome/), { target: { value: 'Curso de passageiros' } })
    fireEvent.change(within(dialog).getByLabelText(/^Código/), { target: { value: '  cetpp ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar tipo' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect((await source.carregar()).tipos.some((t) => t.codigo === 'CETPP' && t.categoria === 'pessoas')).toBe(true)
  })

  it('cria um tipo de Frota com as obrigatoriedades da categoria', async () => {
    const { dialog, source } = await montar()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Novo tipo' }))
    fireEvent.change(within(dialog).getByLabelText(/^Nome/), { target: { value: 'Vistoria' } })
    fireEvent.change(within(dialog).getByLabelText(/^Código/), { target: { value: 'vist' } })
    await escolher(dialog, 'Categoria', 'Frota')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Terceiro' }))
    expect(within(dialog).queryByRole('checkbox', { name: 'Motorista' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar tipo' }))
    await waitFor(async () => expect((await source.carregar()).tipos.some((t) => t.codigo === 'VIST' && t.categoria === 'frota' && t.obrigatorioPara.join() === '100000003')).toBe(true))
  })

  it('não deixa criar tipo com código repetido', async () => {
    const { dialog, onChanged, data } = await montar()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Novo tipo' }))
    fireEvent.change(within(dialog).getByLabelText(/^Nome/), { target: { value: 'Outra CNH' } })
    fireEvent.change(within(dialog).getByLabelText(/^Código/), { target: { value: data.tipos[0].codigo.toLowerCase() } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar tipo' }))
    expect(await within(dialog).findByText('Já existe um tipo com este código.')).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('ao editar um tipo o código fica bloqueado', async () => {
    const { dialog, data } = await montar()
    const cnh = data.tipos.find((t) => t.codigo === 'CNH')!
    const item = within(dialog).getByRole('listitem', { name: cnh.nome })
    fireEvent.click(within(item).getByRole('button', { name: 'Editar' }))
    expect((within(dialog).getByLabelText(/^Código/) as HTMLInputElement).disabled).toBe(true)
    expect((within(dialog).getByLabelText(/^Nome/) as HTMLInputElement).value).toBe(cnh.nome)
  })

  it('com o formulário alterado, fechar pede para descartar', async () => {
    const { dialog, onClose } = await montar()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Novo tipo' }))
    fireEvent.change(within(dialog).getByLabelText(/^Nome/), { target: { value: 'Rascunho' } })
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    const confirmar = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Continuar editando' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('sem alteração, fechar não pede confirmação', async () => {
    const { dialog, onClose } = await montar()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Novo tipo' }))
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalled()
  })

  it('adiciona e remove destinatário da categoria', async () => {
    const { dialog, source } = await montar()
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Destinatários' }))
    await escolher(dialog, 'Funcionário para Frota', 'Bruno')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Adicionar em Frota' }))
    await waitFor(async () => expect((await source.carregar()).destinatarios.some((d) => d.categoria === 'frota' && d.funcionarioId === 'f-bruno')).toBe(true))
    const existente = (await source.carregar()).destinatarios[0]
    fireEvent.click(within(dialog).getByRole('button', { name: `Remover ${existente.nome} de ${existente.categoria === 'frota' ? 'Frota' : 'Pessoas'}` }))
    await waitFor(async () => expect((await source.carregar()).destinatarios.some((d) => d.id === existente.id)).toBe(false))
  })
})
