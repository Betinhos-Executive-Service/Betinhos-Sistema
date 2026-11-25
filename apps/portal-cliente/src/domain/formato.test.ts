import { describe, expect, it } from 'vitest'
import { atalhosDeData } from './formato'

describe('atalhos de data', () => {
  it('Hoje, Amanhã e o primeiro dia útil depois de amanhã', () => {
    // Qua 2026-11-25: depois de amanhã é sexta.
    expect(atalhosDeData('2026-11-25')).toEqual([
      { rotulo: 'Hoje', valor: '2026-11-25' },
      { rotulo: 'Amanhã', valor: '2026-11-26' },
      { rotulo: 'Sex 27', valor: '2026-11-27' },
    ])
  })
  it('pula o fim de semana e a virada de mês', () => {
    // Sex 2026-11-27: amanhã é sábado; o dia útil seguinte é segunda 30.
    expect(atalhosDeData('2026-11-27')[2]).toEqual({ rotulo: 'Seg 30', valor: '2026-11-30' })
    // Qui 2026-12-31: depois de amanhã é sábado; segunda 04/01.
    expect(atalhosDeData('2026-12-31')).toEqual([
      { rotulo: 'Hoje', valor: '2026-12-31' },
      { rotulo: 'Amanhã', valor: '2027-01-01' },
      { rotulo: 'Seg 04', valor: '2027-01-04' },
    ])
  })
})
