import { describe, expect, it } from 'vitest'
import { formatCelular } from './format'

describe('formatCelular', () => {
  it('mostra (DD) NNNNN-NNNN, com ou sem +55', () => {
    expect(formatCelular('+5512997135174')).toBe('(12) 99713-5174')
    expect(formatCelular('12997135174')).toBe('(12) 99713-5174')
    expect(formatCelular('1232345678')).toBe('(12) 3234-5678')
  })
  it('formata enquanto digita sem inventar dígitos', () => {
    expect(formatCelular('')).toBe('')
    expect(formatCelular('1')).toBe('(1')
    expect(formatCelular('129')).toBe('(12) 9')
    expect(formatCelular('1299713')).toBe('(12) 99713')
  })
})
