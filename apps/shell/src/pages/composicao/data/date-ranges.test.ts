import { expect, it } from 'vitest'
import { fetchDateRange, shiftDay } from './date-ranges'

it('atalhos de data do FetchXML viram intervalos de dias no modo local (semana de domingo a sábado)', () => {
  const today = '2026-11-12'
  expect(fetchDateRange('today', 0, today)).toEqual([today, today])
  expect(fetchDateRange('this-week', 0, today)).toEqual(['2026-11-08', '2026-11-14'])
  expect(fetchDateRange('this-month', 0, today)).toEqual(['2026-11-01', '2026-11-30'])
  expect(fetchDateRange('last-month', 0, today)).toEqual(['2026-10-01', '2026-10-31'])
  expect(fetchDateRange('next-x-days', 7, today)).toEqual([today, '2026-11-19'])
  expect(fetchDateRange('eq', 0, today)).toBeUndefined()
  expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
})
