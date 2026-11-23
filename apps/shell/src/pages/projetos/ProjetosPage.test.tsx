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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function stubSource(over: Partial<sourceModule.Source>) {
  const real = sourceModule.createSource
  return vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => ({ ...real(host), ...over }))
}

async function abrir(nome: string) {
  render(<ProjetosPage host={{ mode: 'mock' }} />)
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${nome}`) }))
  return screen.findByRole('dialog', { name: nome })
}

async function escolherStatus(dialog: HTMLElement, opcao: string) {
  fireEvent.click(within(dialog).getByRole('combobox', { name: /^Status/ }))
  fireEvent.click(await screen.findByRole('option', { name: opcao, hidden: true }))
}

describe('Projetos', () => {
  it('lista os projetos de exemplo com status e andamento', async () => {
    render(<ProjetosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('button', { name: /^Painel de indicadores/ })).toBeTruthy()
    expect(screen.getAllByText('Em validação').length).toBeGreaterThan(0)
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
  })

  it('cenário 1: Concluído sem prova é bloqueado com aviso e não grava', async () => {
    const update = vi.fn(async () => undefined)
    stubSource({ update })
    const dialog = await abrir('Cadastro de documentos')
    await escolherStatus(dialog, 'Concluído')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))
    expect((await within(dialog).findAllByText(/registre antes uma atualização marcada como prova/)).length).toBeGreaterThan(0)
    expect(update).not.toHaveBeenCalled()
  })

  it('cenário 2: Concluído com prova anexada é gravado', async () => {
    const update = vi.fn(async () => undefined)
    stubSource({ update })
    const dialog = await abrir('Painel de indicadores')
    await escolherStatus(dialog, 'Concluído')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.any(String), { cr40f_status: 100000003 }))
  })

  it('cenário 3: atualização feita pelo agente aparece na linha do tempo com autor e anexo', async () => {
    const dialog = await abrir('Painel de indicadores')
    const linha = within(dialog).getByRole('list', { name: 'Linha do tempo' })
    expect(within(linha).getAllByText('Agente').length).toBeGreaterThan(0)
    expect(within(linha).getByRole('button', { name: /Abrir anexo dashboard-dev.svg/ })).toBeTruthy()
    expect(within(linha).getAllByText('Prova').length).toBeGreaterThan(0)
  })

  it('cenário 4: nova atualização com anexo entra na linha do tempo', async () => {
    const dialog = await abrir('Cadastro de documentos')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nova atualização' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^Texto/ }), { target: { value: 'Tela pronta no DEV.' } })
    const arquivo = new File(['x'], 'tela.png', { type: 'image/png' })
    fireEvent.change(within(dialog).getByLabelText('Escolher anexos'), { target: { files: [arquivo] } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /É prova/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar atualização' }))
    expect(await within(dialog).findByText('Tela pronta no DEV.')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /Abrir anexo tela.png/ })).toBeTruthy()
  })

  it('cenário 5: arquivo acima de 5 MB é recusado com a mensagem do limite', async () => {
    const dialog = await abrir('Cadastro de documentos')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nova atualização' }))
    const grande = new File(['x'], 'video.mp4', { type: 'video/mp4' })
    Object.defineProperty(grande, 'size', { value: 6 * 1024 * 1024 })
    fireEvent.change(within(dialog).getByLabelText('Escolher anexos'), { target: { files: [grande] } })
    expect(await within(dialog).findByText(/passa do limite de 5 MB/)).toBeTruthy()
    expect(within(dialog).queryByRole('list', { name: 'Arquivos escolhidos' })).toBeNull()
  })

  it('fechar com alteração pede para descartar', async () => {
    const dialog = await abrir('Cadastro de documentos')
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Outro nome' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
  })
})
