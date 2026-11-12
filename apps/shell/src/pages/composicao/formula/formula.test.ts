import { describe, expect, it } from 'vitest'
import fixtures from './formula-engine-v1.json'
import { moneyFields, type MoneyField } from '../data/compositions'
import { evaluateFormula, evaluateFormulaSet, formulaExpressionFromInput, FormulaError, insertReferenceInFormula } from './index'

const emptyValues = () => Object.fromEntries(moneyFields.map(({ key }) => [key, '0.00'])) as Record<MoneyField, string>

describe('formula engine v1', () => {
  fixtures.forEach((fixture) => it(fixture.name, () => {
    const values = { ...emptyValues(), ...(fixture.values ?? {}) }
    if (fixture.error) {
      expect(() => evaluateFormula(fixture.expression, values)).toThrowError(expect.objectContaining({ code: fixture.error }))
    } else expect(evaluateFormula(fixture.expression, values).value).toBe(fixture.expected)
  }))

  it('normalizes labels to logical names', () => {
    expect(evaluateFormula('=[Locação]+[Pedágios]', { ...emptyValues(), new_valorlocacao: '100.00', new_valorpedagios: '25.00' }).expression)
      .toBe('=[new_valorlocacao]+[new_valorpedagios]')
  })

  it('requires an equals sign for formulas', () => {
    expect(formulaExpressionFromInput('100+50')).toBeNull()
    expect(formulaExpressionFromInput('-25')).toBeNull()
    expect(evaluateFormula(formulaExpressionFromInput('=100+50')!, emptyValues()).value).toBe('150.00')
  })

  it('turns a draft into a formula when a column reference is inserted', () => {
    expect(insertReferenceInFormula('100+', 'Locação', 4)).toEqual({ value: '=100+[Locação]', cursor: 14 })
    expect(insertReferenceInFormula('75,00', 'Pedágios', 0, 5)).toEqual({ value: '=[Pedágios]', cursor: 11 })
  })

  it('evaluates dependent formulas in topological order', () => {
    const result = evaluateFormulaSet({
      new_subtotal: '=[Locação]+[Pedágios]',
      new_valortotal: '=[Subtotal]+[Ajuste]',
    }, { ...emptyValues(), new_valorlocacao: '100.00', new_valorpedagios: '25.00', new_ajuste: '-5.00' })
    expect(result.values.new_subtotal).toBe('125.00')
    expect(result.values.new_valortotal).toBe('120.00')
  })

  it('rejects self references', () => {
    expect(() => evaluateFormulaSet({ new_subtotal: '=[Subtotal]+1' }, emptyValues()))
      .toThrowError(expect.objectContaining({ code: 'SELF_REFERENCE' }))
  })

  it('rejects circular references', () => {
    expect(() => evaluateFormulaSet({ new_subtotal: '=[Total]', new_valortotal: '=[Subtotal]' }, emptyValues()))
      .toThrowError(expect.objectContaining({ code: 'CIRCULAR_REFERENCE' }))
  })

  it('returns typed errors', () => {
    try { evaluateFormula('=1/0', emptyValues()) } catch (error) { expect(error).toBeInstanceOf(FormulaError) }
  })

  it('preserva centavos em 2.000 combinações de valores e referências', () => {
    const amount = (cents: number) => (cents / 100).toFixed(2)
    for (let index = 0; index < 1000; index++) {
      const a = (index * 7919) % 100000
      const b = (index * 3571) % 90000
      const c = (index * 97) % 30000
      const expected = amount(a + b - c)
      expect(evaluateFormula(`=${amount(a)}+${amount(b)}-${amount(c)}`, emptyValues()).value).toBe(expected)
      expect(evaluateFormula('=[Locação]+[Pedágios]-[Ajuste]', {
        ...emptyValues(), new_valorlocacao: amount(a), new_valorpedagios: amount(b), new_ajuste: amount(c),
      }).value).toBe(expected)
    }
  })
})
