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
 * (`data-row-start`/`data-row-count` da tabela), pede a rolagem pelo evento `REVEAL_GRID_ROW` e devolve null; a
 * grade foca a célula quando a linha chega ao DOM.
 */
export function adjacentGridCell(origin: HTMLElement | null, key: string, reverse = false): HTMLElement | null {
  if (!origin) return null
  const table = origin.closest('table')
  if (!table) return null
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr:not([data-spacer])'))
  const row = origin.closest('tr')
  if (!row) return null
  const rowIndex = rows.indexOf(row)
  const rowStart = Number(table.dataset.rowStart) || 0
  const rowCount = Number(table.dataset.rowCount) || rows.length
  const reveal = (detail: RevealGridRow) => { table.dispatchEvent(new CustomEvent<RevealGridRow>(REVEAL_GRID_ROW, { detail })); return null }
  if (key === 'Tab') {
    const cells = Array.from(table.querySelectorAll<HTMLElement>('[data-grid-cell]'))
    const direction = reverse ? -1 : 1
    for (let index = cells.indexOf(origin) + direction; index >= 0 && index < cells.length; index += direction) {
      if (cells[index].dataset.gridEditable !== 'false') return cells[index]
    }
    const next = rowStart + rowIndex + direction
    return next >= 0 && next < rowCount ? reveal({ index: next, edge: reverse ? 'last' : 'first' }) : null
  }
  const fields = Array.from(row.querySelectorAll<HTMLElement>('[data-grid-cell]'))
  const columnIndex = fields.indexOf(origin)
  const vertical = key === 'Enter' ? (reverse ? -1 : 1) : key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  const horizontal = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  const target = rows[rowIndex + vertical]
  if (!target) {
    const next = rowStart + rowIndex + vertical
    return vertical && next >= 0 && next < rowCount ? reveal({ index: next, column: columnIndex + horizontal }) : null
  }
  return target.querySelectorAll<HTMLElement>('[data-grid-cell]')[columnIndex + horizontal] ?? null
}
