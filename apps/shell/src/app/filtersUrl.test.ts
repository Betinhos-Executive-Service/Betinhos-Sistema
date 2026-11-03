import { emptyFilters, type TableFilters } from '@betinhos/ui'
import { describe, expect, it } from 'vitest'
import { decodeTableFilters, encodeTableFilters, hasActiveFilters } from './filtersUrl'

const quick = (): TableFilters => ({
  quick: { status: { type: 'condition', id: 'c1', field: 'status', op: 'in', values: ['ação', 'São Paulo'] } as never },
  advanced: emptyFilters().advanced,
})

describe('filtros na URL', () => {
  it('hasActiveFilters só vale com filtro rápido ou condição avançada', () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false)
    expect(hasActiveFilters(quick())).toBe(true)
    const adv = emptyFilters()
    adv.advanced.items.push({ type: 'condition', id: 'a', field: 'x', op: 'eq', value: '1' } as never)
    expect(hasActiveFilters(adv)).toBe(true)
  })

  it('sem filtro codifica para texto vazio', () => {
    expect(encodeTableFilters(emptyFilters())).toBe('')
  })

  it('o texto é base64url seguro para URL (sem +, / e =)', () => {
    const text = encodeTableFilters(quick())
    expect(text).not.toBe('')
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('ida e volta preserva acentos e a estrutura', () => {
    const original = quick()
    const decoded = decodeTableFilters(encodeTableFilters(original))
    expect(decoded?.quick).toEqual(original.quick)
    expect(decoded?.advanced).toEqual(original.advanced)
  })

  it('o grupo avançado volta com id "raiz" mesmo que o link traga outro', () => {
    const filters = emptyFilters()
    filters.advanced = { type: 'group', id: 'outro', logic: 'or', items: [{ type: 'condition', id: 'a', field: 'x', op: 'eq', value: 'y' } as never] }
    const decoded = decodeTableFilters(encodeTableFilters(filters))!
    expect(decoded.advanced.id).toBe('raiz')
    expect(decoded.advanced.logic).toBe('or')
    expect(decoded.advanced.items).toHaveLength(1)
  })

  it('tolera espaços ao redor e base64 sem preenchimento', () => {
    const text = encodeTableFilters(quick())
    expect(decodeTableFilters(`  ${text}  `)?.quick).toEqual(quick().quick)
  })

  it('devolve null para lixo, JSON de outro formato, array e nulo', () => {
    const b64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '')
    expect(decodeTableFilters('%%%')).toBeNull()
    expect(decodeTableFilters('')).toBeNull()
    expect(decodeTableFilters(b64({ outro: 1 }))).toBeNull()
    expect(decodeTableFilters(b64([1, 2]))).toBeNull()
    expect(decodeTableFilters(b64(null))).toBeNull()
    expect(decodeTableFilters(b64('texto'))).toBeNull()
  })

  it('quick ou advanced malformados caem nos vazios em vez de quebrar', () => {
    const b64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '')
    const decoded = decodeTableFilters(b64({ quick: [1], advanced: { type: 'condition' } }))!
    expect(decoded.quick).toEqual({})
    expect(decoded.advanced).toEqual(emptyFilters().advanced)
    expect(decodeTableFilters(b64({ quick: { a: 1 } }))!.advanced).toEqual(emptyFilters().advanced)
  })
})
