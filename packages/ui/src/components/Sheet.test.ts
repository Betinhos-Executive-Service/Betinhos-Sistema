import { describe, expect, it } from 'vitest'
import { dampen, resolveSnap } from './sheetGesture'

const height = 800
describe('gesto do sheet', () => {
  it('fecha a partir da metade por distância ou por gesto rápido', () => {
    expect(resolveSnap({ dy: 210, ms: 600, level: 'half', height })).toBe('close')
    expect(resolveSnap({ dy: 60, ms: 200, level: 'half', height })).toBe('half')
    expect(resolveSnap({ dy: 40, ms: 120, level: 'half', height })).toBe('close')
  })
  it('do cheio volta para a metade', () => {
    expect(resolveSnap({ dy: 300, ms: 600, level: 'full', height })).toBe('half')
    expect(resolveSnap({ dy: 30, ms: 600, level: 'full', height })).toBe('full')
  })
  it('para cima expande', () => {
    expect(resolveSnap({ dy: -130, ms: 600, level: 'half', height })).toBe('full')
    expect(resolveSnap({ dy: -50, ms: 200, level: 'half', height })).toBe('full')
    expect(resolveSnap({ dy: -20, ms: 600, level: 'half', height })).toBe('half')
  })
  it('amortece o arrasto para cima', () => {
    expect(dampen(120)).toBe(120)
    expect(dampen(-100)).toBeGreaterThan(-100)
    expect(dampen(-400)).toBeLessThan(dampen(-100))
  })
})
