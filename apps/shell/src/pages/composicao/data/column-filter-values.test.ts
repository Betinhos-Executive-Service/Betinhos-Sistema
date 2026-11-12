import { describe, expect, it } from 'vitest'
import { createColumnFilterLabels } from './column-filter-values'

describe('rótulos dos valores do filtro', () => {
  it('mostra o nome de exibição da opção e cai no valor bruto sem rótulo', () => {
    const rows = [{ raw: '202410005', label: 'Pendente' }, { raw: '100000001', label: 'Composição Realizada' }, { raw: '7', label: undefined }]
    const label = createColumnFilterLabels(rows)('status', (row) => row.raw, (row) => row.label)
    expect(label('202410005')).toBe('Pendente')
    expect(label('100000001')).toBe('Composição Realizada')
    expect(label('7')).toBe('7')
  })
})
