import { describe, expect, it } from 'vitest'
import { calcularResumo } from './resumo'
import { evento, manutencao, reserva, telemetria, viagem } from './test-utils'
import type { Dados, Filtros } from './types'

const NOW = new Date('2026-10-15T15:00:00Z')
const f: Filtros = { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const vazio: Dados = { reservas: [], manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], viagens: [], eventos: [], telemetria: [], pagantes: [], despesas: [], categoriasDespesa: [], formasPagamento: [], indisponiveis: [] }

describe('calcularResumo', () => {
  it('não quebra sem dados', () => {
    const r = calcularResumo(vazio, f, NOW)
    expect(r.servicos).toBe(0)
    expect(r.kpis).toHaveLength(6)
    expect(r.qualidade.every((a) => a.status === 's/dado')).toBe(true)
  })

  it('filtra secundários pelo período e compõe as seções', () => {
    const dados: Dados = {
      ...vazio,
      reservas: [reserva({ saidaRaw: '2026-10-02T12:00:00Z', valor: 500, cliente: 'Tenaris' }), reserva({ saidaRaw: '2026-09-02T12:00:00Z', valor: 900 })],
      manutencoes: [manutencao({ dia: '2026-10-03', valor: 100 }), manutencao({ dia: '2026-09-03', valor: 999 })],
      ocorrencias: [{ dia: '2026-10-05' }, { dia: '2026-08-01' }],
    }
    const r = calcularResumo(dados, f, NOW)
    expect(r.servicos).toBe(1)
    expect(r.custoFrota.valor).toBe('R$\u00a0100,00')
    expect(r.operacao.find((a) => a.id === 'ocorrencias')?.valor).toBe('1')
    expect(r.clientes.linhas[0].cliente).toBe('Tenaris')
  })

  it('Operação traz o Score motoristas calculado só com o que cai no período', () => {
    const dados: Dados = {
      ...vazio,
      // 250 km, 5 acelerações, 2 frenagens e 12 min ociosos em outubro (nota 82); setembro (400 km, 4 frenagens, nota 95) fica de fora do período.
      viagens: [
        viagem({ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', motoristaId: 'm1', distancia: 100 }), viagem({ dia: '2026-10-06', mes: '2026-10', veiculoId: 'v1', motoristaId: 'm1', distancia: 150 }),
        viagem({ dia: '2026-09-10', mes: '2026-09', veiculoId: 'v2', motoristaId: 'm2', distancia: 400 }),
      ],
      eventos: [
        ...Array.from({ length: 5 }, () => evento({ dia: '2026-10-03', mes: '2026-10', motoristaId: 'm1', tipo: 'hardAcceleration' })),
        ...Array.from({ length: 2 }, () => evento({ dia: '2026-10-03', mes: '2026-10', motoristaId: 'm1', tipo: 'hardBraking' })),
        ...Array.from({ length: 4 }, () => evento({ dia: '2026-09-11', mes: '2026-09', motoristaId: 'm2', tipo: 'hardBraking' })),
      ],
      telemetria: [
        telemetria({ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', ociosoMin: 7 }), telemetria({ dia: '2026-10-06', mes: '2026-10', veiculoId: 'v1', ociosoMin: 5 }),
        telemetria({ dia: '2026-09-10', mes: '2026-09', veiculoId: 'v2', ociosoMin: 0 }),
      ],
    }
    const r = calcularResumo(dados, f, NOW)
    expect(r.operacao.map((a) => a.id)).toEqual(['cnh', 'multas', 'ocorrencias', 'score'])
    expect(r.operacao[3]).toEqual({ id: 'score', valor: '82', rotulo: 'Score motoristas', status: '1 notas válidas', tom: 'ok' })
    const todoSetembro = calcularResumo(dados, { ...f, inicio: '2026-09-01', fim: '2026-09-30' }, NOW)
    expect(todoSetembro.operacao[3]).toMatchObject({ valor: '95', status: '1 notas válidas', tom: 'ok' })
    expect(calcularResumo(vazio, f, NOW).operacao[3]).toEqual({ id: 'score', valor: '—', rotulo: 'Score motoristas', status: '0 notas válidas', tom: 'warn' })
  })

  it('conjunto do Infleet indisponível deixa o Score motoristas em s/dado', () => {
    const r = calcularResumo({ ...vazio, indisponiveis: ['viagens'] }, f, NOW)
    expect(r.operacao[3]).toEqual({ id: 'score', valor: '—', rotulo: 'Score motoristas', status: 's/dado', tom: 'neutral' })
  })
})
