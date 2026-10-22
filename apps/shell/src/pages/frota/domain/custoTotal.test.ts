import { describe, expect, it } from 'vitest'
import { MANUT, MULTA } from '../data/schema'
import type { DespesaCombustivel, Manutencao, Multa } from '../data/types'
import { custoPorMesEmpilhado, custoPorVeiculo, custoTotalVeiculo, type EntradaCusto } from './custoTotal'

const periodo = { de: '2026-08-01', ate: '2026-10-02' }
const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: id, status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: '2026-08-20T12:00:00Z', valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v1', label: 'ABC1D23' }, solicitante: null, criadoEm: '2026-08-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })
const multa = (id: string, extra: Partial<Multa>): Multa => ({ id, titulo: id, status: MULTA.NOTIFICAR, dataHora: '2026-09-10T12:00:00Z', local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'ABC1D23' }, motorista: null, infracaoId: null, criadoEm: '2026-09-11T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null, ...extra })
const desp = (id: string, extra: Partial<DespesaCombustivel>): DespesaCombustivel => ({ id, dia: '2026-09-05', valor: null, veiculo: { id: 'v1', label: 'ABC1D23' }, manutencao: null, categoria: 'combustivel', ...extra })

const entrada: EntradaCusto = {
  manutencoes: [
    manut('a', { valor: 100 }),
    manut('b', { valor: 50.55, dataManutencao: '2026-09-10T12:00:00Z' }),
    manut('c', { dataManutencao: '2026-10-01T12:00:00Z' }),
    manut('outro', { valor: 900, veiculo: { id: 'v2', label: 'EFG4H56' } }),
  ],
  multas: [multa('m1', { infracaoId: 'i1' }), multa('m2', {}), multa('m3', { status: MULTA.FINALIZADO }), multa('m4', { infracaoId: 'i1', veiculo: { id: 'v2', label: 'EFG4H56' } })],
  infracoes: [{ id: 'i1', codigo: '7455', descricao: null, gravidade: 1, pontos: 4, valor: 130.16 }],
  despesasCombustivel: [
    desp('d1', { valor: 200.1 }),
    desp('d2', { valor: 99.9, dia: '2026-08-15' }),
    desp('fora', { valor: 500, dia: '2026-07-01' }),
    desp('v2', { valor: 300, veiculo: { id: 'v2', label: 'EFG4H56' } }),
    desp('m1', { valor: 80, categoria: 'manutencao', manutencao: null }),
    desp('m2', { valor: 70, categoria: 'manutencao', manutencao: { id: 'a', label: 'a' } }),
  ],
  telemetriaKm: [{ dia: '2026-08-20', veiculoId: 'v1', km: 1000 }, { dia: '2026-09-20', veiculoId: 'v1', km: 1500 }, { dia: '2026-09-20', veiculoId: 'v2', km: 777 }, { dia: '2026-07-01', veiculoId: 'v1', km: 5000 }],
  documentos: [{ veiculoId: 'v1', dia: '2026-08-03', valor: 1200.5 }, { veiculoId: 'v1', dia: '2026-09-01', valor: null }, { veiculoId: 'v2', dia: '2026-08-03', valor: 10 }],
  indisponiveis: {},
}

describe('custoTotalVeiculo', () => {
  it('soma as quatro fontes com semValor por fonte, ignorando multa finalizada sem valor e combustível fora do período', () => {
    const r = custoTotalVeiculo(entrada, 'v1', periodo)
    expect(r.porFonte.manutencao).toEqual({ valor: 150.55, qtd: 3, semValor: 1, indisponivel: false })
    expect(r.porFonte.multas).toEqual({ valor: 130.16, qtd: 2, semValor: 1, indisponivel: false })
    expect(r.porFonte.combustivel).toEqual({ valor: 300, qtd: 2, semValor: 0, indisponivel: false })
    expect(r.porFonte.documentos).toEqual({ valor: 1200.5, qtd: 2, semValor: 1, indisponivel: false })
    expect(r.total).toBe(1781.21)
  })

  it('calcula R$/km com telemetria e devolve null sem ela', () => {
    const r = custoTotalVeiculo(entrada, 'v1', periodo)
    expect(r.kmRodado).toBe(2500)
    expect(r.custoPorKm).toBe(0.71)
    const sem = custoTotalVeiculo({ ...entrada, telemetriaKm: [] }, 'v1', periodo)
    expect(sem.kmRodado).toBeNull()
    expect(sem.custoPorKm).toBeNull()
  })

  it('fonte indisponível não soma e telemetria indisponível zera o km', () => {
    const r = custoTotalVeiculo({ ...entrada, indisponiveis: { combustivel: true, telemetria: true } }, 'v1', periodo)
    expect(r.porFonte.combustivel).toEqual({ valor: 0, qtd: 0, semValor: 0, indisponivel: true })
    expect(r.total).toBe(1481.21)
    expect(r.kmRodado).toBeNull()
    expect(r.custoPorKm).toBeNull()
  })

  it('avisa das despesas de manutenção sem vínculo com uma manutenção', () => {
    expect(custoTotalVeiculo(entrada, 'v1', periodo).despesasManutencaoSemVinculo).toBe(1)
  })
})

describe('custoPorVeiculo', () => {
  it('ordena por total decrescente e placa, apontando a maior fonte', () => {
    const veiculos = [{ id: 'v3', placa: 'AAA0A00' }, { id: 'v2', placa: 'EFG4H56' }, { id: 'v1', placa: 'ABC1D23' }]
    const r = custoPorVeiculo(entrada, veiculos, periodo)
    expect(r.map((x) => [x.placa, x.total, x.maiorFonte])).toEqual([['ABC1D23', 1781.21, 'documentos'], ['EFG4H56', 1340.16, 'manutencao'], ['AAA0A00', 0, null]])
    expect(r[0].custoPorKm).toBe(0.71)
    expect(r[1].custoPorKm).toBe(1.72)
  })
})

describe('custoPorMesEmpilhado', () => {
  it('preenche os meses vazios e soma todos os veículos por fonte', () => {
    const r = custoPorMesEmpilhado({ ...entrada, despesasCombustivel: [desp('d2', { valor: 99.9, dia: '2026-08-15' })], documentos: [] }, periodo)
    expect(r.map((m) => m.chave)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(r[0].porFonte).toEqual({ manutencao: 1000, multas: 0, combustivel: 99.9, documentos: 0 })
    expect(r[0].total).toBe(1099.9)
    expect(r[1].porFonte).toEqual({ manutencao: 50.55, multas: 260.32, combustivel: 0, documentos: 0 })
    expect(r[2]).toEqual({ chave: '2026-10', porFonte: { manutencao: 0, multas: 0, combustivel: 0, documentos: 0 }, total: 0 })
  })
})
