import { describe, expect, it } from 'vitest'
import { emergenciais, producaoPropriaTerceira } from '../destaques'
import { statusServicos } from '../analises'
import { filtrarServicos } from '../base'
import type { Contexto } from '../kpis'
import { reserva, veiculo } from '../test-utils'
import type { Filtros, Reserva } from '../types'
import { calcularServicos } from './servicos'

const NOW = new Date('2026-10-15T15:00:00Z')
const f: Filtros = { atalho: 'esteMes', inicio: '2026-08-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const ctxDe = (rows: Reserva[], filtros: Filtros = f): Contexto => ({ todas: rows, rv: filtrarServicos(rows, filtros), f: filtros, now: NOW })

describe('calcularServicos', () => {
  it('KPIs: total, concluídos, cancelados e emergenciais com percentuais do legado', () => {
    const rows = [
      reserva({ statusLabel: 'Concluído', criadoRaw: '2026-10-05T08:00:00Z' }),
      reserva({ statusLabel: 'Realizado' }),
      reserva({ statusLabel: 'Cancelado' }),
      reserva({ statusLabel: 'Recusado' }),
      reserva({ statusLabel: 'Confirmado' }),
      reserva({ statusLabel: 'Finalizado', categoriaItem: 100000001 }),
    ]
    const s = calcularServicos(ctxDe(rows), [])
    expect(s.kpis).toEqual({
      total: 5,
      concluidos: { valor: 2, pct: 40 },
      cancelados: { valor: 2, pct: 40 },
      emergenciais: { valor: 1, pct: 20 },
    })
  })

  it('sem serviços: zeros e percentuais 0', () => {
    const s = calcularServicos(ctxDe([]), [])
    expect(s.kpis).toEqual({ total: 0, concluidos: { valor: 0, pct: 0 }, cancelados: { valor: 0, pct: 0 }, emergenciais: { valor: 0, pct: 0 } })
    expect(s.porMes).toEqual([])
    expect(s.porTipoServico).toEqual([])
    expect(s.porTipoVeiculo).toEqual([])
  })

  it('porMes: quantidade por mês em ordem, só meses com serviço', () => {
    const rows = [
      reserva({ saidaRaw: '2026-10-05T15:00:00Z' }),
      reserva({ saidaRaw: '2026-08-10T15:00:00Z' }),
      reserva({ saidaRaw: '2026-10-07T15:00:00Z' }),
    ]
    expect(calcularServicos(ctxDe(rows), []).porMes).toEqual([
      { mes: '2026-08', rotulo: 'ago/26', qtd: 1 },
      { mes: '2026-10', rotulo: 'out/26', qtd: 2 },
    ])
  })

  it('por tipo de serviço: qtd, faturamento e percentuais; ordena por faturamento', () => {
    const rows = [
      reserva({ tipoServico: 'Transfer', valor: 100 }),
      reserva({ tipoServico: 'Transfer', valor: 100 }),
      reserva({ tipoServico: 'Diária', valor: 600 }),
      reserva({ tipoServico: 'Roteiro', valor: 200 }),
    ]
    const { porTipoServico } = calcularServicos(ctxDe(rows), [])
    expect(porTipoServico).toEqual([
      { tipo: 'Diária', qtd: 1, fat: 600, pctQtd: 25, pctFat: 60 },
      { tipo: 'Transfer', qtd: 2, fat: 200, pctQtd: 50, pctFat: 20 },
      { tipo: 'Roteiro', qtd: 1, fat: 200, pctQtd: 25, pctFat: 20 },
    ])
  })

  it('desempate por faturamento mantém a ordem por quantidade (como o legado)', () => {
    const rows = [
      reserva({ tipoServico: 'A', valor: 0 }),
      reserva({ tipoServico: 'B', valor: 0 }),
      reserva({ tipoServico: 'B', valor: 0 }),
    ]
    expect(calcularServicos(ctxDe(rows), []).porTipoServico.map((l) => [l.tipo, l.pctFat])).toEqual([['B', 0], ['A', 0]])
  })

  it('por tipo de veículo: mesma regra; vazio aparece como "—"', () => {
    const rows = [
      reserva({ tipoVeiculo: 'Blindado', valor: 300 }),
      reserva({ tipoVeiculo: 'Executivo', valor: 100 }),
      reserva({ tipoVeiculo: '—', valor: 100 }),
    ]
    const { porTipoVeiculo } = calcularServicos(ctxDe(rows), [])
    expect(porTipoVeiculo.map((l) => l.tipo)).toEqual(['Blindado', 'Executivo', '—'])
    expect(porTipoVeiculo[0]).toMatchObject({ tipo: 'Blindado', qtd: 1, fat: 300, pctFat: 60 })
    expect(porTipoVeiculo[0].pctQtd).toBeCloseTo(100 / 3, 10)
  })

  it('topByShare: mais de 3 linhas mantém só as acima de 10% do faturamento, no mínimo 3', () => {
    const tipos = ['A', 'B', 'C', 'D', 'E']
    const valores = [500, 300, 150, 40, 10]
    const rows = tipos.map((t, i) => reserva({ tipoServico: t, valor: valores[i] }))
    expect(calcularServicos(ctxDe(rows), []).porTipoServico.map((l) => l.tipo)).toEqual(['A', 'B', 'C'])
    const poucos = ['A', 'B', 'C', 'D'].map((t) => reserva({ tipoServico: t, valor: 1 }))
    expect(calcularServicos(ctxDe(poucos), []).porTipoServico).toHaveLength(4)
    const cauda = [800, 100, 60, 40].map((v, i) => reserva({ tipoServico: `T${i}`, valor: v }))
    expect(calcularServicos(ctxDe(cauda), []).porTipoServico.map((l) => l.tipo)).toEqual(['T0', 'T1', 'T2'])
  })

  it('respeita o filtro (rv): categoria diferente de serviço e fora do período não entram', () => {
    const rows = [
      reserva({ tipoServico: 'Transfer', valor: 100 }),
      reserva({ tipoServico: 'Transfer', valor: 100, categoriaItem: 100000001 }),
      reserva({ tipoServico: 'Transfer', valor: 100, saidaRaw: '2026-01-10T12:00:00Z' }),
    ]
    const s = calcularServicos(ctxDe(rows), [])
    expect(s.kpis.total).toBe(1)
    expect(s.porTipoServico).toEqual([{ tipo: 'Transfer', qtd: 1, fat: 100, pctQtd: 100, pctFat: 100 }])
  })

  it('status, produção e emergenciais reaproveitam as funções do Resumo', () => {
    const veiculos = [veiculo({ id: 'v1', categoria: 'Propria' }), veiculo({ id: 'v2', categoria: 'Terceirizada' })]
    const rows = [
      reserva({ veiculoId: 'v1', motoristaId: 'm1', motoristaKey: 'm1', motorista: 'Ana', valor: 50, criadoRaw: '2026-10-05T08:00:00Z' }),
      reserva({ veiculoId: 'v2', statusLabel: 'Cancelado' }),
    ]
    const ctx = ctxDe(rows)
    const s = calcularServicos(ctx, veiculos)
    expect(s.status).toEqual(statusServicos(ctx))
    expect(s.producao).toEqual(producaoPropriaTerceira(ctx.rv, veiculos))
    expect(s.emergenciais).toEqual(emergenciais(ctx.rv))
    expect(s.producao.classificados).toBe(2)
    expect(s.emergenciais.total).toBe(1)
  })
})
