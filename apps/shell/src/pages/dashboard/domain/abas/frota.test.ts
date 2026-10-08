import { describe, expect, it } from 'vitest'
import { filtrarServicos } from '../base'
import type { Contexto } from '../kpis'
import { evento, reserva, telemetria, veiculo, viagem } from '../test-utils'
import type { Dados, Filtros, Reserva } from '../types'
import { calcularFrota } from './frota'

const NOW = new Date('2026-10-15T15:00:00Z')
const filtro = (p: Partial<Filtros> = {}): Filtros => ({ atalho: 'personalizado', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [], ...p })
const ctxDe = (rows: Reserva[], f: Filtros = filtro()): Contexto => ({ todas: rows, rv: filtrarServicos(rows, f), f, now: NOW })
/** Dados vazios locais (não depende de fábrica compartilhada que outras tarefas editam). */
const dadosVazios = (p: Partial<Dados> = {}): Dados => ({
  reservas: [], manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], viagens: [], eventos: [], telemetria: [],
  pagantes: [], despesas: [], categoriasDespesa: [], formasPagamento: [], indisponiveis: [], ...p,
})
/** Serviço no veículo, saída às 12h de Brasília do dia. */
const servico = (veiculoId: string, dia = '2026-10-05', p: Partial<Reserva> = {}) => reserva({ veiculoId, saidaRaw: `${dia}T15:00:00Z`, ...p })

describe('calcularFrota — KPIs cadastrais', () => {
  it('escopo: só veículos com serviço em rv; disponíveis por dispon/ativo/livre, blindados e em manutenção', () => {
    const veiculos = [
      veiculo({ id: 'v1', statusLabel: 'Disponível', blindado: true }),
      veiculo({ id: 'v2', statusLabel: 'Ativo' }),
      veiculo({ id: 'v3', statusLabel: 'Em manutenção', blindado: true }),
      veiculo({ id: 'v4', statusLabel: 'Livre' }),
      veiculo({ id: 'v5', statusLabel: 'Livre' }),
    ]
    const rows = [
      servico('v1'), servico('v2'), servico('v3'),
      servico('v5', '2026-10-05', { categoriaItem: 100000001 }),
      servico('v5', '2026-09-20'),
    ]
    const fr = calcularFrota(ctxDe(rows), dadosVazios({ veiculos }))
    expect(fr.kpis).toMatchObject({ total: 3, disponiveis: 2, blindados: 2, emManutencao: 1, indisponivel: false })
  })

  it('veículos indisponíveis: KPIs cadastrais marcados e uso vazio', () => {
    const fr = calcularFrota(ctxDe([servico('v1')]), dadosVazios({ veiculos: [], indisponiveis: ['veiculos'] }))
    expect(fr.kpis).toMatchObject({ total: 0, indisponivel: true, usoMedioPropria: null })
    expect(fr.usoMensal).toEqual([])
  })
})

