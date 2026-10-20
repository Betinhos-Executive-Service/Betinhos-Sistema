import { describe, expect, it } from 'vitest'
import { COLISAO, MANUT, MULTA, PROPRIO, VEICULO } from '../data/schema'
import type { Baseline, Colisao, ItemPlano, Manutencao, Multa, Veiculo } from '../data/types'
import { buildPendencias } from './pendencias'

const today = '2026-10-02'
const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: `Manutenção ${id}`, status: MANUT.SOLICITADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: null, solicitante: null, criadoEm: '2026-09-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })
const multa = (id: string, extra: Partial<Multa>): Multa => ({ id, titulo: `Multa ${id}`, status: MULTA.NOTIFICAR, dataHora: null, local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: null, motorista: null, infracaoId: null, criadoEm: '2026-09-01T12:00:00Z', ...extra })
const colisao = (id: string, status: number): Colisao => ({ id, titulo: `Colisão ${id}`, status, tipo: null, dataHora: null, local: null, descricao: null, houveTerceiro: false, veiculo: null, motorista: null, criadoEm: '2026-09-01T12:00:00Z' })
const veic = (id: string, placa: string, hodometro: number | null): Veiculo => ({ id, placa, marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: PROPRIO, motorista: null, hodometro, hodometroEm: null })
const item = (id: string, extra: Partial<ItemPlano>): ItemPlano => ({ id, nome: `Item ${id}`, servico: 100, intervaloKm: 10000, intervaloMeses: null, avisoKm: 1000, avisoDias: 30, ativo: true, ...extra })
const base = (veiculoId: string, itemId: string, km: number | null, data: string | null = null): Baseline => ({ id: `${veiculoId}-${itemId}`, veiculo: { id: veiculoId, label: veiculoId }, item: { id: itemId, label: itemId }, km, data })
const build = (parts: { manutencoes?: Manutencao[]; multas?: Multa[]; colisoes?: Colisao[]; veiculos?: Veiculo[]; planoPreventivo?: ItemPlano[]; baselines?: Baseline[] }) => buildPendencias({ manutencoes: [], multas: [], colisoes: [], veiculos: [], planoPreventivo: [], baselines: [], ...parts }, today)

describe('buildPendencias', () => {
  it('ordena aprovações por grau, do mais urgente para o menos', () => {
    const result = build({ manutencoes: [manut('a', { grau: 1 }), manut('b', { grau: 4, criadoEm: '2026-10-01T12:00:00Z' }), manut('c', { grau: 3, criadoEm: '2026-10-01T12:00:00Z' })] })
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

  describe('preventiva', () => {
    const veiculos = [veic('v1', 'AAA1A11', 19500), veic('v2', 'BBB2B22', 14000)]
    const planoPreventivo = [item('oleo', { nome: 'Troca de óleo' })]

    it('vencida e a vencer entram entre aprovar e programar, vencida primeiro; em dia não gera', () => {
      const result = build({
        veiculos: [...veiculos, veic('v3', 'CCC3C33', 100)],
        planoPreventivo,
        baselines: [base('v1', 'oleo', 9000), base('v2', 'oleo', 4500), base('v3', 'oleo', 0)],
        manutencoes: [manut('ap', { grau: 1 }), manut('sd', { status: MANUT.APROVADO })],
      })
      expect(result.map((p) => [p.tipo, p.id])).toEqual([['aprovar', 'ap'], ['preventiva', 'v1:oleo'], ['preventiva', 'v2:oleo'], ['programar', 'sd']])
    })

    it('preenche id composto, titulo, veiculoId, faltamKm e peso; prazo e dias nulos quando só há km', () => {
      const [vencida, aVencer] = build({ veiculos, planoPreventivo, baselines: [base('v1', 'oleo', 9000), base('v2', 'oleo', 4500)] })
      expect(vencida).toMatchObject({ tipo: 'preventiva', kind: 'preventiva', id: 'v1:oleo', titulo: 'Troca de óleo · AAA1A11', veiculo: { id: 'v1', label: 'AAA1A11' }, veiculoId: 'v1', pessoa: null, prazo: null, dias: null, faltamKm: -500, peso: -1500 })
      expect(aVencer).toMatchObject({ id: 'v2:oleo', veiculoId: 'v2', faltamKm: 500, peso: 500 })
    })

    it('usa data e dias quando o item tem intervalo em meses', () => {
      const [p] = build({ veiculos: [veic('v1', 'AAA1A11', null)], planoPreventivo: [item('rev', { nome: 'Revisão', intervaloKm: null, intervaloMeses: 12 })], baselines: [base('v1', 'rev', null, '2025-10-10')] })
      expect(p).toMatchObject({ id: 'v1:rev', prazo: '2026-10-10', dias: 8, faltamKm: null, peso: 8 })
    })

    it('não gera pendência quando já há manutenção em andamento do serviço', () => {
      const result = build({ veiculos: [veic('v1', 'AAA1A11', 19500)], planoPreventivo, baselines: [base('v1', 'oleo', 9000)], manutencoes: [manut('m', { status: MANUT.PROGRAMADO, servicos: [100], veiculo: { id: 'v1', label: 'AAA1A11' }, agendarPara: '2026-12-01' })] })
      expect(result).toEqual([])
    })

    const ambos = [item('oleo', { nome: 'Troca de óleo', intervaloKm: 10000, intervaloMeses: 12 })]

    it('vencida por km com data futura: estado vencido, critério km e peso pelo km negativo', () => {
      const [p] = build({ veiculos: [veic('v1', 'AAA1A11', 20000)], planoPreventivo: ambos, baselines: [base('v1', 'oleo', 9000, '2026-06-01')] })
      expect(p).toMatchObject({ estado: 'vencido', criterio: 'km', faltamKm: -1000, prazo: '2027-06-01', peso: -2000 })
      expect(p.dias).toBeGreaterThan(0)
    })

    it('vencida por data com km positivo: critério data e peso negativo pelos dias', () => {
      const [p] = build({ veiculos: [veic('v1', 'AAA1A11', 20000)], planoPreventivo: ambos, baselines: [base('v1', 'oleo', 15000, '2025-09-01')] })
      expect(p).toMatchObject({ estado: 'vencido', criterio: 'data', faltamKm: 5000, dias: -31, peso: -1031 })
    })

    it('a vencer: critério da regra com menos folga e peso pelo menor valor', () => {
      const [p] = build({ veiculos: [veic('v1', 'AAA1A11', 18200)], planoPreventivo: ambos, baselines: [base('v1', 'oleo', 9000, '2026-06-01')] })
      expect(p).toMatchObject({ estado: 'a_vencer', criterio: 'km', faltamKm: 800 })
      expect(p.peso).toBe(Math.min(800, p.dias as number))
    })

    it('demais pendências levam veiculoId e faltamKm nulo', () => {
      const [p] = build({ manutencoes: [manut('a', { veiculo: { id: 'v9', label: 'X' } })], colisoes: [colisao('c', COLISAO.ENVIADO)] })
      expect(p).toMatchObject({ veiculoId: 'v9', faltamKm: null, estado: null, criterio: null })
      expect(build({ colisoes: [colisao('c', COLISAO.ENVIADO)] })[0]).toMatchObject({ veiculoId: null, faltamKm: null })
    })
  })
})
