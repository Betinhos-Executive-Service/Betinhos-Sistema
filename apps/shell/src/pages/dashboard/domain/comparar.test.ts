import { describe, expect, it } from 'vitest'
import { calcularFinanceiro } from './abas/financeiro'
import { calcularFrota } from './abas/frota'
import { calcularManutencoes } from './abas/manutencoes'
import { calcularMultas } from './abas/multas'
import { calcularServicos } from './abas/servicos'
import { filtrarServicos } from './base'
import { anteriorDe, comparar, servicosAnteriores } from './comparar'
import { int } from './format'
import type { Contexto } from './kpis'
import { periodoAnterior } from './periodo'
import { dadosVazios, manutencao, multa, reserva, telemetria } from './test-utils'
import type { Filtros, Reserva } from './types'

const NOW = new Date('2026-10-15T15:00:00Z')
/** Outubro inteiro (31 dias): o anterior é 31/08 a 30/09. */
const f: Filtros = { atalho: 'personalizado', inicio: '2026-10-01', fim: '2026-10-31', status: [], clientes: [], motoristas: [], tipos: [] }
const ctxDe = (rows: Reserva[], p: Partial<Contexto> = {}): Contexto => ({ todas: rows, rv: filtrarServicos(rows, f), f, now: NOW, ...p })

describe('comparar (chip ANT.)', () => {
  it('sem anterior: s/dado; anterior 0: base zero; senão variação e favorável pelo sentido do indicador', () => {
    expect(comparar(5, null, int, 'sobe')).toEqual({ rotulo: 'ANT.', tipo: 'sem-dado' })
    expect(comparar(5, 0, int, 'sobe')).toEqual({ rotulo: 'ANT.', tipo: 'base-zero', anterior: '0' })
    expect(comparar(15, 10, int, 'sobe')).toEqual({ rotulo: 'ANT.', tipo: 'valor', anterior: '10', variacao: 50, favoravel: true })
    expect(comparar(15, 10, int, 'desce')).toMatchObject({ variacao: 50, favoravel: false })
    expect(comparar(5, 10, int, 'desce')).toMatchObject({ variacao: -50, favoravel: true })
    // Variação 0 é favorável nos dois sentidos (como o `delta <= 0` das despesas).
    expect(comparar(10, 10, int, 'sobe')).toMatchObject({ favoravel: true })
    expect(comparar(10, 10, int, 'desce')).toMatchObject({ favoravel: true })
  })

  it('período anterior: o da página (null = fora da carga) ou a janela imediatamente anterior de mesma duração', () => {
    expect(periodoAnterior('2026-10-01', '2026-10-31')).toEqual({ inicio: '2026-08-31', fim: '2026-09-30' })
    expect(anteriorDe(ctxDe([]))).toEqual({ inicio: '2026-08-31', fim: '2026-09-30' })
    expect(anteriorDe(ctxDe([], { anterior: null }))).toBeNull()
    expect(servicosAnteriores(ctxDe([], { anterior: null }))).toBeNull()
  })
})

describe('chips ANT. das abas', () => {
  const rows = [
    reserva({ saidaRaw: '2026-10-05T15:00:00Z', valor: 900, cliente: 'A' }),
    reserva({ saidaRaw: '2026-10-06T15:00:00Z', valor: 100, cliente: 'B', statusLabel: 'Cancelado' }),
    reserva({ saidaRaw: '2026-09-10T15:00:00Z', valor: 600, cliente: 'A', veiculoId: 'v1' }),
    // Fora das duas janelas: não conta.
    reserva({ saidaRaw: '2026-08-01T15:00:00Z', valor: 5000, cliente: 'C' }),
  ]

  it('Serviços: total, concluídos, cancelados e emergenciais contra o período anterior', () => {
    const s = calcularServicos(ctxDe(rows), [], false)
    expect(s.ant.total).toMatchObject({ tipo: 'valor', anterior: '1', variacao: 100, favoravel: true })
    expect(s.ant.concluidos).toMatchObject({ tipo: 'valor', anterior: '1', variacao: 0 })
    expect(s.ant.cancelados).toEqual({ rotulo: 'ANT.', tipo: 'base-zero', anterior: '0' })
    expect(calcularServicos(ctxDe(rows, { anterior: null }), [], false).ant.total).toEqual({ rotulo: 'ANT.', tipo: 'sem-dado' })
  })

  it('Financeiro: maior serviço e clientes ativos', () => {
    const fi = calcularFinanceiro(ctxDe(rows), [], false)
    expect(fi.ant.maiorServico).toMatchObject({ tipo: 'valor', variacao: 50, favoravel: true })
    expect(fi.ant.clientesAtivos).toMatchObject({ tipo: 'valor', anterior: '1', variacao: 100 })
  })

  it('Manutenções e Multas: cair é favorável; tabela fora do ar sem chips', () => {
    const dados = dadosVazios({
      manutencoes: [manutencao({ dia: '2026-10-02', valor: 100 }), manutencao({ dia: '2026-09-02', valor: 300 }), manutencao({ dia: '2026-09-03', valor: 100 })],
      multas: [multa({ dia: '2026-10-02', status: 202410000 }), multa({ dia: '2026-09-02' })],
    })
    const ma = calcularManutencoes(ctxDe([]), dados)
    expect(ma.ant?.total).toMatchObject({ tipo: 'valor', anterior: '2', variacao: -50, favoravel: true })
    expect(ma.ant?.custoTotal).toMatchObject({ tipo: 'valor', variacao: -75, favoravel: true })
    const mu = calcularMultas(ctxDe([]), dados)
    expect(mu.ant?.total).toMatchObject({ tipo: 'valor', anterior: '1', variacao: 0 })
    expect(mu.ant?.pendentes).toEqual({ rotulo: 'ANT.', tipo: 'base-zero', anterior: '0' })
    expect(calcularMultas(ctxDe([]), { ...dados, indisponiveis: ['multas'] }).ant).toBeNull()
  })

  it('Frota: km, excessos e ocioso com o escopo do período anterior (veículos com serviço nele)', () => {
    const comVeiculo = [reserva({ saidaRaw: '2026-10-05T15:00:00Z', veiculoId: 'v1' }), reserva({ saidaRaw: '2026-09-10T15:00:00Z', veiculoId: 'v2' })]
    const dados = dadosVazios({
      reservas: comVeiculo,
      telemetria: [
        telemetria({ dia: '2026-10-05', veiculoId: 'v1', distanciaKm: 300, excessos: 1, ociosoMin: 30 }),
        telemetria({ dia: '2026-09-10', veiculoId: 'v2', distanciaKm: 200, excessos: 4, ociosoMin: 60 }),
        // v1 não tem serviço no período anterior: fica fora do escopo dele.
        telemetria({ dia: '2026-09-11', veiculoId: 'v1', distanciaKm: 999, excessos: 9, ociosoMin: 99 }),
      ],
    })
    const fr = calcularFrota(ctxDe(comVeiculo), dados)
    expect(fr.ant?.km).toMatchObject({ tipo: 'valor', anterior: '200 km', variacao: 50, favoravel: true })
    expect(fr.ant?.excessos).toMatchObject({ variacao: -75, favoravel: true })
    expect(fr.ant?.ocioso).toMatchObject({ anterior: '60 min', variacao: -50, favoravel: true })
    expect(calcularFrota(ctxDe(comVeiculo), { ...dados, indisponiveis: ['telemetria'] }).ant).toBeNull()
  })
})
