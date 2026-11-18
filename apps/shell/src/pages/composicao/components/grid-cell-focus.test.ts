// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adjacentGridCell } from './grid-cell-focus'

const cell = (id: string) => document.querySelector<HTMLElement>(`[data-id="${id}"]`)!

beforeEach(() => {
  document.body.innerHTML = `<table><tbody>
    <tr><td data-grid-cell data-id="a1"></td><td data-grid-cell data-grid-editable="false" data-id="a2"></td><td data-grid-cell data-id="a3"></td></tr>
    <tr><td data-grid-cell data-id="b1"></td><td data-grid-cell data-id="b2"></td><td data-grid-cell data-id="b3"></td></tr>
  </tbody></table>`
})

describe('adjacentGridCell', () => {
  it('null sem origem ou fora de tabela', () => {
    expect(adjacentGridCell(null, 'Tab')).toBeNull()
    expect(adjacentGridCell(document.createElement('div'), 'Tab')).toBeNull()
  })
  it('Tab pula células não editáveis e avança de linha', () => {
    expect(adjacentGridCell(cell('a1'), 'Tab')).toBe(cell('a3'))
    expect(adjacentGridCell(cell('a3'), 'Tab')).toBe(cell('b1'))
  })
  it('Shift+Tab volta pulando não editáveis', () => {
    expect(adjacentGridCell(cell('a3'), 'Tab', true)).toBe(cell('a1'))
    expect(adjacentGridCell(cell('a1'), 'Tab', true)).toBeNull()
  })
  it('Tab na última célula retorna null', () => expect(adjacentGridCell(cell('b3'), 'Tab')).toBeNull())
  it('Enter desce e Shift+Enter sobe', () => {
    expect(adjacentGridCell(cell('a1'), 'Enter')).toBe(cell('b1'))
    expect(adjacentGridCell(cell('b2'), 'Enter', true)).toBe(cell('a2'))
    expect(adjacentGridCell(cell('b2'), 'Enter')).toBeNull()
  })
  it('setas navegam nas quatro direções e param nas bordas', () => {
    expect(adjacentGridCell(cell('a1'), 'ArrowRight')).toBe(cell('a2'))
    expect(adjacentGridCell(cell('b2'), 'ArrowLeft')).toBe(cell('b1'))
    expect(adjacentGridCell(cell('a2'), 'ArrowDown')).toBe(cell('b2'))
    expect(adjacentGridCell(cell('b3'), 'ArrowUp')).toBe(cell('a3'))
    expect(adjacentGridCell(cell('a1'), 'ArrowLeft')).toBeNull()
    expect(adjacentGridCell(cell('a3'), 'ArrowRight')).toBeNull()
  })
  describe('grade virtualizada', () => {
    const revealed = () => {
      const handler = vi.fn()
      document.querySelector('table')!.addEventListener('grid:reveal-row', (event) => handler((event as CustomEvent).detail))
      return handler
    }
    it('seta para baixo na última linha desenhada pede a linha seguinte, na mesma coluna', () => {
      document.querySelectorAll('tr').forEach((tr, position) => { tr.dataset.rowIndex = String(10 + position) })
      document.querySelector('table')!.dataset.rowCount = '50'
      const handler = revealed()
      expect(adjacentGridCell(cell('b2'), 'ArrowDown')).toBeNull()
      expect(handler).toHaveBeenCalledWith({ index: 12, column: 1 })
    })
    it('seta para cima na primeira linha desenhada pede a anterior', () => {
      document.querySelectorAll('tr').forEach((tr, position) => { tr.dataset.rowIndex = String(10 + position) })
      document.querySelector('table')!.dataset.rowCount = '50'
      const handler = revealed()
      expect(adjacentGridCell(cell('a3'), 'ArrowUp')).toBeNull()
      expect(handler).toHaveBeenCalledWith({ index: 9, column: 2 })
    })
    it('Tab na última célula pede a primeira célula editável da próxima linha; Shift+Tab, a última da anterior', () => {
      document.querySelectorAll('tr').forEach((tr, position) => { tr.dataset.rowIndex = String(10 + position) })
      document.querySelector('table')!.dataset.rowCount = '50'
      const handler = revealed()
      expect(adjacentGridCell(cell('b3'), 'Tab')).toBeNull()
      expect(handler).toHaveBeenLastCalledWith({ index: 12, edge: 'first' })
      expect(adjacentGridCell(cell('a1'), 'Tab', true)).toBeNull()
      expect(handler).toHaveBeenLastCalledWith({ index: 9, edge: 'last' })
    })
    it('nas bordas da lista inteira não pede nada', () => {
      const handler = revealed()
      expect(adjacentGridCell(cell('b2'), 'ArrowDown')).toBeNull()
      expect(adjacentGridCell(cell('a2'), 'ArrowUp')).toBeNull()
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
