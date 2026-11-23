import { describe, expect, it } from 'vitest'
import { marcaParceira } from './marcas'

describe('marcaParceira', () => {
  it('acha a Latasa pelo cliente da sessão, pelo domínio do e-mail e pelo ?c= do link', () => {
    expect(marcaParceira({ cliente: 'Latasa' })?.nome).toBe('ReciclaBR Latasa')
    expect(marcaParceira({ cliente: 'RECICLABR LATASA LTDA' })?.nome).toBe('ReciclaBR Latasa')
    expect(marcaParceira({ email: 'Compras@ReciclaBR.com.br ' })?.nome).toBe('ReciclaBR Latasa')
    expect(marcaParceira({ chave: 'LATASA' })?.nome).toBe('ReciclaBR Latasa')
  })

  it('cliente fora da lista fica só com a Betinhos', () => {
    expect(marcaParceira({ cliente: 'Tenaris', email: 'x@tenaris.com' })).toBeNull()
    expect(marcaParceira({ chave: 'outra' })).toBeNull()
    expect(marcaParceira({})).toBeNull()
  })
})
