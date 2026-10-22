import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import type { Infracao, Manutencao, Multa } from '../data/types'
import { contarPor, custoPor, custoPorMes, custoVeiculo, multasPorMotorista, tempoMedioDias, ultimos12Meses } from './indicadores'

const periodo = { de: '2026-08-01', ate: '2026-10-02' }
const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: id, status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v1', label: 'ABC1D23' }, solicitante: null, criadoEm: '2026-08-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })
const multa = (id: string, extra: Partial<Multa>): Multa => ({ id, titulo: id, status: 202410000, dataHora: '2026-09-10T12:00:00Z', local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: null, motorista: { id: 'f1', label: 'Ana' }, infracaoId: null, criadoEm: '2026-09-11T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null, ...extra })
const infracoes: Infracao[] = [{ id: 'i1', codigo: '7455', descricao: null, gravidade: 1, pontos: 4, valor: 130.16 }]

const manutencoes = [
  manut('a', { dataManutencao: '2026-08-20T12:00:00Z', valor: 100 }),
  manut('b', { dataManutencao: '2026-10-01T12:00:00Z', valor: 250, veiculo: { id: 'v2', label: 'EFG4H56' }, tipo: 2 }),
  manut('semValor', { dataManutencao: '2026-10-01T12:00:00Z' }),
  manut('fora', { dataManutencao: '2026-07-01T12:00:00Z', valor: 999 }),
  manut('aberta', { status: MANUT.APROVADO, valor: 500 }),
]

describe('indicadores', () => {
  it('calcula o período padrão de 12 meses', () => {
    expect(ultimos12Meses('2026-10-02')).toEqual({ de: '2025-10-02', ate: '2026-10-02' })
  })

  it('soma custo por mês incluindo meses sem gasto e conta os sem valor à parte', () => {
    expect(custoPorMes(manutencoes, periodo)).toEqual([
      { chave: '2026-08', total: 100, qtd: 1, semValor: 0 },
      { chave: '2026-09', total: 0, qtd: 0, semValor: 0 },
      { chave: '2026-10', total: 250, qtd: 2, semValor: 1 },
    ])
  })

  it('agrupa custo por veículo, do maior para o menor', () => {
    expect(custoPor(manutencoes, periodo, (item) => item.veiculo?.label ?? 'Sem veículo')).toEqual([
      { chave: 'EFG4H56', total: 250, qtd: 1, semValor: 0 },
      { chave: 'ABC1D23', total: 100, qtd: 2, semValor: 1 },
    ])
  })

  it('calcula o custo de um veículo', () => {
    expect(custoVeiculo(manutencoes, 'v1', periodo)).toEqual({ chave: 'v1', total: 100, qtd: 2, semValor: 1 })
  })

  it('calcula o tempo médio entre solicitação e realização', () => {
    expect(tempoMedioDias(manutencoes, periodo)).toBe(38)
    expect(tempoMedioDias([], periodo)).toBeNull()
  })

  it('soma valor e pontos das multas por motorista, separando as sem código de infração', () => {
    const multas = [multa('1', { infracaoId: 'i1' }), multa('2', { infracaoId: 'i1' }), multa('3', {}), multa('fora', { dataHora: '2026-01-01T12:00:00Z', infracaoId: 'i1' })]
    expect(multasPorMotorista(multas, infracoes, periodo)).toEqual([{ motorista: 'Ana', qtd: 3, valor: 260.32, pontos: 8, semValor: 1 }])
  })

  it('conta por chave', () => {
    expect(contarPor(['a', 'b', 'a'], (item) => item)).toEqual([{ chave: 'a', qtd: 2 }, { chave: 'b', qtd: 1 }])
  })
})
