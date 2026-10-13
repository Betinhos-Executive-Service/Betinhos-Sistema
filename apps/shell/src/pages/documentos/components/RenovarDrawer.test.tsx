// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource } from '../data/source'
import { RenovarDrawer } from './RenovarDrawer'

configure({ asyncUtilTimeout: 8000 })
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function montar() {
  const source = createMockDocsSource('2026-10-13')
  const data = await source.carregar()
  const aso = data.tipos.find((t) => t.codigo === 'ASO')!
  const ana = data.donos.find((d) => d.nome === 'Ana')!
  const anterior = data.docs.find((d) => d.donoId === ana.id && d.tipoId === aso.id && d.situacao === 'vigente')!
  const onSaved = vi.fn(); const onClose = vi.fn()
  render(<ToastProvider><RenovarDrawer alvo={{ tipo: aso, dono: ana, anterior }} source={source} onClose={onClose} onSaved={onSaved} /></ToastProvider>)
  return { onSaved, onClose, dialog: await screen.findByRole('dialog', { name: 'Renovar ASO' }) }
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
})
