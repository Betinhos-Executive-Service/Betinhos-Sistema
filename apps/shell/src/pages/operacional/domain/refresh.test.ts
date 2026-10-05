import { describe, expect, it } from 'vitest'
import type { Reserva } from './types'
import { keepPending, previousFields, revertPatch, type Overrides } from './refresh'

const ov = (entries: [string, Record<string, unknown>][]) => new Map(entries) as unknown as Overrides
const patchOf = (value: Record<string, unknown>) => value as Partial<Reserva>

describe('overrides otimistas', () => {
  it('após a carga, mantém só reservas com mutação em voo', () => {
    const kept = keepPending(ov([['a', { status: 'X' }], ['b', { status: 'Y' }]]), new Map([['a', 1], ['b', 0]]))
    expect([...kept.keys()]).toEqual(['a'])
  })
  it('rollback remove só os campos do patch que falhou', () => {
    const patch = patchOf({ status: 'Y' })
    const prev = previousFields(ov([['a', { status: 'X', motoristaId: 'm1' }]]), 'a', patch)
    const applied = ov([['a', { status: 'Y', motoristaId: 'm2' }]])
    expect(revertPatch(applied, 'a', patch, prev).get('a')).toEqual({ status: 'X', motoristaId: 'm2' })
  })
  it('rollback remove o campo sem valor anterior e descarta a entrada vazia', () => {
    const patch = patchOf({ status: 'Y' })
    const prev = previousFields(ov([]), 'a', patch)
    expect(revertPatch(ov([['a', patch]]), 'a', patch, prev).has('a')).toBe(false)
  })
})
