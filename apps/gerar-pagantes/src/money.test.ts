import { describe, expect, it } from 'vitest'
import { hasValidCurrencyPrecision, parseCurrency, splitEvenly } from './money'

describe('splitEvenly', () => {
  it('distribui centavos residuais no começo da lista', () => {
    expect([...splitEvenly(100, ['a', 'b', 'c']).values()]).toEqual([34, 33, 33])
  })
})

describe('parseCurrency', () => {
  it('converte formato brasileiro para centavos', () => {
    expect(parseCurrency('1.000,50')).toBe(100050)
  })

  it('rejeita valor inválido', () => {
    expect(parseCurrency('1,2,3')).toBeNull()
  })

  it('rejeita mais de duas casas decimais', () => {
    expect(hasValidCurrencyPrecision('10,001')).toBe(false)
    expect(hasValidCurrencyPrecision('10,01')).toBe(true)
  })
})
