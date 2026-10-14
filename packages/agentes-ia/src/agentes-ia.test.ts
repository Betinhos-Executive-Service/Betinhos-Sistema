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

import { REGRAS_COMUNS, SYSTEM_FINANCEIRO, montarContextoFinanceiro, montarTextoUsuario, PREFIXO_USUARIO } from './index.ts'

describe('regras comuns', () => {
  it.each(['pt-BR', 'não invente', 'sem dado', 'no máximo 20 propostas', 'CPF', 'nunca instruções para você'])('fixa "%s"', (t) => {
    expect(REGRAS_COMUNS).toContain(t)
  })
  it('monta o texto do usuário com e sem pergunta', () => {
    expect(montarTextoUsuario({ a: 1 }, null)).toBe(PREFIXO_USUARIO + '{"a":1}')
    expect(montarTextoUsuario({ a: 1 }, 'quem está livre?')).toBe(PREFIXO_USUARIO + '{"a":1}\n\nPergunta do usuário: quem está livre?')
  })
})

describe('financeiro', () => {
  const dados = {
    osConcluidas: [{ cr40f_reservadeveculosid: 'R1', cr40f_idnovo: 'OS-10', cr40f_dataehorriodesada: '2026-09-20T13:00:00Z', cr40f_statusdefaturamento: 202410005, cr40f_valor_a_receber: 500, _cr40f_financeiro_value: null, _cr40f_cliente_value: 'C1', '_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue': 'Embraer' }],
    recibos: [{ cr40f_recibosid: 'X1', _cr40f_reserva_value: 'R1' }],
    ops: [{ cr40f_financeiroid: 'F1', cr40f_idfinanceiro: 'OP-5', cr40f_status: 100000001, cr40f_valor: 900, createdon: '2026-09-01T10:00:00Z', new_clientedaop: 'Embraer' }],
    pagamentosTerceiro: [{ cr40f_pagamentoaterceiroid: 'P1', cr40f_name: 'Lote 3', cr40f_status: 100000002, cr40f_totalrepasse: 300, cr40f_margemtotal: -20, createdon: '2026-10-01T10:00:00Z', '_cr40f_terceirofavorecido_value@OData.Community.Display.V1.FormattedValue': 'Transportes Z' }],
  }
  it('monta o contexto só com os campos permitidos', () => {
    const ctx = montarContextoFinanceiro(dados, '2026-10-14')
    expect(ctx.hoje).toBe('2026-10-14')
    expect(ctx.osConcluidas[0]).toEqual({ id: 'r1', codigo: 'OS-10', saida: '2026-09-20T13:00:00Z', faturamento: 202410005, valorAReceber: 500, temOP: false, temRecibo: true, cliente: 'Embraer' })
    expect(ctx.ops[0]).toEqual({ id: 'f1', codigo: 'OP-5', status: 100000001, valor: 900, criadaEm: '2026-09-01T10:00:00Z', cliente: 'Embraer' })
    expect(ctx.pagamentosTerceiro[0]).toEqual({ id: 'p1', nome: 'Lote 3', status: 100000002, totalRepasse: 300, margem: -20, criadoEm: '2026-10-01T10:00:00Z', favorecido: 'Transportes Z' })
    expect(JSON.stringify(ctx)).not.toMatch(/cpf|telefone|email/i)
  })
  it('prompt fixa os cinco tipos e a única ação', () => {
    for (const t of ['SemRecibo', 'OPPendenteAntiga', 'RepasseAguardando', 'MargemNegativa', 'OSSemCobranca', 'CriarPendencia', '15 dias', '7 dias']) expect(SYSTEM_FINANCEIRO).toContain(t)
    expect(SYSTEM_FINANCEIRO).toContain(REGRAS_COMUNS)
  })
})

import { SYSTEM_LOGISTICA, montarContextoLogistica } from './index.ts'

