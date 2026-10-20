import { describe, expect, it } from 'vitest'
import { emptyFilters, type FilterField, type TableFilters } from '@betinhos/ui'
import { filterRows } from './filterRows'

const fields: FilterField[] = [{ key: 'status', label: 'Status', kind: 'choice', options: [{ value: '1', label: 'Ativo' }, { value: '2', label: 'Inativo' }] }]
const rows = [{ id: 'a', status: '1' }, { id: 'b', status: '2' }, { id: 'c', status: '1' }]
const read = (row: (typeof rows)[number], key: string) => (key === 'status' ? row.status : null)

describe('filterRows', () => {
  it('sem filtro devolve a própria lista (nada a percorrer)', () => {
    expect(filterRows(rows, emptyFilters(), fields, read)).toBe(rows)
  })

  it('com filtro mantém a ordem e só as linhas que passam', () => {
    const filters: TableFilters = { ...emptyFilters(), quick: { status: { type: 'condition', id: 'rapido-status', field: 'status', op: 'in', values: [{ value: '1', label: 'Ativo' }] } } }
    expect(filterRows(rows, filters, fields, read).map((r) => r.id)).toEqual(['a', 'c'])
  })
})
