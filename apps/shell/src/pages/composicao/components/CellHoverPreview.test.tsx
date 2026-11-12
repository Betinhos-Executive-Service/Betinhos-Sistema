// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CellHoverPreview } from './CellHoverPreview'

function grid(cell: string) {
  return render(<><CellHoverPreview /><table className="price-grid"><tbody><tr><td data-testid="cell">{cell === 'formula'
    ? <span className="money-cell-value" data-cell-formula="[Valor] * 2"><span>ƒx</span>R$ 200,00</span>
    : 'Texto curto'}</td><td data-testid="other">Outro</td></tr></tbody></table></>)
}

function hover(el: Element) {
  act(() => { el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: 10, clientY: 10 })) })
}

describe('CellHoverPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('fórmula mostra o resultado em cima e a conta embaixo, depois do atraso', () => {
    grid('formula')
    hover(screen.getByTestId('cell'))
    expect(document.querySelector('.cell-hover-preview')).toBeNull()
    act(() => { vi.advanceTimersByTime(400) })
    expect(document.querySelector('.cell-hover-preview__value')?.textContent).toBe('R$ 200,00')
    expect(document.querySelector('.cell-hover-preview__formula')?.textContent).toBe('ƒx[Valor] * 2')
  })

  it('texto que cabe na célula não abre popup', () => {
    grid('texto')
    hover(screen.getByTestId('cell'))
    act(() => { vi.advanceTimersByTime(400) })
    expect(document.querySelector('.cell-hover-preview')).toBeNull()
  })

  it('texto cortado abre o popup com o conteúdo completo e clicar esconde', () => {
    grid('texto')
    const cell = screen.getByTestId('cell')
    Object.defineProperty(cell, 'scrollWidth', { value: 300 })
    Object.defineProperty(cell, 'clientWidth', { value: 100 })
    Object.defineProperty(cell, 'innerText', { value: 'Texto curto' })
    hover(cell)
    act(() => { vi.advanceTimersByTime(400) })
    expect(document.querySelector('.cell-hover-preview__value')?.textContent).toBe('Texto curto')
    act(() => { document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
    expect(document.querySelector('.cell-hover-preview')).toBeNull()
  })
})
