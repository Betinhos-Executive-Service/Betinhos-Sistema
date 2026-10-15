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
  it('desliga o raciocínio para a resposta vir só com o bloco de texto', () => {
    const r = montarRequisicaoLeitura({ imagemBase64: 'AAAA', mime: 'image/jpeg', categorias: [], formasPagamento: [] })
    expect(r.thinking).toEqual({ type: 'disabled' })
  })
  it('recusa mime fora de imagem e base64 acima do limite', () => {
    expect(() => montarRequisicaoLeitura({ imagemBase64: 'AAAA', mime: 'application/pdf', categorias: [], formasPagamento: [] })).toThrow('Tipo de imagem não suportado')
    expect(() => montarRequisicaoLeitura({ imagemBase64: 'A'.repeat(2_900_000), mime: 'image/jpeg', categorias: [], formasPagamento: [] })).toThrow('Imagem acima do limite')
  })
})

import { interpretarLeitura } from './resposta.ts'

const base = { legivel: true, valor: 85.4, data: '2026-10-12', hora: '14:32', estabelecimento: 'Posto X', cnpj: null, litros: 32.5, categoria_sugerida: 'Abastecimento', forma_pagamento_sugerida: null, motivo_ilegivel: null }
const msg = (o: unknown, stop = 'end_turn') => ({ stop_reason: stop, model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(o) }] })

describe('interpretarLeitura', () => {
  it('aceita leitura válida', () => expect(interpretarLeitura(msg(base))).toEqual({ ok: true, leitura: base }))
  it('lê o bloco de texto mesmo quando um bloco thinking vem antes', () => {
    const m = msg(base)
    expect(interpretarLeitura({ ...m, content: [{ type: 'thinking', text: '' }, ...m.content] })).toEqual({ ok: true, leitura: base })
  })
  it('falha quando stop_reason não é end_turn', () => expect(interpretarLeitura(msg(base, 'max_tokens')).ok).toBe(false))
  it('legível sem valor vira ilegível', () => {
    expect(interpretarLeitura(msg({ ...base, valor: null }))).toEqual({ ok: true, leitura: { ...base, valor: null, legivel: false, motivo_ilegivel: 'Valor ou data não identificados.' } })
  })
  it('valor negativo ou data fora de AAAA-MM-DD falha', () => {
    expect(interpretarLeitura(msg({ ...base, valor: -1 })).ok).toBe(false)
    expect(interpretarLeitura(msg({ ...base, data: '12/10/2026' })).ok).toBe(false)
  })
})

import { constantesDaLeituraRapida } from './index.ts'
import { TEXTO_USUARIO_LEITURA } from './prompt.ts'

describe('constantesDaLeituraRapida', () => {
  it('expõe o que o provisionamento do flow precisa', () => {
    expect(constantesDaLeituraRapida()).toEqual({ modelo: 'claude-haiku-5-5', maxTokens: 1024, effort: 'low', thinking: { type: 'disabled' }, systemPrompt: SYSTEM_PROMPT_LEITURA, textoUsuario: TEXTO_USUARIO_LEITURA, limiteBase64: 2_800_000 })
  })
})
