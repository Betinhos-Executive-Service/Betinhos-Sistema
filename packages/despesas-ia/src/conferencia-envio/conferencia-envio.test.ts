import { describe, expect, it } from 'vitest'
import { interpretarConferencia, montarRequisicaoConferencia, schemaConferencia, SYSTEM_PROMPT_CONFERENCIA } from './index.ts'

const msg = (texto: string, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text: texto }] }) as never
const sinal = { tipo: 'acima_politica', detalhe: 'Almoço de R$ 58,00 contra a política de R$ 42,00' }

describe('montarRequisicaoConferencia', () => {
  it('Haiku, sem raciocínio, saída estruturada e o contexto em JSON no texto do usuário', () => {
    const r = montarRequisicaoConferencia({ sinais: [sinal], gasto: { categoria: 'Almoço', valor: 58 } })
    expect(r.model).toBe('claude-haiku-5-5')
    expect(r.thinking).toEqual({ type: 'disabled' })
    expect(r.output_config.format.schema).toEqual(schemaConferencia())
    expect(r.messages[0].content[0].text).toContain('"valor":58')
  })
  it('recusa sem sinais, sinal desconhecido ou contexto grande demais', () => {
    expect(() => montarRequisicaoConferencia({ sinais: [] })).toThrow()
    expect(() => montarRequisicaoConferencia({ sinais: [{ tipo: 'outro', detalhe: '' }] })).toThrow()
    expect(() => montarRequisicaoConferencia({ sinais: [sinal], recentes: 'x'.repeat(21_000) })).toThrow()
  })
})

describe('interpretarConferencia', () => {
  it('aceita dúvida com pergunta e motivos válidos', () => {
    const r = interpretarConferencia(msg(JSON.stringify({ resultado: 'duvida', pergunta: '  O almoço ficou acima da política. O que aconteceu?  ', motivos: ['acima_politica'] })))
    expect(r).toEqual({ ok: true, conferencia: { resultado: 'duvida', pergunta: 'O almoço ficou acima da política. O que aconteceu?', motivos: ['acima_politica'] } })
  })
  it('sem_duvida zera pergunta e motivos', () => {
    expect(interpretarConferencia(msg(JSON.stringify({ resultado: 'sem_duvida', pergunta: 'x', motivos: ['acima_politica'] })))).toEqual({ ok: true, conferencia: { resultado: 'sem_duvida', pergunta: null, motivos: [] } })
  })
  it('falha técnica: incompleta, não JSON, dúvida sem pergunta, motivo desconhecido', () => {
    expect(interpretarConferencia(msg('{}', 'max_tokens')).ok).toBe(false)
    expect(interpretarConferencia(msg('oi')).ok).toBe(false)
    expect(interpretarConferencia(msg(JSON.stringify({ resultado: 'duvida', pergunta: 'curta', motivos: [] }))).ok).toBe(false)
    expect(interpretarConferencia(msg(JSON.stringify({ resultado: 'duvida', pergunta: 'Pergunta longa o bastante?', motivos: ['outro'] }))).ok).toBe(false)
  })
})

describe('SYSTEM_PROMPT_CONFERENCIA', () => {
  it('pede uma pergunta só, com números, sugere a data do dia vizinho e não tem @ (expressão do Logic Apps)', () => {
    expect(SYSTEM_PROMPT_CONFERENCIA).toMatch(/UMA pergunta curta/)
    expect(SYSTEM_PROMPT_CONFERENCIA).toMatch(/servico_dia_vizinho/)
    expect(SYSTEM_PROMPT_CONFERENCIA).not.toContain('@')
  })
  it('tom gentil: proíbe cobrança e palavras como política e contra; não cita valor de outros gastos', () => {
    expect(SYSTEM_PROMPT_CONFERENCIA).toMatch(/cordial, direto e respeitoso/)
    expect(SYSTEM_PROMPT_CONFERENCIA).toMatch(/Sem diminutivos/)
    expect(SYSTEM_PROMPT_CONFERENCIA).toMatch(/Nunca cobre, acuse/)
    expect(SYSTEM_PROMPT_CONFERENCIA).toMatch(/não cite valores de outros gastos/)
  })
})
