// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandConfirmDialog } from './CommandConfirmDialog'

afterEach(cleanup)

describe('confirmação dos comandos', () => {
  it('mostra o alcance da exclusão e permite cancelar por Esc sem confirmar', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<CommandConfirmDialog kind="delete" title="Excluir composições?" description="2 composições serão excluídas" items={['Cliente A · c1', 'Cliente B · c2']} confirmLabel="Excluir 2" onCancel={onCancel} onConfirm={onConfirm} />)
    expect(screen.getByRole('alertdialog').getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Cliente B · c2')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirma explicitamente o envio parcial ao Flow', () => {
    const onConfirm = vi.fn()
    render(<CommandConfirmDialog kind="op" title="Gerar ordens de pagamento?" description="Confira os serviços" items={['OS-9 · OP já existente']} summary={[{ label: 'Elegíveis', count: 2 }, { label: 'Já têm OP', count: 1, tone: 'warning' }]} confirmLabel="Enviar 2 ao Flow" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByText('OS-9 · OP já existente')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar 2 ao Flow' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('omite motivos zerados e mostra serviços ignorados só quando solicitados', () => {
    render(<CommandConfirmDialog kind="op" title="Gerar 1 ordem de pagamento?" description="Simulação local." items={[]} summary={[{ label: 'Elegíveis', count: 1 }, { label: 'já têm OP', count: 0 }, { label: 'com erro de leitura', count: 0, tone: 'error' }]} confirmLabel="Simular 1 OP" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByLabelText('Serviços não processados')).toBeNull()
    expect(screen.getByRole('button', { name: 'Simular 1 OP' })).toBeTruthy()
  })

  it('explica falhas de leitura e bloqueia geração quando não há elegíveis', () => {
    const onConfirm = vi.fn()
    render(<CommandConfirmDialog kind="op" title="Nenhuma OP pronta para gerar" description="Revise os serviços." items={['OS-9 · erro de leitura']} summary={[{ label: 'Elegíveis', count: 0 }, { label: 'com erro de leitura', count: 1, tone: 'error' }]} confirmLabel="Gerar 0 OPs" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByText('1 serviço não será processado')).toBeTruthy()
    expect(screen.getByText(/Confira os serviços com erro/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gerar 0 OPs' })).toBeNull()
    fireEvent.click(screen.getByText('Ver serviços afetados'))
    expect(screen.getByText('OS-9 · erro de leitura')).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
