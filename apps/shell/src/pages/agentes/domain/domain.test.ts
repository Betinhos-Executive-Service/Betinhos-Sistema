import { describe, expect, it } from 'vitest'
import { descreverAcao, gravacaoDaAcao } from './acoes'
import { AGENTES, agentePorId } from './agentes'
import type { Proposta } from './types'
import { mapProposta } from '../data/queries'

const base: Proposta = { id: 'p1', execucaoId: 'e1', tipo: 'ServicoSemMotorista', titulo: 'OS-11 sem motorista', justificativa: 'Saída 09:30.', prioridade: 'alta', entidadeAlvo: 'cr40f_reservadeveculos', idAlvo: 'r2', acao: { tipo: 'AtribuirMotorista', campos: { motoristaId: 'm1', motoristaNome: 'João' } }, decisao: 'pendente', motivoDescarte: '', decididoPor: '', decididoEm: null }

describe('ações', () => {
  it('descreve o que Aprovar vai gravar', () => {
    expect(descreverAcao(base)).toBe('Atribuir o motorista João ao serviço OS-11 sem motorista.')
    expect(descreverAcao({ ...base, acao: null })).toBe('Só registrar a decisão; nada será gravado no registro.')
    expect(descreverAcao({ ...base, acao: { tipo: 'CriarPendencia', campos: { titulo: 'Emitir recibo', descricao: 'x' } } })).toBe('Criar a pendência "Emitir recibo" no Planner.')
  })
  it('monta a gravação por tipo de ação', () => {
    expect(gravacaoDaAcao(base)).toEqual({ kind: 'update', entity: 'cr40f_reservadeveculos', id: 'r2', data: { 'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(m1)' } })
    expect(gravacaoDaAcao({ ...base, acao: { tipo: 'AtribuirVeiculo', campos: { veiculoId: 'v1' } } })).toEqual({ kind: 'update', entity: 'cr40f_reservadeveculos', id: 'r2', data: { 'cr40f_Veiculo@odata.bind': '/cr40f_veiculoses(v1)' } })
    expect(gravacaoDaAcao({ ...base, acao: { tipo: 'CriarPendencia', campos: { titulo: 'T', descricao: 'D' } } })).toEqual({ kind: 'create', entity: 'cr40f_plannertarefa', data: { cr40f_name: 'T', cr40f_titulo: 'T', cr40f_descricao: 'D', cr40f_status: 100000000, cr40f_origem: 100000000, cr40f_prioridade: 100000002, cr40f_codigoorigem: 'agente:p1' } })
    expect(gravacaoDaAcao({ ...base, acao: { tipo: 'CriarComunicadoRascunho', campos: { titulo: 'T', conteudo: 'C' } } })).toEqual({ kind: 'create', entity: 'cr40f_comunicadohome', data: { cr40f_name: 'T', cr40f_titulo: 'T', cr40f_conteudo: 'C', cr40f_ativo: false, cr40f_prioridade: 100000000, cr40f_publico: 100000000 } })
    expect(gravacaoDaAcao({ ...base, acao: null })).toBeNull()
  })
  it('recusa ação sem o campo obrigatório', () => {
    expect(() => gravacaoDaAcao({ ...base, acao: { tipo: 'AtribuirMotorista', campos: {} } })).toThrow('Ação AtribuirMotorista sem motoristaId.')
  })
})

describe('agentes', () => {
  it('tem três agentes com rótulo e grupo', () => {
    expect(AGENTES.map((a) => a.id)).toEqual(['financeiro', 'logistica', 'pessoas'])
    expect(agentePorId('logistica')?.rodaAoAbrirAposMin).toBe(30)
    expect(agentePorId('financeiro')?.rodaAoAbrirAposMin).toBeNull()
  })
})

describe('cr40f_acao', () => {
  const linha = (acao: unknown) => mapProposta({ cr40f_agentepropostaid: 'p9', cr40f_titulo: 'X', cr40f_acao: typeof acao === 'string' ? acao : JSON.stringify(acao) })
  it('aceita o formato do flow e normaliza campos ausentes', () => {
    expect(linha({ tipo: 'CriarPendencia', campos: { titulo: 'T', descricao: null } }).acao).toEqual({ tipo: 'CriarPendencia', campos: { titulo: 'T', descricao: null } })
    expect(linha({ tipo: 'CriarPendencia' }).acao).toEqual({ tipo: 'CriarPendencia', campos: {} })
  })
  it('JSON malformado, tipo desconhecido ou campos inválidos viram ação nula sem lançar', () => {
    for (const bruto of ['{nao é json', 'null', '"texto"', { tipo: 'ApagarTudo', campos: {} }, { campos: {} }, { tipo: 'AtribuirMotorista', campos: 'x' }, { tipo: 'AtribuirMotorista', campos: [] }]) {
      const p = linha(bruto)
      expect(p.acao).toBeNull()
      expect(descreverAcao(p)).toBe('Só registrar a decisão; nada será gravado no registro.')
      expect(gravacaoDaAcao(p)).toBeNull()
    }
  })
})
