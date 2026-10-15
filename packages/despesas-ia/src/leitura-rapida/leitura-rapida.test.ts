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

import { montarRequisicaoLeitura, MODELO_LEITURA, MAX_TOKENS_LEITURA } from './requisicao.ts'
import { SYSTEM_PROMPT_LEITURA } from './prompt.ts'

describe('montarRequisicaoLeitura', () => {
  it('usa Haiku, só a imagem e saída estruturada', () => {
    const r = montarRequisicaoLeitura({ imagemBase64: 'AAAA', mime: 'image/jpeg', categorias: ['Pedágio'], formasPagamento: ['TicketLog'] })
    expect(MODELO_LEITURA).toBe('claude-haiku-5-5')
    expect(r.model).toBe(MODELO_LEITURA)
    expect(r.max_tokens).toBe(MAX_TOKENS_LEITURA)
    expect(r.system).toBe(SYSTEM_PROMPT_LEITURA)
    expect(r.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
    expect(r.output_config.format.type).toBe('json_schema')
    expect(r.output_config.effort).toBe('low')
  })
  it('recusa mime fora de imagem e base64 acima do limite', () => {
    expect(() => montarRequisicaoLeitura({ imagemBase64: 'AAAA', mime: 'application/pdf', categorias: [], formasPagamento: [] })).toThrow('Tipo de imagem não suportado')
    expect(() => montarRequisicaoLeitura({ imagemBase64: 'A'.repeat(2_900_000), mime: 'image/jpeg', categorias: [], formasPagamento: [] })).toThrow('Imagem acima do limite')
  })
})
