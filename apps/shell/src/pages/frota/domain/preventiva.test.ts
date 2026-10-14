import { describe, expect, it } from 'vitest'
import { MANUT, PROPRIO, VEICULO } from '../data/schema'
import type { Baseline, ItemPlano } from '../data/types'
import { calcularPreventivas, kmAtualDe, preventivasDoVeiculo, resumoPreventivas, type EntradaPreventiva, type ManutencaoPrev, type VeiculoPrev } from './preventiva'

const today = '2026-10-14'
const veic = (id: string, extra: Partial<VeiculoPrev> = {}): VeiculoPrev => ({ id, placa: id.toUpperCase(), status: VEICULO.ATIVO, categoria: PROPRIO, hodometro: null, hodometroEm: null, ...extra })
const manut = (id: string, extra: Partial<ManutencaoPrev> = {}): ManutencaoPrev => ({ id, status: MANUT.REALIZADO, dataManutencao: null, criadoEm: '2026-01-01T12:00:00Z', km: null, veiculo: null, servicos: [], ...extra })
const item = (id: string, extra: Partial<ItemPlano> = {}): ItemPlano => ({ id, nome: `Item ${id}`, servico: 1, intervaloKm: 10000, intervaloMeses: 6, avisoKm: 1000, avisoDias: 30, ativo: true, ...extra })
const ref = (id: string) => ({ id, label: id.toUpperCase() })
const base = (veiculoId: string, itemId: string, extra: Partial<Baseline> = {}): Baseline => ({ id: `b-${veiculoId}-${itemId}`, veiculo: ref(veiculoId), item: ref(itemId), km: null, data: null, ...extra })
const entrada = (parts: Partial<EntradaPreventiva>): EntradaPreventiva => ({ veiculos: [], manutencoes: [], itens: [item('oleo')], baselines: [], ...parts })

