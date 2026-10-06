import { describe, expect, it } from 'vitest'
import { addMonths, daysBetween, diaSP, toDataverseDate, toDateOnly } from './dates'

describe('dates', () => {
  it('converte DateTime UTC para o dia de São Paulo', () => {
    expect(diaSP('2026-10-02T01:30:00Z')).toBe('2026-10-01')
    expect(diaSP('2026-10-02T15:00:00Z')).toBe('2026-10-02')
    expect(diaSP(null)).toBeNull()
  })

  it('diaSP não desloca um valor que já é só data', () => {
    expect(diaSP('2026-03-03')).toBe('2026-03-03')
    expect(diaSP('texto inválido')).toBeNull()
  })

  it('lê coluna de data conforme o comportamento', () => {
    expect(toDateOnly('2026-03-03', 'DateOnly')).toBe('2026-03-03')
    expect(toDateOnly('2026-03-03T00:00:00Z', 'TimeZoneIndependent')).toBe('2026-03-03')
    expect(toDateOnly('2026-03-03T02:00:00Z', 'UserLocal')).toBe('2026-03-02')
  })

  it('grava coluna de data conforme o comportamento', () => {
    expect(toDataverseDate('2026-03-03', 'DateOnly')).toBe('2026-03-03')
    expect(toDataverseDate('2026-03-03', 'UserLocal')).toBe('2026-03-03T03:00:00Z')
    expect(toDataverseDate(null)).toBeNull()
  })

  it('calcula diferença em dias e soma meses', () => {
    expect(daysBetween('2026-10-02', '2026-10-09')).toBe(7)
    expect(daysBetween('2026-10-02', '2026-09-30')).toBe(-2)
    expect(addMonths('2026-10-02', -12)).toBe('2025-10-02')
  })
})
