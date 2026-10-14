import { describe, expect, it } from 'vitest'
import { ACOES_POR_AGENTE, RESPOSTA_SCHEMA, TIPOS_POR_AGENTE, analisarMensagem } from './index.ts'

const msg = (corpo: unknown, stop = 'end_turn') => ({ stop_reason: stop, model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(corpo) }] })
const proposta = { tipo: 'SemRecibo', titulo: 'OS 1234 sem recibo', justificativa: 'Concluída há 12 dias.', prioridade: 'alta', registroAlvo: { entidade: 'cr40f_reservadeveculos', id: '11111111-1111-1111-1111-111111111111' }, acao: { tipo: 'CriarPendencia', campos: { titulo: 'Emitir recibo da OS 1234' } } }
const boa = { resumo: 'Uma OS sem recibo.', propostas: [proposta] }

describe('schema', () => {
  it('exige resumo e propostas, sem campos extras', () => {
    expect(RESPOSTA_SCHEMA.required).toEqual(['resumo', 'propostas'])
    expect(RESPOSTA_SCHEMA.additionalProperties).toBe(false)
    expect(RESPOSTA_SCHEMA.properties.propostas.items.required).toEqual(['tipo', 'titulo', 'justificativa', 'prioridade', 'registroAlvo', 'acao'])
  })
  it('lista todos os tipos e ações no enum', () => {
    const tipos = Object.values(TIPOS_POR_AGENTE).flat()
    expect(RESPOSTA_SCHEMA.properties.propostas.items.properties.tipo.enum).toEqual(tipos)
    expect(tipos).toHaveLength(15)
    expect([...new Set(Object.values(ACOES_POR_AGENTE).flat())]).toEqual(['CriarPendencia', 'AtribuirMotorista', 'AtribuirVeiculo', 'CriarComunicadoRascunho'])
  })
})

describe('analisarMensagem', () => {
  it('aceita resposta válida do agente certo', () => {
    const r = analisarMensagem(msg(boa), 'financeiro')
    expect(r).toEqual({ ok: true, resposta: boa })
  })
  it('rejeita stop_reason diferente de end_turn', () => {
    expect(analisarMensagem(msg(boa, 'max_tokens'), 'financeiro')).toEqual({ ok: false, erro: 'Resposta incompleta (stop_reason: max_tokens).' })
  })
  it('rejeita JSON inválido e não-objeto', () => {
    expect(analisarMensagem({ stop_reason: 'end_turn', model: 'x', content: [{ type: 'text', text: '{' }] }, 'financeiro')).toEqual({ ok: false, erro: 'Resposta não é JSON válido.' })
    expect(analisarMensagem(msg([1]), 'financeiro')).toEqual({ ok: false, erro: 'Resposta não é um objeto JSON.' })
  })
  it('rejeita tipo de outro agente', () => {
    expect(analisarMensagem(msg(boa), 'logistica')).toEqual({ ok: false, erro: 'Tipo de proposta fora do agente logistica: SemRecibo.' })
  })
  it('rejeita ação fora do agente e aceita acao null', () => {
    const errada = { ...boa, propostas: [{ ...proposta, acao: { tipo: 'AtribuirMotorista', campos: {} } }] }
    expect(analisarMensagem(msg(errada), 'financeiro')).toEqual({ ok: false, erro: 'Ação fora do agente financeiro: AtribuirMotorista.' })
    const semAcao = { ...boa, propostas: [{ ...proposta, acao: null }] }
    expect(analisarMensagem(msg(semAcao), 'financeiro').ok).toBe(true)
  })
  it('rejeita mais de 20 propostas e prioridade inválida', () => {
    const muitas = { ...boa, propostas: Array.from({ length: 21 }, () => proposta) }
    expect(analisarMensagem(msg(muitas), 'financeiro')).toEqual({ ok: false, erro: 'Mais de 20 propostas (21).' })
    const prio = { ...boa, propostas: [{ ...proposta, prioridade: 'urgente' }] }
    expect(analisarMensagem(msg(prio), 'financeiro')).toEqual({ ok: false, erro: 'Prioridade inválida: urgente.' })
  })
  it('rejeita registroAlvo sem GUID', () => {
    const alvo = { ...boa, propostas: [{ ...proposta, registroAlvo: { entidade: 'cr40f_reservadeveculos', id: 'abc' } }] }
    expect(analisarMensagem(msg(alvo), 'financeiro')).toEqual({ ok: false, erro: 'registroAlvo.id não é GUID: abc.' })
  })
})
