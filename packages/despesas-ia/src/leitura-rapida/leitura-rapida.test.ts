import { describe, expect, it } from 'vitest'
import { schemaLeituraRapida } from './schema.ts'

describe('schemaLeituraRapida', () => {
  it('monta enum de categoria e forma de pagamento com as listas recebidas, aceitando null', () => {
    const s = schemaLeituraRapida(['Abastecimento', 'Pedágio'], ['Cartão de crédito'])
    expect(s.required).toEqual(Object.keys(s.properties))
    expect(s.additionalProperties).toBe(false)
    expect(s.properties.categoria_sugerida).toEqual({ anyOf: [{ type: 'string', enum: ['Abastecimento', 'Pedágio'] }, { type: 'null' }] })
    expect(s.properties.forma_pagamento_sugerida).toEqual({ anyOf: [{ type: 'string', enum: ['Cartão de crédito'] }, { type: 'null' }] })
    expect(s.properties.legivel).toEqual({ type: 'boolean' })
  })
})