describe('preventiva', () => {
  it('última execução vem da manutenção realizada mais recente que contém o serviço', () => {
    const result = calcularPreventivas(entrada({
      veiculos: [veic('a', { hodometro: 165000 })],
      manutencoes: [
        manut('jun', { veiculo: ref('a'), servicos: [1], dataManutencao: '2026-06-10', km: 150000 }),
        manut('set', { veiculo: ref('a'), servicos: [1, 2], dataManutencao: '2026-09-05', km: 160000 }),
        manut('outra', { veiculo: ref('a'), servicos: [2], dataManutencao: '2026-10-01', km: 164000 }),
        manut('solicitada', { veiculo: ref('a'), status: MANUT.SOLICITADO, servicos: [3], dataManutencao: '2026-10-10' }),
      ],
    }), today)
    expect(result).toEqual([expect.objectContaining({ ultima: { km: 160000, data: '2026-09-05', origem: 'manutencao', manutencaoId: 'set' }, kmProxima: 170000, dataProxima: '2027-03-05', faltamKm: 5000, estado: 'em_dia' })])
  })

  it('usa o hodômetro Infleet e marca estimado quando só há km de manutenção', () => {
    expect(kmAtualDe(veic('a', { hodometro: 175233, hodometroEm: '2026-10-13T10:00:00Z' }), [manut('m', { veiculo: ref('a'), km: 180000 })])).toEqual({ km: 175233, estimado: false })
    const manutencoes = [manut('m1', { veiculo: ref('a'), km: 50000 }), manut('m2', { veiculo: ref('a'), km: 61000 }), manut('outro', { veiculo: ref('b'), km: 90000 })]
    expect(kmAtualDe(veic('a'), manutencoes)).toEqual({ km: 61000, estimado: true })
    expect(kmAtualDe(veic('c'), manutencoes)).toEqual({ km: null, estimado: false })
  })

  it('vencido por km (171000: faltam -1000 km e 48 dias), a vencer por km (169500) e por data (18 dias), em dia (165000) e vencido por data (próxima em 01/10)', () => {
    const calc = (hodometro: number, data: string) => calcularPreventivas(entrada({
      veiculos: [veic('a', { hodometro })],
      manutencoes: [manut('m', { veiculo: ref('a'), servicos: [1], dataManutencao: data, km: 160000 })],
    }), today)[0]
    expect(calc(171000, '2026-06-01')).toEqual(expect.objectContaining({ estado: 'vencido', kmAtual: 171000, kmEstimado: false, kmProxima: 170000, dataProxima: '2026-12-01', faltamKm: -1000, faltamDias: 48 }))
    expect(calc(169500, '2026-06-01')).toEqual(expect.objectContaining({ estado: 'a_vencer', faltamKm: 500, faltamDias: 48 }))
    expect(calc(161000, '2026-05-01')).toEqual(expect.objectContaining({ estado: 'a_vencer', dataProxima: '2026-11-01', faltamKm: 9000, faltamDias: 18 }))
    expect(calc(165000, '2026-06-01')).toEqual(expect.objectContaining({ estado: 'em_dia', faltamKm: 5000, faltamDias: 48 }))
    expect(calc(161000, '2026-04-01')).toEqual(expect.objectContaining({ estado: 'vencido', dataProxima: '2026-10-01', faltamKm: 9000, faltamDias: -13 }))
  })

  it('sem manutenção usa a baseline; sem baseline fica sem_base', () => {
    const result = calcularPreventivas(entrada({
      veiculos: [veic('a', { hodometro: 120000 }), veic('b', { hodometro: 80000 }), veic('c', { hodometro: 90000 })],
      baselines: [base('a', 'oleo', { km: 112000, data: '2026-08-01' }), base('c', 'oleo')],
    }), today)
    expect(result).toEqual([
      expect.objectContaining({ veiculo: ref('a'), estado: 'em_dia', ultima: { km: 112000, data: '2026-08-01', origem: 'baseline', manutencaoId: null }, kmProxima: 122000, dataProxima: '2027-02-01', faltamKm: 2000, faltamDias: 110 }),
      expect.objectContaining({ veiculo: ref('b'), estado: 'sem_base', ultima: null, kmProxima: null, dataProxima: null, faltamKm: null, faltamDias: null }),
      expect.objectContaining({ veiculo: ref('c'), estado: 'sem_base', ultima: null }),
    ])
  })

  it('item só por tempo funciona sem km; item só por km sem km atual fica sem_base', () => {
    const result = calcularPreventivas(entrada({
      veiculos: [veic('a')],
      itens: [item('tempo', { servico: 1, intervaloKm: null, intervaloMeses: 12 }), item('km', { servico: 2, intervaloMeses: null })],
      manutencoes: [manut('m', { veiculo: ref('a'), servicos: [1, 2], dataManutencao: '2026-01-20' })],
    }), today)
    expect(result).toEqual([
      expect.objectContaining({ item: expect.objectContaining({ id: 'tempo' }), estado: 'em_dia', kmAtual: null, kmProxima: null, dataProxima: '2027-01-20', faltamKm: null, faltamDias: 98 }),
      expect.objectContaining({ item: expect.objectContaining({ id: 'km' }), estado: 'sem_base', kmProxima: null, dataProxima: null, faltamKm: null, faltamDias: null, ultima: expect.objectContaining({ manutencaoId: 'm' }) }),
    ])
  })

  it('ignora veículos vendidos, terceiros e sem status e itens inativos', () => {
    const e = entrada({
      veiculos: [veic('ok'), veic('vendido', { status: VEICULO.VENDIDO }), veic('terceiro', { categoria: 100000001 }), veic('semstatus', { status: null })],
      itens: [item('oleo'), item('inativo', { ativo: false })],
    })
    expect(calcularPreventivas(e, today).map((p) => [p.veiculo.id, p.item.id])).toEqual([['ok', 'oleo']])
    expect(preventivasDoVeiculo(e, 'vendido', today).map((p) => [p.veiculo.id, p.item.id, p.estado])).toEqual([['vendido', 'oleo', 'sem_base']])
    expect(preventivasDoVeiculo({ ...e, itens: [] }, 'vendido', today)).toEqual([])
  })

  it('emAndamento quando há manutenção solicitada/aprovada/programada com o serviço', () => {
    const result = calcularPreventivas(entrada({
      veiculos: [veic('a'), veic('b'), veic('c'), veic('d'), veic('e')],
      manutencoes: [
        manut('sa', { veiculo: ref('a'), status: MANUT.SOLICITADO, servicos: [1] }),
        manut('ap', { veiculo: ref('b'), status: MANUT.APROVADO, servicos: [1] }),
        manut('pr', { veiculo: ref('c'), status: MANUT.PROGRAMADO, servicos: [1] }),
        manut('outroServico', { veiculo: ref('d'), status: MANUT.SOLICITADO, servicos: [2] }),
        manut('cancelada', { veiculo: ref('e'), status: MANUT.CANCELADO, servicos: [1] }),
      ],
    }), today)
    expect(result.map((p) => [p.veiculo.id, p.emAndamento])).toEqual([['a', true], ['b', true], ['c', true], ['d', false], ['e', false]])
  })

  it('ordena vencidos, depois a vencer por dias, e resumo conta só os que não estão em andamento', () => {
    const m = (v: string, data: string) => manut(`m-${v}`, { veiculo: ref(v), servicos: [1], dataManutencao: data, km: 160000 })
    const lista = calcularPreventivas(entrada({
      veiculos: [veic('semb'), veic('emdia', { hodometro: 161000 }), veic('av18', { hodometro: 161000 }), veic('av5', { hodometro: 161000 }), veic('venc', { hodometro: 171000 }), veic('vencand', { hodometro: 161000 })],
      manutencoes: [
        m('emdia', '2026-08-01'), m('av18', '2026-05-01'), m('av5', '2026-04-19'), m('venc', '2026-06-01'), m('vencand', '2026-03-01'),
        manut('aberta', { veiculo: ref('vencand'), status: MANUT.APROVADO, servicos: [1] }),
      ],
    }), today)
    expect(lista.map((p) => [p.veiculo.id, p.estado, p.faltamDias, p.emAndamento])).toEqual([
      ['vencand', 'vencido', -43, true], ['venc', 'vencido', 48, false], ['av5', 'a_vencer', 5, false], ['av18', 'a_vencer', 18, false], ['emdia', 'em_dia', 110, false], ['semb', 'sem_base', null, false],
    ])
    expect(resumoPreventivas(lista)).toEqual({ vencidas: 1, aVencer: 2 })
  })
})
