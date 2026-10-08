import { describe, expect, it } from 'vitest'
import { atalho, cargaDesde, dayKey, diasNoMes, entre, hojeBR, mesRotulo, periodoAnoAnterior, periodoMesAnterior, mostrarLM } from './periodo'

const NOW = new Date('2026-10-15T15:00:00Z') // 12:00 em Brasília

describe('período', () => {
  it('dia e mês em Brasília (UTC-3), data pura passa direto', () => {
    expect(dayKey('2026-10-01T02:00:00Z')).toBe('2026-09-30')
    expect(dayKey('2026-10-01T03:00:00Z')).toBe('2026-10-01')
    expect(dayKey('2026-07-04')).toBe('2026-07-04')
    expect(dayKey('')).toBe('')
    expect(dayKey('lixo')).toBe('')
    expect(hojeBR(new Date('2026-10-16T02:30:00Z'))).toBe('2026-10-15')
  })

  it('entre é inclusivo nas duas pontas e recusa dia vazio', () => {
    expect(entre('2026-10-01', '2026-10-01', '2026-10-31')).toBe(true)
    expect(entre('2026-10-31', '2026-10-01', '2026-10-31')).toBe(true)
    expect(entre('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false)
    expect(entre('', '2026-10-01', '2026-10-31')).toBe(false)
  })

  it('atalhos iguais ao quickFilter do legado', () => {
    expect(atalho('hoje', NOW)).toEqual({ inicio: '2026-10-15', fim: '2026-10-15' })
    expect(atalho('ult7', NOW)).toEqual({ inicio: '2026-10-09', fim: '2026-10-15' })
    expect(atalho('ult30', NOW)).toEqual({ inicio: '2026-09-16', fim: '2026-10-15' })
    expect(atalho('esteMes', NOW)).toEqual({ inicio: '2026-10-01', fim: '2026-10-15' })
    expect(atalho('mesAnt', NOW)).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
    expect(atalho('esteAno', NOW)).toEqual({ inicio: '2026-01-01', fim: '2026-10-15' })
    expect(atalho('anoAnt', NOW)).toEqual({ inicio: '2025-01-01', fim: '2025-12-31' })
    expect(atalho('mesAnt', new Date('2026-01-10T15:00:00Z'))).toEqual({ inicio: '2025-12-01', fim: '2025-12-31' })
  })

  it('LM: meses cheios voltam um mês cheio; parcial desloca e limita ao fim do mês', () => {
    expect(periodoMesAnterior('2026-10-01', '2026-10-31')).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
    expect(periodoMesAnterior('2026-03-01', '2026-03-31')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
    expect(periodoMesAnterior('2026-03-01', '2026-03-30')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
    expect(periodoMesAnterior('2026-01-10', '2026-01-15')).toEqual({ inicio: '2025-12-10', fim: '2025-12-15' })
  })

  it('LY desloca um ano e limita 29/02', () => {
    expect(periodoAnoAnterior('2026-01-01', '2026-10-15')).toEqual({ inicio: '2025-01-01', fim: '2025-10-15' })
    expect(periodoAnoAnterior('2028-02-29', '2028-02-29')).toEqual({ inicio: '2027-02-28', fim: '2027-02-28' })
  })

  it('LM só aparece com o filtro inteiro dentro do mês corrente', () => {
    expect(mostrarLM('2026-10-01', '2026-10-15', NOW)).toBe(true)
    expect(mostrarLM('2026-09-30', '2026-10-15', NOW)).toBe(false)
    expect(mostrarLM('2026-01-01', '2026-10-15', NOW)).toBe(false)
  })

  it('janela de carga cobre LY e os três anos do gráfico', () => {
    expect(cargaDesde('2026-01-01', NOW)).toBe('2024-01-01')
    expect(cargaDesde('2023-05-01', NOW)).toBe('2022-01-01')
  })

  it('rótulos e dias no mês', () => {
    expect(mesRotulo('2026-03')).toBe('mar/26')
    expect(diasNoMes(2028, 1)).toBe(29)
    expect(diasNoMes(2026, 1)).toBe(28)
  })
})
