// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource, type DocsSource } from '../data/source'
import type { SalvarDocResult } from '../data/salvar'
import type { DocEmitido } from '../domain/types'
import { RenovarDrawer } from './RenovarDrawer'

configure({ asyncUtilTimeout: 8000 })
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function montar(ajustar?: (source: DocsSource) => DocsSource) {
  const base = createMockDocsSource('2026-10-13')
  const source = ajustar ? ajustar(base) : base
  const data = await base.carregar()
  const aso = data.tipos.find((t) => t.codigo === 'ASO')!
  const ana = data.donos.find((d) => d.nome === 'Ana')!
  const anterior = data.docs.find((d) => d.donoId === ana.id && d.tipoId === aso.id && d.situacao === 'vigente')!
  const onSaved = vi.fn(); const onClose = vi.fn()
  render(<ToastProvider><RenovarDrawer alvo={{ tipo: aso, dono: ana, anterior }} source={source} onClose={onClose} onSaved={onSaved} /></ToastProvider>)
  return { onSaved, onClose, source, dialog: await screen.findByRole('dialog', { name: 'Renovar ASO' }) }
}

describe('RenovarDrawer', () => {
  it('sugere validade pela emissão e salva', async () => {
    const { dialog, onSaved } = await montar()
    fireEvent.change(within(dialog).getByLabelText('Emissão'), { target: { value: '2026-10-10' } })
    expect((within(dialog).getByLabelText(/^Validade/) as HTMLInputElement).value).toBe('2027-10-10')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0].doc.validade).toBe('2027-10-10')
  })

  it('exige validade quando o tipo vence', async () => {
    const { dialog, onSaved } = await montar()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    expect(await within(dialog).findByText('Informe a validade.')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('com alteração não salva pede confirmação ao fechar', async () => {
    const { dialog, onClose } = await montar()
    fireEvent.change(within(dialog).getByLabelText('Número'), { target: { value: '123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    const confirmar = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Continuar editando' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('falha ao salvar mostra o aviso e mantém o que foi digitado', async () => {
    const { dialog, onSaved } = await montar((s) => ({ ...s, salvarDocumento: () => Promise.reject(new Error('Sem conexão com o Dataverse.')) }))
    fireEvent.change(within(dialog).getByLabelText('Número'), { target: { value: '987' } })
    fireEvent.change(within(dialog).getByLabelText('Emissão'), { target: { value: '2026-10-10' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    expect(await within(dialog).findByText('Não foi possível salvar')).toBeTruthy()
    expect(within(dialog).getByText(/Sem conexão com o Dataverse\./)).toBeTruthy()
    expect((within(dialog).getByLabelText('Número') as HTMLInputElement).value).toBe('987')
    expect((within(dialog).getByLabelText('Emissão') as HTMLInputElement).value).toBe('2026-10-10')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('salvando, Cancelar e Esc não fecham', async () => {
    let liberar: (r: SalvarDocResult) => void = () => undefined
    const { dialog, onClose } = await montar((s) => ({ ...s, salvarDocumento: () => new Promise<SalvarDocResult>((resolve) => { liberar = resolve }) }))
    fireEvent.change(within(dialog).getByLabelText('Emissão'), { target: { value: '2026-10-10' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()
    liberar({ doc: {} as DocEmitido, enviados: [], falhas: [], avisos: [] })
  })

  it('Esc com alteração não salva abre a confirmação de descarte', async () => {
    const { dialog, onClose } = await montar()
    fireEvent.change(within(dialog).getByLabelText('Número'), { target: { value: '123' } })
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('validade antes da emissão mostra o erro', async () => {
    const { dialog, onSaved } = await montar()
    fireEvent.change(within(dialog).getByLabelText('Emissão'), { target: { value: '2026-10-10' } })
    fireEvent.change(within(dialog).getByLabelText(/^Validade/), { target: { value: '2026-10-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    expect(await within(dialog).findByText('A validade não pode ser antes da emissão.')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('dois arquivos com o mesmo nome: remover um envia só um', async () => {
    const salvar = vi.fn(async (): Promise<SalvarDocResult> => ({ doc: {} as DocEmitido, enviados: [], falhas: [], avisos: [] }))
    const { dialog, onSaved } = await montar((s) => ({ ...s, salvarDocumento: salvar }))
    const a = new File(['aaa'], 'image.jpg', { type: 'image/jpeg' })
    const b = new File(['bbbbbb'], 'image.jpg', { type: 'image/jpeg' })
    fireEvent.change(within(dialog).getByLabelText('Escolher arquivos', { selector: 'input' }), { target: { files: [a, b] } })
    expect(await within(dialog).findAllByRole('button', { name: 'Remover image.jpg' })).toHaveLength(2)
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Remover image.jpg' })[0])
    expect(within(dialog).getAllByRole('button', { name: 'Remover image.jpg' })).toHaveLength(1)
    fireEvent.change(within(dialog).getByLabelText('Emissão'), { target: { value: '2026-10-10' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const enviados = (salvar.mock.calls[0] as unknown as [{ arquivos: File[] }])[0].arquivos
    expect(enviados).toHaveLength(1)
    expect(enviados[0]).toBe(b)
  })
})
