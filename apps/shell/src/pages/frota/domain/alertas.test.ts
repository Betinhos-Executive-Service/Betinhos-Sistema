import { describe, expect, it } from 'vitest'
import { MANUT, PROPRIO, VEICULO } from '../data/schema'
import type { Manutencao, Veiculo } from '../data/types'
import { custoForaDaCurva, hodometrosAtrasados, prioridadeParada, reincidencias } from './alertas'
import { buildPendencias } from './pendencias'

const today = '2026-10-20'
const A = { id: 'v1', label: 'ABC1D23' }
const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: `M ${id}`, status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: A, solicitante: null, criadoEm: '2026-10-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })
const veic = (id: string, extra: Partial<Veiculo> = {}): Veiculo => ({ id, placa: id.toUpperCase(), marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: PROPRIO, motorista: null, hodometro: null, hodometroEm: null, ...extra })

describe('reincidencias', () => {
  it('3 vezes o mesmo serviço em 120 dias dispara, com custo e ocorrências da mais recente para a mais antiga', () => {
    const r = reincidencias([
      manut('a', { servicos: [7], dataManutencao: '2026-07-01', valor: 100 }),
      manut('b', { servicos: [7], dataManutencao: '2026-09-01', valor: 200 }),
      manut('c', { servicos: [7, 8], dataManutencao: '2026-10-10', valor: 300 }),
    ], today)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ servico: 7, vezes: 3, janelaDias: 120, custo: 600 })
    expect(r[0].ocorrencias.map((o) => o.id)).toEqual(['c', 'b', 'a'])
  })

  it('a 5ª vez em 12 meses dispara mesmo espaçada; serviço diferente, outro carro e canceladas não contam', () => {
    const datas = ['2025-11-01', '2026-01-15', '2026-03-20', '2026-05-30', '2026-09-01']
    const r = reincidencias([
      ...datas.map((d, i) => manut(`x${i}`, { servicos: [5], dataManutencao: d })),
      manut('outroServico', { servicos: [6], dataManutencao: '2026-10-01' }),
      manut('outroCarro', { servicos: [5], veiculo: { id: 'v2', label: 'v2' }, dataManutencao: '2026-10-01' }),
      manut('cancelada', { servicos: [6], status: MANUT.CANCELADO }),
    ], today)
    expect(r.map((x) => [x.veiculo.id, x.servico, x.vezes, x.janelaDias])).toEqual([['v1', 5, 5, 365]])
  })

  it('2 vezes não é reincidência', () => {
    expect(reincidencias([manut('a', { servicos: [7] }), manut('b', { servicos: [7] })], today)).toEqual([])
  })
})

describe('prioridadeParada', () => {
  it('Alta solicitada há 3 dias e Urgente aprovada sem data há 6 entram; Média e recentes não', () => {
    expect(prioridadeParada(manut('a', { grau: 3, status: MANUT.SOLICITADO, criadoEm: '2026-10-17T12:00:00Z' }), today)).toBe(3)
    expect(prioridadeParada(manut('b', { grau: 4, status: MANUT.APROVADO, criadoEm: '2026-10-14T12:00:00Z' }), today)).toBe(6)
    expect(prioridadeParada(manut('c', { grau: 2, status: MANUT.SOLICITADO, criadoEm: '2026-09-01T12:00:00Z' }), today)).toBeNull()
    expect(prioridadeParada(manut('d', { grau: 4, status: MANUT.SOLICITADO, criadoEm: '2026-10-19T12:00:00Z' }), today)).toBeNull()
    expect(prioridadeParada(manut('e', { grau: 4, status: MANUT.APROVADO, agendarPara: '2026-10-25', criadoEm: '2026-09-01T12:00:00Z' }), today)).toBeNull()
  })
})

describe('hodometrosAtrasados', () => {
  it('acima de 48 h entra; sem leitura e vendido não', () => {
    const agora = new Date('2026-10-20T12:00:00Z')
    const r = hodometrosAtrasados([
      veic('a', { hodometroEm: '2026-10-18T11:00:00Z' }),
      veic('b', { hodometroEm: '2026-10-19T12:00:00Z' }),
      veic('c'),
      veic('d', { hodometroEm: '2026-10-01T12:00:00Z', status: VEICULO.VENDIDO }),
    ], agora)
    expect(r.map((x) => [x.veiculo.id, x.horas])).toEqual([['a', 49]])
  })
})

describe('custoForaDaCurva', () => {
  const custo = (id: string, valor: number) => manut(`m-${id}`, { veiculo: { id, label: id }, valor, dataManutencao: '2026-10-01' })
  it('acima de 1,5× a mediana entra', () => {
    const r = custoForaDaCurva([veic('a'), veic('b'), veic('c'), veic('d')], [custo('a', 1000), custo('b', 1000), custo('c', 1200), custo('d', 1700)], today)
    expect(r.map((x) => [x.veiculo.id, x.custo, x.mediana])).toEqual([['d', 1700, 1100]])
  })
  it('menos de 3 veículos com custo: sem comparação', () => {
    expect(custoForaDaCurva([veic('a'), veic('b')], [custo('a', 100), custo('b', 9000)], today)).toEqual([])
  })
})

describe('buildPendencias com regras proativas', () => {
  it('prioridade parada substitui aprovar e reincidência vem logo depois', () => {
    const result = buildPendencias({
      manutencoes: [
        manut('alta', { grau: 3, status: MANUT.SOLICITADO, criadoEm: '2026-10-10T12:00:00Z' }),
        manut('baixa', { grau: 1, status: MANUT.SOLICITADO }),
        ...[1, 2, 3].map((i) => manut(`r${i}`, { servicos: [9], dataManutencao: `2026-0${6 + i}-01` })),
      ],
      multas: [], colisoes: [], veiculos: [], planoPreventivo: [], baselines: [],
    }, today, new Date('2026-10-20T12:00:00Z'))
    expect(result.map((p) => [p.tipo, p.id])).toEqual([['prioridade', 'alta'], ['reincidencia', 'reinc:v1:9'], ['aprovar', 'baixa']])
    expect(result[1].titulo).toMatch(/^3ª vez: /)
    expect(result[1].detalhe).toContain('causa raiz')
  })
})
