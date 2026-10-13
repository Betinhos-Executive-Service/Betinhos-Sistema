import { describe, expect, it } from 'vitest'
import { fixoNoPeriodo, historicoFat, metaMensal, metaProporcional, totalFixoNoPeriodo } from './meta'
import { FAT_FIXO } from '../data/historico'
import { CSV_2026 } from '../data/historico2026'
import { mapCsv2026 } from '../data/csv2026'

describe('histórico e meta', () => {
  it('rateia o mês fixo pelos dias do período', () => {
    expect(totalFixoNoPeriodo(FAT_FIXO[2025], 2025, '2025-02-01', '2025-02-14')).toBeCloseTo(454025.84 / 28 * 14, 6)
    expect(totalFixoNoPeriodo(FAT_FIXO[2025], 2025, '2025-01-01', '2025-12-31')).toBeCloseTo(FAT_FIXO[2025].reduce((a, b) => a + b, 0), 4)
    expect(totalFixoNoPeriodo(FAT_FIXO[2025], 2025, '2025-03-10', '2025-03-01')).toBe(0)
  })

  it('fixoNoPeriodo só usa 2023–2025', () => {
    expect(fixoNoPeriodo('2026-01-01', '2026-03-31')).toBe(0)
    expect(fixoNoPeriodo('2024-12-01', '2025-01-31')).toBeCloseTo(330595.71 + 336469.65, 4)
  })

  it('meta = (50% N−1 + 40% N−2 + 10% N−3) × 1,13 arredondada', () => {
    expect(historicoFat(2026, 0)).toBe(276277.52)
    expect(historicoFat(2022, 0)).toBe(0)
    expect(metaMensal(2026, 0)).toBe(303489)
  })

  it('meta proporcional aos dias, arredondada no fim', () => {
    expect(metaProporcional('2026-01-01', '2026-01-31')).toBe(303489)
    expect(metaProporcional('2026-01-01', '2026-01-15')).toBe(146850)
    expect(metaProporcional('2026-02-01', '2026-01-01')).toBe(0)
  })

  it('CSV de 2026 vira reservas de serviço sem CP nem OP', () => {
    expect(CSV_2026.length).toBeGreaterThan(1900)
    const r = mapCsv2026(['2026-01-02T13:00:00-03:00', 'Concluido', 'Oliveira', '.', '8559', 'Particular', 'Guarulhos', 'Spin', 790], 1)
    expect(r).toMatchObject({ id: 'legacy-2026-0002', dia: '2026-01-02', mes: '2026-01', statusLabel: 'Concluído', fatStatusLabel: 'Histórico CSV', motorista: 'Oliveira', motoristaKey: 'nome:oliveira', cliente: 'Particular', veiculoId: '', tipoVeiculo: 'Spin', valor: 790, cpConcluida: false, opId: '' })
    expect(mapCsv2026(['2026-01-03T07:00:00-03:00', 'Cancelado', '-', '', '', '-', '', '', 0], 0)).toMatchObject({ statusLabel: 'Cancelado', motorista: 'Sem motorista', cliente: 'Sem cliente', tipoVeiculoRaw: '', tipoVeiculo: '—' })
  })
})
