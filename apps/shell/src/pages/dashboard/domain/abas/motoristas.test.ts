import { describe, expect, it } from 'vitest'
import { filtrarServicos } from '../base'
import type { Contexto } from '../kpis'
import { dadosVazios, evento, funcionario, reserva, telemetria, veiculo, viagem } from '../test-utils'
import type { Dados, Filtros, Reserva } from '../types'
import { calcularMotoristas } from './motoristas'

const NOW = new Date('2026-10-15T15:00:00Z')
const DIA = 86_400_000
const f: Filtros = { atalho: 'personalizado', inicio: '2026-09-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const ctxDe = (rows: Reserva[]): Contexto => ({ todas: rows, rv: filtrarServicos(rows, f), f, now: NOW })
const srv = (motoristaId: string, p: Partial<Reserva> = {}) =>
  reserva({ motoristaId, motoristaKey: motoristaId, motorista: motoristaId.toUpperCase(), ...p })

describe('calcularMotoristas', () => {
  it('KPIs: funcionários ativos (todas as funções), CNH em atenção e score médio', () => {
    const dados: Dados = dadosVazios({
      funcionarios: [
        funcionario({ id: 'a', nome: 'Ana Souza', cnhMs: NOW.getTime() + 30 * DIA }),
        funcionario({ id: 'b', nome: 'Bruno', funcao: 'Administrativo', cnhMs: NOW.getTime() - 5 * DIA }),
        funcionario({ id: 'c', nome: 'Caio', cnhMs: NOW.getTime() + 200 * DIA }),
        funcionario({ id: 'd', nome: 'Davi', statusLabel: 'Desligado', cnhMs: NOW.getTime() + 10 * DIA }),
        funcionario({ id: 'e', nome: 'Edu' }),
      ],
      viagens: [viagem({ motoristaId: 'a', veiculoId: 'v1', distancia: 200 })],
      telemetria: [telemetria({ veiculoId: 'v1' })],
    })
    const m = calcularMotoristas(ctxDe([]), dados)
    expect(m.kpis).toEqual({ total: 4, cnhAtencao: 2, score: { media: 100, validas: 1 } })
  })

  it('conjuntos fora do ar viram null (s/dado) só nos KPIs deles', () => {
    const dados = dadosVazios({ funcionarios: [funcionario({ id: 'a' })], indisponiveis: ['funcionarios', 'eventos'] })
    const m = calcularMotoristas(ctxDe([]), dados)
    expect(m.kpis).toEqual({ total: null, cnhAtencao: null, score: null })
    expect(m.ranking).toEqual([])
    expect(m.cnhVencendo).toEqual([])
    expect(calcularMotoristas(ctxDe([]), dadosVazios({ indisponiveis: ['telemetria'] })).kpis).toEqual({ total: 0, cnhAtencao: 0, score: null })
  })

  it('veículos fora do ar: avisa que o filtro próprio/terceiro não se aplica (propria fica null)', () => {
    const funcionarios = [funcionario({ id: 'a', nome: 'Ana' })]
    const rows = [srv('a', { veiculoId: 'v1' })]
    const fora = calcularMotoristas(ctxDe(rows), dadosVazios({ funcionarios, indisponiveis: ['veiculos'] }))
    expect(fora.veiculosIndisponiveis).toBe(true)
    expect(fora.ranking[0]).toMatchObject({ key: 'a', servicos: 1, propria: null })
    const ok = calcularMotoristas(ctxDe(rows), dadosVazios({ funcionarios, veiculos: [veiculo({ id: 'v1', categoria: 'Propria' })] }))
    expect(ok.veiculosIndisponiveis).toBe(false)
    expect(ok.ranking[0].propria).toBe(true)
  })

  it('ranking: base = funcionários ativos, serviços por id (ou pelo nome sem id), ordenado por quantidade', () => {
    const rows = [
      srv('a', { valor: 300, cpConcluida: true, veiculoId: 'v1' }), srv('a', { valor: 100, cpConcluida: true, veiculoId: 'v1' }),
      srv('a', { valor: 50, veiculoId: 'v2' }),
      srv('c', { valor: 200, cpConcluida: true, veiculoId: 'v2' }),
      reserva({ motoristaId: '', motoristaKey: 'nome:ze', motorista: 'Zé', valor: 80 }),
      srv('a', { categoriaItem: 100000001, valor: 999 }),
      srv('c', { saidaRaw: '2026-08-20T15:00:00Z', valor: 999 }),
    ]
    const dados = dadosVazios({
      funcionarios: [
        funcionario({ id: 'c', nome: 'Caio Lima', apelido: 'Caio', cnhMs: Date.parse('2027-03-10') }),
        funcionario({ id: 'a', nome: 'Ana Souza', funcao: 'Motorista' }),
        funcionario({ id: '', nome: 'José', apelido: 'Zé' }),
        funcionario({ id: 'x', nome: 'Sem serviço' }),
        funcionario({ id: 'd', nome: 'Desligado', statusLabel: 'Desligado' }),
      ],
      veiculos: [veiculo({ id: 'v1', categoria: 'Propria' }), veiculo({ id: 'v2', categoria: 'Terceirizada' })],
    })
    const m = calcularMotoristas(ctxDe(rows), dados)
    expect(m.ranking.map((l) => l.nome)).toEqual(['Ana Souza', 'Caio', 'Zé', 'Sem serviço'])
    const [ana, caio, ze, sem] = m.ranking
    expect(ana).toMatchObject({ key: 'a', nomeCompleto: 'Ana Souza', funcao: 'Motorista', servicos: 3, faturamento: 450, ticket: 200, propria: true, cnhDia: '' })
    expect(ana.pct).toBeCloseTo(60, 10)
    expect(caio).toMatchObject({ key: 'c', servicos: 1, faturamento: 200, ticket: 200, propria: false, cnhDia: '2027-03-10', pct: 20 })
    expect(ze).toMatchObject({ key: 'nome:ze', servicos: 1, faturamento: 80, propria: null })
    expect(sem).toMatchObject({ key: 'x', servicos: 0, faturamento: 0, ticket: 0, pct: 0, propria: null })
  })

  it('ranking: meses com serviço no recorte, quantidade e % do mês; mesesBase para a média por mês', () => {
    const rows = [
      srv('a', { saidaRaw: '2026-09-10T15:00:00Z' }), srv('b', { saidaRaw: '2026-09-11T15:00:00Z' }),
      srv('b', { saidaRaw: '2026-09-12T15:00:00Z' }), srv('b', { saidaRaw: '2026-09-13T15:00:00Z' }),
      srv('a', { saidaRaw: '2026-10-02T15:00:00Z' }),
    ]
    const dados = dadosVazios({ funcionarios: [funcionario({ id: 'a', nome: 'Ana' }), funcionario({ id: 'b', nome: 'Bia' })] })
    const m = calcularMotoristas(ctxDe(rows), dados)
    expect(m.mesesBase).toBe(2)
    expect(m.ranking.find((l) => l.key === 'a')?.meses).toEqual([
      { mes: '2026-09', rotulo: 'set/26', qtd: 1, pct: 25 },
      { mes: '2026-10', rotulo: 'out/26', qtd: 1, pct: 100 },
    ])
    expect(calcularMotoristas(ctxDe([]), dados).mesesBase).toBe(1)
  })

  it('propria: categoria do veículo mais usado; empate vai para o serviço mais recente; Aluguel e sem categoria ficam null', () => {
    const rows = [
      srv('a', { veiculoId: 'v1', saidaRaw: '2026-10-01T15:00:00Z' }), srv('a', { veiculoId: 'v2', saidaRaw: '2026-10-03T15:00:00Z' }),
      srv('b', { veiculoId: 'v3' }), srv('b', { veiculoId: 'v3' }), srv('b', { veiculoId: 'v1' }), srv('b'),
      srv('c', { veiculoId: 'v4' }),
    ]
    const dados = dadosVazios({
      funcionarios: [funcionario({ id: 'a', nome: 'A' }), funcionario({ id: 'b', nome: 'B' }), funcionario({ id: 'c', nome: 'C' })],
      veiculos: [veiculo({ id: 'v1', categoria: 'Propria' }), veiculo({ id: 'v2', categoria: 'Terceirizada' }), veiculo({ id: 'v3', categoria: 'Aluguel' }), veiculo({ id: 'v4' })],
    })
    const m = calcularMotoristas(ctxDe(rows), dados)
    const propria = Object.fromEntries(m.ranking.map((l) => [l.key, l.propria]))
    expect(propria).toEqual({ a: false, b: null, c: null })
  })

  it('CNH vencendo: só ativos com validade até 90 dias (inclui vencidas), em ordem de validade, com dias corridos', () => {
    const dados = dadosVazios({
      funcionarios: [
        funcionario({ id: 'a', nome: 'Ana Souza', apelido: 'Ana', cnhMs: Date.parse('2026-11-14') }),
        funcionario({ id: 'b', nome: 'Bruno', cnhMs: Date.parse('2026-10-10') }),
        funcionario({ id: 'c', nome: 'Caio', cnhMs: Date.parse('2027-06-01') }),
        funcionario({ id: 'd', nome: 'Davi', statusLabel: 'Afastado', cnhMs: Date.parse('2026-10-20') }),
        funcionario({ id: 'e', nome: 'Edu' }),
      ],
    })
    expect(calcularMotoristas(ctxDe([]), dados).cnhVencendo).toEqual([
      { nome: 'Bruno', cnhDia: '2026-10-10', dias: -5 },
      { nome: 'Ana', cnhDia: '2026-11-14', dias: 30 },
    ])
  })

  it('score por motorista e mês com nome do funcionário (apelido, nome ou "Motorista vinculado"), ranking mensal e nota por mês', () => {
    const dados = dadosVazios({
      funcionarios: [funcionario({ id: 'm1', nome: 'Ana Souza', apelido: 'Ana', statusLabel: 'Desligado' }), funcionario({ id: 'm2', nome: 'Bruno' })],
      viagens: [
        viagem({ motoristaId: 'm1', veiculoId: 'v1', distancia: 200 }),
        viagem({ motoristaId: 'm2', veiculoId: 'v2', distancia: 300 }),
        viagem({ motoristaId: 'm3', veiculoId: 'v3', distancia: 50 }),
        viagem({ dia: '2026-08-20', mes: '2026-08', motoristaId: 'm1', veiculoId: 'v1', distancia: 500 }),
      ],
      eventos: [evento({ motoristaId: 'm1', tipo: 'hardAcceleration' }), evento({ motoristaId: 'm1', tipo: 'hardAcceleration' }), evento({ motoristaId: 'm1', tipo: 'hardAcceleration' })],
      telemetria: [telemetria({ veiculoId: 'v1' }), telemetria({ veiculoId: 'v2' }), telemetria({ veiculoId: 'v3' })],
    })
    const m = calcularMotoristas(ctxDe([]), dados)
    // m1: 3 acelerações em 200 km = 1,5/100 km → 71,43 · 0,35 + 35 + 30 = 90.
    expect(m.scorePorMotoristaMes.map((l) => [l.nome, l.rotulo, l.nota])).toEqual([['Bruno', 'out/26', 100], ['Ana', 'out/26', 90], ['Motorista vinculado', 'out/26', null]])
    expect(m.rankingMensal).toEqual([{ mes: '2026-10', rotulo: 'out/26', ranking: [
      { motoristaId: 'm2', nome: 'Bruno', nota: 100, distancia: 300 }, { motoristaId: 'm1', nome: 'Ana', nota: 90, distancia: 200 },
    ] }])
    expect(m.notaPorMes).toEqual([{ mes: '2026-10', rotulo: 'out/26', nota: 95, validas: 2 }])
    expect(m.kpis.score).toEqual({ media: 95, validas: 2 })
  })
})
