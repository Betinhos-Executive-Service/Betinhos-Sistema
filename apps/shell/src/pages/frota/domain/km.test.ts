import { describe, expect, it } from 'vitest'
import { KM_MAXIMO, lerKm } from './km'

describe('lerKm', () => {
  it('aceita só número inteiro de 1 até o limite do int do servidor', () => {
    expect(lerKm(' 85200 ')).toBe(85200)
    expect(lerKm(String(KM_MAXIMO))).toBe(2147483647)
    for (const texto of ['', '0', '-5', '85200.5', '85200,5', '85.200', '8e4', 'abc', '2147483648', '99999999999']) expect(lerKm(texto), texto).toBeNull()
  })
})
