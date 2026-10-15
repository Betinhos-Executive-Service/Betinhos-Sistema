// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
import { FORM_CLOSE_MESSAGE, FormOverlay } from './FormOverlay'

describe('FormOverlay', () => {
  it('mostra o formulário em iframe e fecha pela mensagem do próprio formulário', async () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      render(<FormOverlay url="https://org.crm.dynamics.com/WebResources/new_formulario_geral.html?host=shell" onClose={onClose} />)
      const frame = screen.getByTitle('Formulário do serviço') as HTMLIFrameElement
      expect(frame.src).toContain('host=shell')
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'outra' }, origin: window.location.origin })) })
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: FORM_CLOSE_MESSAGE }, origin: 'https://outro.exemplo' })) })
      expect(onClose).not.toHaveBeenCalled()
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: FORM_CLOSE_MESSAGE }, origin: window.location.origin })) })
      act(() => { vi.advanceTimersByTime(200) })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('clicar no fundo ou Esc pede confirmação; "Continuar editando" mantém, "Fechar" fecha', async () => {
    const onClose = vi.fn()
    const { container } = render(<FormOverlay url="https://org.crm.dynamics.com/x" onClose={onClose} />)
    fireEvent.mouseDown(container.querySelector('.gr-form__backdrop') as HTMLElement)
    expect(await screen.findByRole('dialog', { name: 'Fechar o formulário?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fechar o formulário?' })).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(await screen.findByRole('dialog', { name: 'Fechar o formulário?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar formulário' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
