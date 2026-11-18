import { describe, expect, it } from 'vitest'
import { nextEditableCell } from './grid-navigation'
import type { ViewColumn } from './views'

const rows = [{ id: 'r1' }, { id: 'r2' }]
const columns: ViewColumn[] = [
  { id: 'cr40f_valortempodeespera', width: 120, pinned: false },
  { id: 'client', width: 160, pinned: true },
  { id: 'new_valortotal', width: 120, pinned: false },
  { id: 'cr40f_valorhoramotorista', width: 120, pinned: false },
]

describe('Tab na grade', () => {
  it('segue a ordem visível e ignora colunas ocultas e calculadas', () => {
    expect(nextEditableCell(rows, columns, 'r1', 'cr40f_valortempodeespera')).toEqual({ row: rows[0], field: 'cr40f_valorhoramotorista' })
    expect(nextEditableCell(rows, columns, 'r1', 'cr40f_valorhoramotorista')).toEqual({ row: rows[1], field: 'cr40f_valortempodeespera' })
    expect(nextEditableCell(rows, columns, 'r1', 'cr40f_valortempodeespera', true)).toEqual({ row: rows[1], field: 'cr40f_valorhoramotorista' })
  })

  it('não navega quando a célula ou a linha deixou de estar visível', () => {
    expect(nextEditableCell(rows, columns, 'r1', 'new_valortotal')).toBeNull()
    expect(nextEditableCell(rows, columns, 'outro', 'cr40f_valorhoramotorista')).toBeNull()
  })
})
