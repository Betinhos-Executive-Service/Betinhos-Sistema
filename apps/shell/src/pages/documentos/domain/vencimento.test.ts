// domain/vencimento.test.ts
import { describe, expect, it } from 'vitest'
import { JANELA_DIAS, marcoDe, rotuloPrazo, statusDe, validadeSugerida } from './vencimento'

describe('vencimento', () => {
  it('marcos nos limites', () => {
    expect(marcoDe(-1)).toBe('vencido')
    expect(marcoDe(0)).toBe('7')
    expect(marcoDe(7)).toBe('7')
    expect(marcoDe(8)).toBe('30')
    expect(marcoDe(30)).toBe('30')
    expect(marcoDe(31)).toBe('60')
    expect(marcoDe(60)).toBe('60')
    expect(marcoDe(61)).toBeNull()
    expect(JANELA_DIAS).toBe(60)
  })

  it('status a partir da validade', () => {
    expect(statusDe('2026-10-12', '2026-10-13', true)).toEqual({ status: 'vencido', dias: -1 })
    expect(statusDe('2026-10-20', '2026-10-13', true)).toEqual({ status: 'vence7', dias: 7 })
    expect(statusDe('2026-11-12', '2026-10-13', true)).toEqual({ status: 'vence30', dias: 30 })
    expect(statusDe('2026-12-12', '2026-10-13', true)).toEqual({ status: 'vence60', dias: 60 })
    expect(statusDe('2027-10-13', '2026-10-13', true)).toEqual({ status: 'ok', dias: 365 })
    expect(statusDe(null, '2026-10-13', false)).toEqual({ status: 'semValidade', dias: null })
    expect(statusDe('2026-10-12', '2026-10-13', false)).toEqual({ status: 'semValidade', dias: null })
  })

  it('validade sugerida pela emissão', () => {
    expect(validadeSugerida({ temValidade: true, validadePadraoMeses: 12 }, '2026-02-28')).toBe('2027-02-28')
    expect(validadeSugerida({ temValidade: true, validadePadraoMeses: null }, '2026-01-10')).toBeNull()
    expect(validadeSugerida({ temValidade: false, validadePadraoMeses: 12 }, '2026-01-10')).toBeNull()
    expect(validadeSugerida({ temValidade: true, validadePadraoMeses: 12 }, null)).toBeNull()
  })

  it('rótulo do prazo', () => {
    expect(rotuloPrazo(-1)).toBe('vencido há 1 dia')
    expect(rotuloPrazo(-12)).toBe('vencido há 12 dias')
    expect(rotuloPrazo(0)).toBe('vence hoje')
    expect(rotuloPrazo(1)).toBe('vence em 1 dia')
    expect(rotuloPrazo(45)).toBe('vence em 45 dias')
    expect(rotuloPrazo(null)).toBe('')
  })
})
