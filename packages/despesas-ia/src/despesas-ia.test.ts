import { describe, expect, it } from 'vitest'
import { RESPOSTA_SCHEMA, analisarMensagem, montarRequisicao, montarTextoUsuario, PREFIXO_USUARIO, type ContextoDespesa } from './index.ts'

const ctx: ContextoDespesa = {
  despesa: { id: 'd1', valor: 85.4, dataGasto: '2026-10-12', categoria: 'Combustível', formaPagamento: 'Cartão corporativo', estabelecimento: 'Posto X', litros: 32.5, km: 120345, observacao: null },
  reservas: [{ id: 'r1', saida: '2026-10-12T13:00:00Z', cliente: 'Embraer', status: 'Concluído' }],
  duplicatas: [],
  referencia: { categoria: 'Combustível', mediana: 180, maximo: 420, amostras: 210 },
}
const valida = { comprovante_legivel: true, tipo_comprovante: 'nfce', valor_lido: 85.4, data_lida: '2026-10-12', hora_lida: '14:32', cnpj_lido: null, estabelecimento_lido: 'Posto X', litros_lidos: 32.5, decisao: 'validar', motivos: [], reserva_id: 'r1', possivel_duplicidade: false, confianca: 0.93 }
const msg = (corpo: unknown, stop = 'end_turn') => ({ stop_reason: stop, model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(corpo) }] })

describe('schema', () => {
  it('exige todos os campos e não aceita campos extras', () => {
    expect(RESPOSTA_SCHEMA.additionalProperties).toBe(false)
    expect([...RESPOSTA_SCHEMA.required].sort()).toEqual(Object.keys(RESPOSTA_SCHEMA.properties).sort())
  })
  it('não usa restrições numéricas nem de tamanho (não suportadas)', () => {
    expect(JSON.stringify(RESPOSTA_SCHEMA)).not.toMatch(/minimum|maximum|minLength|maxLength/)
  })
})

describe('montarRequisicao', () => {
  it('manda imagens antes do texto, com modelo, effort e schema', () => {
    const req = montarRequisicao(ctx, [{ mime: 'image/jpeg', base64: 'QUJD' }])
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: RESPOSTA_SCHEMA } })
    expect(req.messages[0].content.map((b) => b.type)).toEqual(['image', 'text'])
  })
  it('PDF vira document', () => {
    const req = montarRequisicao(ctx, [{ mime: 'application/pdf', base64: 'QUJD' }])
    expect(req.messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } })
  })
  it('usa no máximo 3 comprovantes', () => {
    const quatro = Array.from({ length: 4 }, () => ({ mime: 'image/png', base64: 'QUJD' }))
    expect(montarRequisicao(ctx, quatro).messages[0].content).toHaveLength(4)
  })
  it('recusa sem comprovante, tipo não suportado e arquivo acima de 5 MB', () => {
    expect(() => montarRequisicao(ctx, [])).toThrow('Despesa sem comprovante.')
    expect(() => montarRequisicao(ctx, [{ mime: 'image/heic', base64: 'QUJD' }])).toThrow('Tipo de comprovante não suportado: image/heic')
    expect(() => montarRequisicao(ctx, [{ mime: 'image/jpeg', base64: 'A'.repeat(7_100_000) }])).toThrow('Arquivo acima de 5 MB.')
  })
  it('texto do usuário é o prefixo seguido do contexto em JSON', () => {
    expect(montarTextoUsuario(ctx)).toBe(PREFIXO_USUARIO + JSON.stringify(ctx))
  })
})

describe('analisarMensagem', () => {
  it('aceita resposta válida', () => {
    expect(analisarMensagem(msg(valida), ctx)).toEqual({ ok: true, resposta: valida })
  })
  it('recusa stop_reason diferente de end_turn', () => {
    expect(analisarMensagem(msg(valida, 'max_tokens'), ctx)).toEqual({ ok: false, erro: 'Resposta incompleta (stop_reason: max_tokens).' })
  })
  it('recusa JSON inválido', () => {
    const quebrada = { stop_reason: 'end_turn', model: 'x', content: [{ type: 'text', text: '{"decisao":' }] }
    expect(analisarMensagem(quebrada, ctx)).toEqual({ ok: false, erro: 'Resposta não é JSON válido.' })
  })
  it('recusa OS fora do contexto', () => {
    expect(analisarMensagem(msg({ ...valida, reserva_id: 'r9' }), ctx)).toEqual({ ok: false, erro: 'OS indicada fora do contexto: r9.' })
  })
  it('exige motivos quando precisa corrigir', () => {
    expect(analisarMensagem(msg({ ...valida, decisao: 'precisa_corrigir', motivos: [] }), ctx)).toEqual({ ok: false, erro: 'Decisão "precisa_corrigir" sem motivos.' })
  })
  it('recusa decisão desconhecida e confiança fora de 0–1', () => {
    expect(analisarMensagem(msg({ ...valida, decisao: 'aprovar' }), ctx)).toEqual({ ok: false, erro: 'Decisão inválida: aprovar.' })
    expect(analisarMensagem(msg({ ...valida, confianca: 1.4 }), ctx)).toEqual({ ok: false, erro: 'Confiança fora de 0–1: 1.4.' })
  })
})
