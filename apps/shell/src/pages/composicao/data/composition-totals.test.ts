import { describe, expect, it } from 'vitest'
import { moneyFields, type MoneyField } from './compositions'
import { sumSelectedCompositions } from './composition-totals'

function row(value: string) {
  return { values: Object.fromEntries(moneyFields.map(({ key }) => [key, value])) as Record<MoneyField, string> }
}

describe('totais das linhas selecionadas', () => {
  it('soma com precisão decimal apenas os registros recebidos', () => {
    const totals = sumSelectedCompositions([row('0.10'), row('0.20')])
    expect(totals.new_valorlocacao).toBe('0.30')
    expect(totals.new_valortotal).toBe('0.30')
  })

  it('retorna zero quando nenhuma linha está selecionada', () => {
    expect(sumSelectedCompositions([]).new_valorlocacao).toBe('0.00')
  })
})
