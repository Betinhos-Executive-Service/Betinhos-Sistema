import { describe, expect, it } from 'vitest'
import { moneyFields, type MoneyField } from '../data/compositions'
import { evaluateFormula, evaluateFormulaSet, friendlyExpression, insertReferenceInFormula } from './index'

const emptyValues = () => Object.fromEntries(moneyFields.map(({ key }) => [key, '0.00'])) as Record<MoneyField, string>

describe('formula: normalização e impressão canônica', () => {
  it('mantém parênteses necessários e remove os redundantes', () => {
    expect(evaluateFormula('=(1+2)*3', emptyValues()).expression).toBe('=(1+2)*3')
    expect(evaluateFormula('=((1+2))', emptyValues()).expression).toBe('=1+2')
    expect(evaluateFormula('=10-(2+3)', emptyValues()).expression).toBe('=10-(2+3)')
    expect(evaluateFormula('=(1+2)*3', emptyValues()).value).toBe('9.00')
  })
  it('é case-insensitive nos rótulos e informa campo desconhecido', () => {
    expect(evaluateFormula('=[LOCAÇÃO]', emptyValues()).expression).toBe('=[new_valorlocacao]')
    expect(() => evaluateFormula('=[Inexistente]', emptyValues())).toThrowError(expect.objectContaining({ code: 'UNKNOWN_FIELD' }))
  })
  it('friendlyExpression troca nomes lógicos por rótulos e preserva desconhecidos', () => {
    expect(friendlyExpression('=[new_valorlocacao]+[x_desconhecido]')).toBe('=[Locação]+[x_desconhecido]')
  })
  it('expõe dependências da fórmula', () => {
    const { dependencies } = evaluateFormula('=[Locação]+[Pedágios]*2', emptyValues())
    expect([...dependencies].sort()).toEqual(['new_valorlocacao', 'new_valorpedagios'])
  })
  it('insertReferenceInFormula limita cursor fora do intervalo', () => {
    expect(insertReferenceInFormula('=1+', 'Ajuste', 99)).toEqual({ value: '=1+[Ajuste]', cursor: 11 })
  })
  it('conjunto sem fórmulas devolve valores iniciais intactos', () => {
    const initial = { ...emptyValues(), new_ajuste: '5.00' }
    const result = evaluateFormulaSet({}, initial)
    expect(result.values).toEqual(initial)
    expect(result.order).toEqual([])
  })
})
