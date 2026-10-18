import { describe, expect, it } from 'vitest'
import { computeAlertas, rotuloCurto } from './alerts'
import { addMonths, nextBirthday, toDateOnly, todaySP } from './dates'

const base = { status: 0, validadeCnh: null, dataAso: null, aniversario: null }
const today = '2026-10-01'

describe('computeAlertas', () => {
  it('classifica CNH por faixa de dias', () => {
    expect(computeAlertas({ ...base, validadeCnh: '2026-09-30' }, today)[0].level).toBe('vencido')
    expect(computeAlertas({ ...base, validadeCnh: '2026-10-01' }, today)[0]).toMatchObject({ level: 'critico', days: 0, label: 'CNH vence hoje' })
    expect(computeAlertas({ ...base, validadeCnh: '2026-10-31' }, today)[0]).toMatchObject({ level: 'critico', days: 30 })
    expect(computeAlertas({ ...base, validadeCnh: '2026-11-01' }, today)[0]).toMatchObject({ level: 'atencao', days: 31 })
    expect(computeAlertas({ ...base, validadeCnh: '2026-11-30' }, today)[0]).toMatchObject({ level: 'atencao', days: 60 })
    expect(computeAlertas({ ...base, validadeCnh: '2026-12-01' }, today)).toEqual([])
  })

  it('calcula ASO com validade de 12 meses', () => {
    expect(computeAlertas({ ...base, dataAso: '2025-10-15' }, today)[0]).toMatchObject({ kind: 'aso', level: 'critico', date: '2026-10-15' })
    expect(computeAlertas({ ...base, dataAso: '2025-09-01' }, today)[0].level).toBe('vencido')
  })

  it('avisa aniversário na virada do ano', () => {
    const alertas = computeAlertas({ ...base, aniversario: '1990-01-03' }, '2026-12-30')
    expect(alertas[0]).toMatchObject({ kind: 'aniversario', days: 4, date: '2027-01-03' })
  })

  it('ignora colaborador desligado', () => {
    expect(computeAlertas({ ...base, status: 1, validadeCnh: '2020-01-01' }, today)).toEqual([])
  })
})

describe('datas', () => {
  it('trata 29/02 e fim de mês', () => {
    expect(nextBirthday('2000-02-29', '2027-02-01')).toBe('2027-02-28')
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28')
  })

  it('converte UTC para o dia de São Paulo', () => {
    expect(toDateOnly('2026-03-03T02:00:00Z')).toBe('2026-03-02')
    expect(toDateOnly('2026-03-03')).toBe('2026-03-03')
    expect(toDateOnly('2024-02-01T00:00:00Z', 'TimeZoneIndependent')).toBe('2024-02-01')
    expect(toDateOnly('2027-07-01T03:00:00Z', 'UserLocal')).toBe('2027-07-01')
    expect(todaySP(new Date('2026-10-02T02:30:00Z'))).toBe('2026-10-01')
  })
})

describe('rotuloCurto', () => {
  it('na coluna, tira o nome do documento e mostra a data do vencimento', () => {
    expect(rotuloCurto({ kind: 'aso', level: 'vencido', days: -10, date: '2025-02-01', label: 'ASO vencido desde 01/02/2025' })).toBe('Venceu 01/02/2025')
    expect(rotuloCurto({ kind: 'cnh', level: 'critico', days: 5, date: '2026-10-23', label: 'CNH vence em 5 dias' })).toBe('Vence em 5 dias')
    expect(rotuloCurto({ kind: 'aniversario', level: 'info', days: 2, date: '2026-10-20', label: 'Aniversário em 2 dias' })).toBe('Aniversário em 2 dias')
  })
})
