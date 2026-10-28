import { describe, expect, it } from 'vitest'
import { diaLocal, diasUteisRestantes, podeAprovar, somarDiasUteis } from './regras'
import { brl, dataHora, diaBr } from './formato'

describe('somarDiasUteis', () => {
  it('sexta + 5 dias úteis cai na sexta seguinte', () => {
    expect(somarDiasUteis('2026-10-23T14:00:00-03:00', 5)).toBe('2026-10-30')
  })
  it('pula o feriado de Finados', () => {
    expect(somarDiasUteis('2026-10-30T09:00:00-03:00', 5)).toBe('2026-11-09')
  })
  it('liberado no sábado conta a partir de segunda', () => {
    expect(somarDiasUteis('2026-10-24T10:00:00-03:00', 5)).toBe('2026-10-30')
  })
  it('usa o dia de São Paulo, não o de UTC', () => {
    // 23:30 de sexta em SP já é sábado em UTC.
    expect(diaLocal('2026-10-23T23:30:00-03:00')).toBe('2026-10-23')
    expect(somarDiasUteis('2026-10-23T23:30:00-03:00', 1)).toBe('2026-10-26')
  })
})

describe('diasUteisRestantes', () => {
  it('conta só dias úteis até o prazo', () => {
    expect(diasUteisRestantes('2026-10-30', '2026-10-28T10:00:00-03:00')).toBe(2)
    expect(diasUteisRestantes('2026-11-09', '2026-10-30T10:00:00-03:00')).toBe(5)
  })
  it('vence hoje = 0 e prazo passado nunca fica negativo', () => {
    expect(diasUteisRestantes('2026-10-28', '2026-10-28T10:00:00-03:00')).toBe(0)
    expect(diasUteisRestantes('2026-10-20', '2026-10-28T10:00:00-03:00')).toBe(0)
  })
})

describe('podeAprovar', () => {
  it.each([
    ['liberado', true], ['em_duvida', true], ['respondido', true], ['aprovado', false], ['aprovado_tacito', false],
  ] as const)('%s → %s', (status, esperado) => {
    expect(podeAprovar({ status })).toBe(esperado)
  })
})

describe('formato', () => {
  it('moeda e data em pt-BR / São Paulo', () => {
    expect(brl(1234.5)).toBe('R$ 1.234,50')
    expect(dataHora('2026-10-23T17:05:00Z')).toBe('23/10/2026 14:05')
    expect(diaBr('2026-11-09')).toBe('09/11/2026')
  })
})
