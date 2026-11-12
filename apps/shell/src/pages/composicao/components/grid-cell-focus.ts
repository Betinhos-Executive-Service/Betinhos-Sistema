/** Pedido à grade virtualizada para rolar até uma linha que a janela não desenha e focar nela. */
export const REVEAL_GRID_ROW = 'grid:reveal-row'
export type RevealGridRow = {
  /** Posição da linha entre todas as linhas da grade. */
  index: number
  /** Coluna a focar; sem ela, a primeira (ou a última, com `edge: 'last'`) célula editável. */
  column?: number
  edge?: 'first' | 'last'
}

/**
 * Célula vizinha no DOM. A grade desenha só as linhas perto da tela: quando a vizinha existe mas está fora da janela
 * (`data-row-index` das linhas e `data-row-count` da tabela), pede a rolagem pelo evento `REVEAL_GRID_ROW` e devolve null; a
 * grade foca a célula quando a linha chega ao DOM.
 */
export function adjacentGridCell(origin: HTMLElement | null, key: string, reverse = false): HTMLElement | null {
  if (!origin) return null
  const table = origin.closest('table')
  if (!table) return null
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr:not([data-spacer])'))
  const row = origin.closest('tr')
  if (!row) return null
  // Índice absoluto na lista: `data-row-index` da grade virtualizada (a janela pode ter linhas fixadas fora dela);
  // sem o atributo, a posição no DOM.
  const absolute = (item: HTMLTableRowElement, position: number) => item.dataset.rowIndex === undefined ? position : Number(item.dataset.rowIndex)
  const rowIndex = absolute(row, rows.indexOf(row))
  const rowCount = Number(table.dataset.rowCount) || rows.length
  const rowAt = (index: number) => rows.find((item, position) => absolute(item, position) === index)
  const reveal = (detail: RevealGridRow) => { table.dispatchEvent(new CustomEvent<RevealGridRow>(REVEAL_GRID_ROW, { detail })); return null }
  const editable = (item: HTMLElement) => item.dataset.gridEditable !== 'false'
  if (key === 'Tab') {
    const cells = Array.from(row.querySelectorAll<HTMLElement>('[data-grid-cell]'))
    const direction = reverse ? -1 : 1
    for (let index = cells.indexOf(origin) + direction; index >= 0 && index < cells.length; index += direction) {
      if (editable(cells[index])) return cells[index]
    }
    const next = rowIndex + direction
    if (next < 0 || next >= rowCount) return null
    const target = rowAt(next)
    if (!target) return reveal({ index: next, edge: reverse ? 'last' : 'first' })
    const targetCells = Array.from(target.querySelectorAll<HTMLElement>('[data-grid-cell]'))
    return (reverse ? targetCells.reverse() : targetCells).find(editable) ?? null
  }
  const fields = Array.from(row.querySelectorAll<HTMLElement>('[data-grid-cell]'))
  const columnIndex = fields.indexOf(origin)
  const vertical = key === 'Enter' ? (reverse ? -1 : 1) : key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  const horizontal = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  const next = rowIndex + vertical
  const target = vertical ? rowAt(next) : row
  if (!target) return next >= 0 && next < rowCount ? reveal({ index: next, column: columnIndex + horizontal }) : null
  return target.querySelectorAll<HTMLElement>('[data-grid-cell]')[columnIndex + horizontal] ?? null
}
