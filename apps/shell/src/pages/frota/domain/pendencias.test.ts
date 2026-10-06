import { describe, expect, it } from 'vitest'
import { COLISAO, MANUT, MULTA } from '../data/schema'
import type { Colisao, Manutencao, Multa } from '../data/types'
import { buildPendencias } from './pendencias'

const today = '2026-10-02'
const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: `Manutenção ${id}`, status: MANUT.SOLICITADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: null, solicitante: null, criadoEm: '2026-09-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })
const multa = (id: string, extra: Partial<Multa>): Multa => ({ id, titulo: `Multa ${id}`, status: MULTA.NOTIFICAR, dataHora: null, local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: null, motorista: null, infracaoId: null, criadoEm: '2026-09-01T12:00:00Z', ...extra })
const colisao = (id: string, status: number): Colisao => ({ id, titulo: `Colisão ${id}`, status, tipo: null, dataHora: null, local: null, descricao: null, houveTerceiro: false, veiculo: null, motorista: null, criadoEm: '2026-09-01T12:00:00Z' })
const build = (parts: { manutencoes?: Manutencao[]; multas?: Multa[]; colisoes?: Colisao[] }) => buildPendencias({ manutencoes: [], multas: [], colisoes: [], ...parts }, today)

describe('buildPendencias', () => {
  it('ordena aprovações por grau, do mais urgente para o menos', () => {
    const result = build({ manutencoes: [manut('a', { grau: 1 }), manut('b', { grau: 4 }), manut('c', { grau: 3 })] })
    expect(result.map((item) => [item.tipo, item.id])).toEqual([['aprovar', 'b'], ['aprovar', 'c'], ['aprovar', 'a']])
  })

  it('aponta aprovadas sem data e programadas vencidas ou em até 7 dias', () => {
    const result = build({ manutencoes: [
      manut('semData', { status: MANUT.APROVADO }),
      manut('comData', { status: MANUT.APROVADO, agendarPara: '2026-10-20' }),
      manut('vencida', { status: MANUT.PROGRAMADO, agendarPara: '2026-09-30' }),
      manut('semana', { status: MANUT.PROGRAMADO, agendarPara: '2026-10-09' }),
      manut('longe', { status: MANUT.PROGRAMADO, agendarPara: '2026-10-10' }),
    ] })
    expect(result.map((item) => [item.tipo, item.id, item.dias])).toEqual([['programar', 'semData', null], ['agendada', 'vencida', -2], ['agendada', 'semana', 7]])
  })

  it('manutenção aprovada com data vencida ou próxima entra em agendada; aprovada com data distante não aparece', () => {
    const result = build({ manutencoes: [
      manut('vencidaAprovada', { status: MANUT.APROVADO, agendarPara: '2026-09-30' }),
      manut('proximaAprovada', { status: MANUT.APROVADO, agendarPara: '2026-10-05' }),
      manut('distanteAprovada', { status: MANUT.APROVADO, agendarPara: '2026-11-01' }),
    ] })
    expect(result.map((item) => [item.tipo, item.id, item.dias])).toEqual([['agendada', 'vencidaAprovada', -2], ['agendada', 'proximaAprovada', 3]])
  })

  it('aponta multas a notificar e a indicar só enquanto abertas', () => {
    const result = build({ multas: [
      multa('n', { status: MULTA.NOTIFICAR }),
      multa('i', { status: MULTA.NOTIFICADO, dataParaIndicar: '2026-10-05' }),
      multa('jaIndicada', { status: MULTA.NOTIFICADO, dataParaIndicar: '2026-10-05', indicado: true }),
      multa('descontada', { status: MULTA.DESCONTADO, dataParaIndicar: '2026-01-01' }),
      multa('longe', { status: MULTA.NOTIFICADO, dataParaIndicar: '2026-11-01' }),
    ] })
    expect(result.map((item) => [item.tipo, item.id])).toEqual([['notificar', 'n'], ['indicar', 'i']])
  })

  it('aponta colisões enviadas ou em análise', () => {
    const result = build({ colisoes: [colisao('e', COLISAO.ENVIADO), colisao('a', COLISAO.ANALISE), colisao('r', COLISAO.RESOLVIDO)] })
    expect(result.map((item) => item.id)).toEqual(['e', 'a'])
  })
})