describe('calcularFrota — telemetria Infleet', () => {
  const veiculos = [veiculo({ id: 'v1', statusLabel: 'Ativo' }), veiculo({ id: 'v2', statusLabel: 'Ativo' })]
  const rows = [servico('v1'), servico('v2')]

  it('km, velocidade média ponderada (peso mínimo 1), máxima, excessos, consumo e ocioso; fora do período e do escopo saem', () => {
    const dados: Dados = dadosVazios({
      veiculos,
      telemetria: [
        telemetria({ dia: '2026-10-02', veiculoId: 'v1', distanciaKm: 100, velocidadeMedia: 60, velocidadeMaxima: 110, excessos: 2, ociosoMin: 30 }),
        telemetria({ dia: '2026-10-03', veiculoId: 'v2', distanciaKm: 0.5, velocidadeMedia: 20, velocidadeMaxima: 40, excessos: 1, ociosoMin: 15 }),
        telemetria({ dia: '2026-09-30', veiculoId: 'v1', distanciaKm: 500, velocidadeMaxima: 180, excessos: 9, ociosoMin: 99 }),
        telemetria({ dia: '2026-10-03', veiculoId: 'v9', distanciaKm: 500, velocidadeMaxima: 180, excessos: 9, ociosoMin: 99 }),
      ],
      viagens: [
        viagem({ dia: '2026-10-02', veiculoId: 'v1', distancia: 120, combustivelL: 10 }),
        viagem({ dia: '2026-10-03', veiculoId: 'v2', distancia: 30, combustivelL: 5 }),
        viagem({ dia: '2026-10-03', veiculoId: 'v9', distancia: 1000, combustivelL: 1 }),
      ],
    })
    const fr = calcularFrota(ctxDe(rows), dados)
    expect(fr.infleetIndisponivel).toBe(false)
    expect(fr.telemetria).not.toBeNull()
    const t = fr.telemetria!
    expect(t.km).toBeCloseTo(100.5)
    expect(t.velocidadeMedia).toBeCloseTo((60 * 100 + 20 * 1) / 101)
    expect(t.velocidadeMaxima).toBe(110)
    expect(t.excessos).toBe(3)
    expect(t.consumoKmL).toBeCloseTo(10)
    expect(t.ociosoMin).toBe(45)
  })

  it('consumo fora da faixa de 2 a 30 km/l ou sem litros vira null', () => {
    const alto = calcularFrota(ctxDe(rows), dadosVazios({ veiculos, viagens: [viagem({ dia: '2026-10-02', veiculoId: 'v1', distancia: 310, combustivelL: 10 })] }))
    expect(alto.telemetria!.consumoKmL).toBeNull()
    const semLitros = calcularFrota(ctxDe(rows), dadosVazios({ veiculos, viagens: [viagem({ dia: '2026-10-02', veiculoId: 'v1', distancia: 50 })] }))
    expect(semLitros.telemetria!.consumoKmL).toBeNull()
    const vazio = calcularFrota(ctxDe(rows), dadosVazios({ veiculos }))
    expect(vazio.telemetria).toEqual({ km: 0, velocidadeMedia: 0, velocidadeMaxima: 0, excessos: 0, consumoKmL: null, ociosoMin: 0 })
  })

  it('km por dia: soma por dia, em ordem', () => {
    const fr = calcularFrota(ctxDe(rows), dadosVazios({
      veiculos,
      telemetria: [
        telemetria({ dia: '2026-10-04', veiculoId: 'v1', distanciaKm: 40 }),
        telemetria({ dia: '2026-10-02', veiculoId: 'v1', distanciaKm: 10 }),
        telemetria({ dia: '2026-10-02', veiculoId: 'v2', distanciaKm: 5 }),
      ],
    }))
    expect(fr.kmPorDia).toEqual([{ dia: '2026-10-02', km: 15 }, { dia: '2026-10-04', km: 40 }])
  })

  it.each(['viagens', 'eventos', 'telemetria'] as const)('%s indisponível: telemetria null, km e eventos vazios', (conjunto) => {
    const fr = calcularFrota(ctxDe(rows), dadosVazios({
      veiculos, indisponiveis: [conjunto],
      telemetria: [telemetria({ dia: '2026-10-02', veiculoId: 'v1', distanciaKm: 10 })],
      eventos: [evento({ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', tipo: 'hardBraking' })],
    }))
    expect(fr.infleetIndisponivel).toBe(true)
    expect(fr.telemetria).toBeNull()
    expect(fr.kmPorDia).toEqual([])
    expect(fr.eventosPorMes).toEqual([])
  })
})

describe('calcularFrota — eventos por mês', () => {
  it('classifica por slug ou descrição (primeira categoria vence), ignora não classificados e fora do escopo; mês bruto', () => {
    const f = filtro({ inicio: '2026-08-01', fim: '2026-10-15' })
    const fr = calcularFrota(ctxDe([servico('v1', '2026-08-05')], f), dadosVazios({
      veiculos: [veiculo({ id: 'v1', statusLabel: 'Ativo' })],
      eventos: [
        evento({ dia: '2026-08-03', mes: '2026-08', veiculoId: 'v1', tipo: 'hardAcceleration' }),
        evento({ dia: '2026-08-04', mes: '2026-08', veiculoId: 'v1', tipo: 'hardBraking' }),
        evento({ dia: '2026-08-04', mes: '2026-08', veiculoId: 'v1', tipo: 'x', descricao: 'Freada brusca' }),
        evento({ dia: '2026-08-31', mes: '2026-09', veiculoId: 'v1', tipo: 'hardCornering' }),
        evento({ dia: '2026-09-02', mes: '2026-09', veiculoId: 'v1', tipo: 'deviceOverspeed' }),
        evento({ dia: '2026-09-02', mes: '2026-09', veiculoId: 'v1', tipo: 'y', descricao: 'Velocidade em curva' }),
        evento({ dia: '2026-09-03', mes: '2026-09', veiculoId: 'v1', tipo: 'driverChanged' }),
        evento({ dia: '2026-09-03', mes: '2026-09', veiculoId: 'v9', tipo: 'hardBraking' }),
        evento({ dia: '2026-07-20', mes: '2026-07', veiculoId: 'v1', tipo: 'hardBraking' }),
      ],
    }))
    expect(fr.eventosPorMes).toEqual([
      { mes: '2026-08', rotulo: 'ago/26', aceleracao: 1, frenagem: 2, curva: 0, excesso: 0 },
      { mes: '2026-09', rotulo: 'set/26', aceleracao: 0, frenagem: 0, curva: 1, excesso: 2 },
    ])
  })
})

describe('calcularFrota — uso mensal da frota própria', () => {
  const veiculos = [
    veiculo({ id: 'a', statusLabel: 'Ativo', categoria: 'Propria' }),
    veiculo({ id: 'b', statusLabel: 'Ativo(a)', categoria: 'Propria' }),
    veiculo({ id: 'c', statusLabel: 'Disponível', categoria: 'Propria' }),
    veiculo({ id: 't', statusLabel: 'Ativo', categoria: 'Terceirizada' }),
    veiculo({ id: 'r', statusLabel: 'Ativo', categoria: 'Aluguel' }),
  ]

  it('corte em 01/06/2026, média diária por mês em dias úteis × fim de semana; ativos só "ativo"/"ativo(a)"', () => {
    const rows = [
      servico('b', '2026-05-25'),
      servico('a', '2026-06-01'), servico('b', '2026-06-01'), servico('c', '2026-06-01'),
      servico('a', '2026-06-02'), servico('a', '2026-06-02'), servico('r', '2026-06-02'),
      servico('b', '2026-06-03', { statusLabel: 'Cancelado' }),
      servico('b', '2026-06-04', { statusLabel: 'Recusada' }),
      servico('t', '2026-06-06'),
    ]
    const fr = calcularFrota(ctxDe(rows, filtro({ inicio: '2026-05-20', fim: '2026-06-07' })), dadosVazios({ veiculos }))
    expect(fr.usoTotais).toEqual({ proprios: 2, terceiros: 1, aluguel: 1 })
    expect(fr.usoMensal).toHaveLength(1)
    const m = fr.usoMensal[0]
    expect(m.mes).toBe('2026-06')
    expect(m.rotulo).toBe('jun/26')
    expect(m.uteis.dias).toBe(5)
    expect(m.uteis.pct).toBeCloseTo(30)
    expect(m.uteis.ociosos).toBeCloseTo(1.4)
    expect(m.uteis.terceiros).toBe(0)
    expect(m.uteis.aluguel).toBeCloseTo(0.2)
    expect(m.fds).toEqual({ dias: 2, pct: 0, ociosos: 2, terceiros: 0.5, aluguel: 0 })
    expect(m.usoUteis).toBeCloseTo(30)
    expect(m.usoFds).toBe(0)
    expect(m.usados).toBeCloseTo(3 / 7)
    expect(m.ociosos).toBeCloseTo(11 / 7)
    expect(m.terceiros).toBeCloseTo(1 / 7)
    expect(m.aluguel).toBeCloseTo(1 / 7)
    expect(fr.kpis.usoMedioPropria).toBeCloseTo(150 / 7)
  })

  it('dia da reserva é o texto bruto (UTC), como o legado; segmentos valem e a categoria do item não', () => {
    const rows = [
      servico('a', '2026-06-01', { categoriaItem: 100000001 }),
      reserva({ veiculoId: 'a', saidaRaw: '2026-06-02T01:00:00Z' }),
      servico('b', '2026-06-01', { cliente: 'Outro' }),
      servico('b', '2026-05-25'),
    ]
    const f = filtro({ inicio: '2026-05-20', fim: '2026-06-02', clientes: ['Sem cliente'] })
    const m = calcularFrota(ctxDe(rows, f), dadosVazios({ veiculos })).usoMensal[0]
    expect(m.uteis.dias).toBe(2)
    expect(m.uteis.pct).toBeCloseTo(50)
    expect(m.usoFds).toBeNull()
  })

  it('período todo antes do corte: sem meses e uso médio null', () => {
    const fr = calcularFrota(ctxDe([servico('a', '2026-05-05')], filtro({ inicio: '2026-05-01', fim: '2026-05-31' })), dadosVazios({ veiculos }))
    expect(fr.usoMensal).toEqual([])
    expect(fr.kpis.usoMedioPropria).toBeNull()
  })
})
