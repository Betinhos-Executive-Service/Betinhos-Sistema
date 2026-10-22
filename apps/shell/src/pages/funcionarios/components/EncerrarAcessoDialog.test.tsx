// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EncerrarAcessoDialog } from './EncerrarAcessoDialog'

afterEach(cleanup)

const botaoConfirmar = () => screen.getByRole('button', { name: /^Encerrar agora$/ }) as HTMLButtonElement

describe('EncerrarAcessoDialog', () => {
  it('exige duas etapas e só habilita com o primeiro nome', async () => {
    const onConfirmar = vi.fn(async () => {})
    render(<EncerrarAcessoDialog open nome="João da Silva" onCancel={() => {}} onConfirmar={onConfirmar} />)
    expect(screen.getByText(/Encerrar acesso de João da Silva\?/)).toBeTruthy()
    expect(screen.queryByLabelText(/primeiro nome/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    const campo = screen.getByLabelText(/primeiro nome/i)
    expect(botaoConfirmar().disabled).toBe(true)
    fireEvent.change(campo, { target: { value: 'Maria' } })
    expect(botaoConfirmar().disabled).toBe(true)
    fireEvent.change(campo, { target: { value: ' joao ' } })
    expect(botaoConfirmar().disabled).toBe(false)
    await act(async () => { fireEvent.click(botaoConfirmar()) })
    expect(onConfirmar).toHaveBeenCalledWith('joao')
  })

  it('mostra erro de confirmação sem fechar', async () => {
    const onConfirmar = vi.fn(async () => { throw new Error('CONFIRMACAO_INVALIDA: não confere') })
    const onCancel = vi.fn()
    render(<EncerrarAcessoDialog open nome="Ana Lima" onCancel={onCancel} onConfirmar={onConfirmar} />)
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(botaoConfirmar()) })
    expect(screen.getByText(/não confere/)).toBeTruthy()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('não fecha por Esc enquanto encerra', async () => {
    let soltar: () => void = () => {}
    const onConfirmar = vi.fn(() => new Promise<void>((resolve) => { soltar = resolve }))
    const onCancel = vi.fn()
    render(<EncerrarAcessoDialog open nome="Ana Lima" onCancel={onCancel} onConfirmar={onConfirmar} />)
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(botaoConfirmar()) })
    fireEvent(document.querySelector('dialog')!, new Event('cancel', { cancelable: true }))
    expect(onCancel).not.toHaveBeenCalled()
    await act(async () => { soltar() })
  })
})
