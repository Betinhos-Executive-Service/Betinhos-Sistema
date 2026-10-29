// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockPortalSource } from '../data/portal'
import type { Candidato } from '../domain/portal'
import { LiberarPortalDrawer } from './LiberarPortalDrawer'

const base: Candidato = { id: 'a', codigo: 'OS-1', cliente: { id: 'c1', nome: 'Tenaris' }, portalHabilitado: true, composicaoConcluida: true, valor: 100, cancelado: false, validacao: null }
const mista: Candidato[] = [
  base,
  { ...base, id: 'b', codigo: 'OS-2', valor: 250.5 },
  { ...base, id: 'x', codigo: 'OS-3', composicaoConcluida: false, valor: 999 },
  { ...base, id: 'y', codigo: 'OS-4', cliente: { id: 'c2', nome: 'Grupo Atlântico' }, portalHabilitado: false },
]

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
afterEach(cleanup)

function setup(list = mista) {
  const source = { candidatos: vi.fn(async () => list), liberar: vi.fn(async (prontos: Candidato[], _observacao: string) => ({ ok: prontos.map((p) => p.id), failed: [] })) }
  const onClose = vi.fn()
  const onDone = vi.fn()
  render(<LiberarPortalDrawer ids={list.map((c) => c.id)} source={source} mobile={false} onClose={onClose} onDone={onDone} />)
  return { source, onClose, onDone }
}

describe('LiberarPortalDrawer', () => {
  it('seleção mista: separa prontos e bloqueados com motivo e libera só os 2', async () => {
    const { source, onDone } = setup()
    const prontos = await screen.findByRole('region', { name: /Prontos para liberar \(2\)/ })
    expect(within(prontos).getByText('OS-1')).toBeTruthy()
    const bloqueados = screen.getByRole('region', { name: /Não podem ser liberados \(2\)/ })
    expect(within(bloqueados).getByText('Composição não concluída')).toBeTruthy()
    expect(within(bloqueados).getByText('Cliente sem portal')).toBeTruthy()
    expect(screen.getByText(/350,50/)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /Observação para o cliente/ }), { target: { value: 'Conferir pedágio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Liberar 2 serviços' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(source.liberar.mock.calls[0][0].map((c) => c.id)).toEqual(['a', 'b'])
    expect(source.liberar.mock.calls[0][1]).toBe('Conferir pedágio')
    expect(onDone).toHaveBeenCalledWith({ ok: ['a', 'b'], failed: [] }, 2)
  })

  it('já liberado aparece como "Já liberado" e não deixa liberar', async () => {
    setup([{ ...base, validacao: { id: 'v1', status: 'liberado' } }])
    expect(await screen.findByText('Já liberado')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Liberar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Cancelar com observação digitada pede "Descartar alterações?"', async () => {
    const { onClose } = setup()
    fireEvent.change(await screen.findByRole('textbox', { name: /Observação para o cliente/ }), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc sem observação fecha direto', async () => {
    const { onClose } = setup()
    await screen.findByRole('region', { name: /Prontos/ })
    fireEvent(document.querySelector('dialog.bt-drawer, dialog') as Element, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('mock do portal', () => {
  it('liberado fica como "já liberado" na próxima conferência', async () => {
    const rows = [{ cr40f_reservadeveculosid: 'r1', cr40f_id: 'OS-1001' }]
    const portal = createMockPortalSource(() => rows, { latency: 0 })
    const [c] = await portal.candidatos(['r1'])
    await portal.liberar([c], '')
    const [depois] = await portal.candidatos(['r1'])
    expect(depois.validacao?.status).toBe('liberado')
    expect((await portal.status(['r1'])).get('r1')).toBe('liberado')
  })
})
