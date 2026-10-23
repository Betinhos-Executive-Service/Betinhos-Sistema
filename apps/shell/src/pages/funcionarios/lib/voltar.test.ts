import { describe, expect, it } from 'vitest'
import { destinoDeVolta } from './voltar'

describe('destinoDeVolta', () => {
  it('aceita só rotas internas do shell', () => {
    expect(destinoDeVolta(new URLSearchParams({ voltar: '#/frota-multas?registro=multa:u1' }))).toBe('#/frota-multas?registro=multa:u1')
    expect(destinoDeVolta(new URLSearchParams({ voltar: 'https://exemplo.invalid' }))).toBeNull()
    expect(destinoDeVolta(new URLSearchParams({ voltar: 'javascript:alert(1)' }))).toBeNull()
    expect(destinoDeVolta(new URLSearchParams())).toBeNull()
  })
})
