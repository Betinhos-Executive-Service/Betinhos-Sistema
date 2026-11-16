// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_MS, LookupHoverIntent, REST_MS } from './LookupHoverIntent'

function grid() {
  render(<><LookupHoverIntent /><span className="lookup-preview" data-testid="trigger"><span data-testid="text">Faria Lima → Viracopos</span><span className="lookup-preview__card" data-testid="card"><span data-testid="copy">Destino</span></span></span><span data-testid="outside">fora</span></>)
  return { trigger: screen.getByTestId('trigger'), text: screen.getByTestId('text'), card: screen.getByTestId('card'), copy: screen.getByTestId('copy'), outside: screen.getByTestId('outside') }
}

const fire = (el: Element, type: string, init: PointerEventInit = {}) => act(() => { el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', ...init })) })
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const isOpen = (el: HTMLElement) => el.dataset.open !== undefined

describe('LookupHoverIntent', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('abre só depois do ponteiro ficar parado sobre o texto', () => {
    const { trigger, text } = grid()
    fire(text, 'pointerover', { clientX: 10, clientY: 10 })
    wait(REST_MS - 50)
    expect(isOpen(trigger)).toBe(false)
    wait(60)
    expect(isOpen(trigger)).toBe(true)
  })

  it('movimento pequeno durante a espera é tolerado', () => {
    const { trigger, text } = grid()
    fire(text, 'pointerover', { clientX: 10, clientY: 10 })
    wait(REST_MS - 100)
    fire(text, 'pointermove', { clientX: 13, clientY: 12 })
    wait(110)
    expect(isOpen(trigger)).toBe(true)
  })

  it('movimento maior que a tolerância recomeça a espera', () => {
    const { trigger, text } = grid()
    fire(text, 'pointerover', { clientX: 10, clientY: 10 })
    wait(REST_MS - 100)
    fire(text, 'pointermove', { clientX: 40, clientY: 10 })
    wait(110)
    expect(isOpen(trigger)).toBe(false)
    wait(REST_MS)
    expect(isOpen(trigger)).toBe(true)
  })

  it('passar direto pelo texto não abre', () => {
    const { trigger, text, outside } = grid()
    fire(text, 'pointerover', { clientX: 10, clientY: 10 })
    wait(150)
    fire(text, 'pointerout', { relatedTarget: outside })
    wait(REST_MS)
    expect(isOpen(trigger)).toBe(false)
  })

  it('fica aberto no cartão, inclusive depois de clicar para copiar, e fecha ao sair', () => {
    const { trigger, text, copy, outside } = grid()
    fire(text, 'pointerover', { clientX: 10, clientY: 10 })
    wait(REST_MS)
    fire(text, 'pointerout', { relatedTarget: copy })
    fire(copy, 'pointerover')
    fire(copy, 'pointerdown')
    wait(CLOSE_MS + 10)
    expect(isOpen(trigger)).toBe(true)
    fire(copy, 'pointerout', { relatedTarget: outside })
    wait(CLOSE_MS + 10)
    expect(isOpen(trigger)).toBe(false)
  })

  it('clicar fora fecha na hora', () => {
    const { trigger, text, outside } = grid()
    fire(text, 'pointerover', { clientX: 10, clientY: 10 })
    wait(REST_MS)
    fire(outside, 'pointerdown')
    expect(isOpen(trigger)).toBe(false)
  })
})
