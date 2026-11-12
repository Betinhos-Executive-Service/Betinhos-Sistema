import { describe, expect, it } from 'vitest'
import { initialCompositions, isWritableMoneyField, moneyFields } from './compositions'

describe('moneyFields', () => {
  it('chaves e rótulos são únicos', () => {
    expect(new Set(moneyFields.map((f) => f.key)).size).toBe(moneyFields.length)
    expect(new Set(moneyFields.map((f) => f.label)).size).toBe(moneyFields.length)
  })
  it('Subtotal e Total são somente leitura; demais são graváveis', () => {
    expect(isWritableMoneyField('new_subtotal')).toBe(false)
    expect(isWritableMoneyField('new_valortotal')).toBe(false)
    expect(isWritableMoneyField('new_valorlocacao')).toBe(true)
    expect(isWritableMoneyField('new_ajuste')).toBe(true)
  })
})

describe('initialCompositions (dados mock)', () => {
  it('todas as linhas têm todos os campos monetários com 2 casas', () => {
    initialCompositions.forEach((row) => moneyFields.forEach(({ key }) => expect(row.values[key]).toMatch(/^-?\d+\.\d{2}$/)))
  })
  it('ids e rowVersion são únicos e status alterna', () => {
    expect(new Set(initialCompositions.map((r) => r.id)).size).toBe(initialCompositions.length)
    expect(new Set(initialCompositions.map((r) => r.rowVersion)).size).toBe(initialCompositions.length)
    expect(initialCompositions[0].status).toBe('Pendente')
    expect(initialCompositions[1].status).toBe('Concluído')
  })
  it('ajuste alterna entre 0 e -25', () => {
    expect(initialCompositions[0].values.new_ajuste).toBe('0.00')
    expect(initialCompositions[1].values.new_ajuste).toBe('-25.00')
  })
})