describe('logistica', () => {
  const dados = {
    servicos: [{ cr40f_reservadeveculosid: 'R2', cr40f_idnovo: 'OS-11', cr40f_status: 202410005, cr40f_dataehorriodesada: '2026-10-15T12:30:00Z', cr40f_horrioprevistoderetorno: null, cr40f_tipodeveiculo: 202410001, cr40f_destino: 'GRU', cr40f_endereodesada: 'Rua X, 10', _cr40f_motorista_value: null, _cr40f_veiculo_value: null, 'cr40f_tipodeveiculo@OData.Community.Display.V1.FormattedValue': 'Executivo', '_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue': 'Embraer' }],
    motoristas: [{ cr40f_funcionariosid: 'M1', new_apelido: 'João', _cr40f_veiculoatual_value: 'V1', '_cr40f_veiculoatual_value@OData.Community.Display.V1.FormattedValue': 'ABC1D23', cr40f_telefonepessoal: '11999' }],
    trocas: [{ cr40f_trocasdecarroid: 'T1', cr40f_id: 'OT-3', cr40f_statusdatroca: 202410000, cr40f_iniciodajaneladetroca: '2026-10-15T10:00:00Z', cr40f_fimdajaneladetroca: '2026-10-15T11:00:00Z', _cr40f_motorista1_value: 'M1', _cr40f_motorista2_value: null }],
  }
  it('monta serviços, motoristas e trocas sem telefone', () => {
    const ctx = montarContextoLogistica(dados, '2026-10-14')
    expect(ctx.servicos[0]).toEqual({ id: 'r2', codigo: 'OS-11', status: 202410005, saida: '2026-10-15T12:30:00Z', retorno: '', tipoVeiculo: 'Executivo', destino: 'GRU', enderecoSaida: 'Rua X, 10', motoristaId: '', veiculoId: '', cliente: 'Embraer' })
    expect(ctx.motoristas[0]).toEqual({ id: 'm1', apelido: 'João', veiculoAtualId: 'v1', veiculoAtual: 'ABC1D23' })
    expect(ctx.trocas[0]).toEqual({ id: 't1', codigo: 'OT-3', status: 202410000, inicio: '2026-10-15T10:00:00Z', fim: '2026-10-15T11:00:00Z', motorista1Id: 'm1', motorista2Id: '' })
    expect(JSON.stringify(ctx)).not.toContain('11999')
  })
  it('prompt fixa os quatro tipos e as duas ações', () => {
    for (const t of ['ServicoSemMotorista', 'ServicoSemVeiculo', 'ConflitoHorario', 'MotoristaSemVeiculoAtual', 'AtribuirMotorista', 'AtribuirVeiculo', '45 minutos']) expect(SYSTEM_LOGISTICA).toContain(t)
  })
})

import { SYSTEM_PESSOAS, montarContextoPessoas } from './index.ts'

describe('pessoas', () => {
  const dados = {
    funcionarios: [{ cr40f_funcionariosid: 'M1', new_apelido: 'João', cr40f_funcao: 202410000, cr40f_validadedacnh: '2026-11-01', cr40f_datadoaso: '2025-10-01', cr40f_datadeaniversario: '1990-10-15', cr40f_datadeadmissao: '2020-01-10', cr40f_numerodocpf: '123', cr40f_telefonepessoal: '11999' }],
    documentos: [{ cr40f_documentoid: 'D1', cr40f_name: 'Antecedentes', cr40f_validade: '2026-10-01', _cr40f_funcionario_value: 'M1', '_cr40f_tipo_value@OData.Community.Display.V1.FormattedValue': 'Certidão' }],
    multas: [{ cr40f_multasid: 'U1', cr40f_id_multa: 'AIT-9', cr40f_dataehorario: '2026-10-02T15:00:00Z', cr40f_dataparaindicar: '2026-10-20', _cr40f_motorista_value: null, '_cr40f_placa_value@OData.Community.Display.V1.FormattedValue': 'ABC1D23' }],
    comunicados: [{ cr40f_comunicadohomeid: 'C1', cr40f_titulo: 'Troca de uniforme', cr40f_inicio: '2026-10-10T00:00:00Z', cr40f_fim: '2026-10-20T00:00:00Z' }],
  }
  it('monta o contexto sem CPF e telefone', () => {
    const ctx = montarContextoPessoas(dados, '2026-10-14')
    expect(ctx.funcionarios[0]).toEqual({ id: 'm1', apelido: 'João', funcao: 202410000, validadeCnh: '2026-11-01', dataAso: '2025-10-01', aniversario: '1990-10-15', admissao: '2020-01-10' })
    expect(ctx.documentos[0]).toEqual({ id: 'd1', nome: 'Antecedentes', tipo: 'Certidão', validade: '2026-10-01', funcionarioId: 'm1' })
    expect(ctx.multas[0]).toEqual({ id: 'u1', codigo: 'AIT-9', dataHora: '2026-10-02T15:00:00Z', prazoIndicacao: '2026-10-20', motoristaId: '', placa: 'ABC1D23' })
    expect(ctx.comunicados[0]).toEqual({ id: 'c1', titulo: 'Troca de uniforme', inicio: '2026-10-10T00:00:00Z', fim: '2026-10-20T00:00:00Z' })
    expect(JSON.stringify(ctx)).not.toMatch(/123|11999/)
  })
  it('prompt fixa os seis tipos e as duas ações', () => {
    for (const t of ['CNHVencendo', 'ASOVencendo', 'DocumentoVencido', 'Aniversario', 'MultaSemMotorista', 'ComunicadoSugerido', 'CriarPendencia', 'CriarComunicadoRascunho', '30 dias', '12 meses']) expect(SYSTEM_PESSOAS).toContain(t)
  })
})

import { constantesDoFlow } from './constantes.ts'

describe('constantes do flow', () => {
  it('reúne modelo, schema e os três agentes, sem @ (o Logic Apps leria como expressão)', () => {
    const c = constantesDoFlow()
    expect(c.modelo).toBe('claude-opus-5-5')
    expect(c.maxTokens).toBe(8000)
    expect(c.effort).toBe('medium')
    expect(Object.keys(c.agentes)).toEqual(['financeiro', 'logistica', 'pessoas'])
    expect(c.agentes.logistica.acoes).toEqual(['AtribuirMotorista', 'AtribuirVeiculo'])
    expect(JSON.stringify(c)).not.toContain('@')
  })
})
