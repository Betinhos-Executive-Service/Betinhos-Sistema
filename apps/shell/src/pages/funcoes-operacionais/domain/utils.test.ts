import { afterEach, describe, expect, it, vi } from 'vitest'
import { systemUsersPath, servicesWindow, passengerLinksPath, swapPath, swapsPath, possessionsPath } from './queries'
import {
  addDays, chunk, combineDateTime, compareAsc, defaultVehicleWindow, displayDriverName, formatDate, formatDateTime, formatTime,
  formattedValue, isPast, normalizeText, parseDate, toDateInputValue, toHourValue, toMinuteValue, toODataDate, twoDigits,
} from './utils'

afterEach(() => vi.useRealTimers())

describe('texto', () => {
  it('normalizeText remove acentos, minúsculas e espaços', () => {
    expect(normalizeText('  São JOSÉ  ')).toBe('sao jose')
    expect(normalizeText(null)).toBe('')
  })
  it('formattedValue lê a anotação e tolera registro ausente', () => {
    expect(formattedValue({ 'a@OData.Community.Display.V1.FormattedValue': 'X' }, 'a')).toBe('X')
    expect(formattedValue(null, 'a')).toBe('')
    expect(formattedValue({}, 'a')).toBe('')
  })
  it('displayDriverName prefere o apelido', () => {
    expect(displayDriverName({ name: 'Ana Souza', nickname: ' Ana ' })).toBe('Ana')
    expect(displayDriverName({ name: ' Ana Souza ' })).toBe('Ana Souza')
    expect(displayDriverName(null)).toBe('')
  })
  it('twoDigits completa com zero', () => {
    expect(twoDigits(5)).toBe('05')
    expect(twoDigits('')).toBe('00')
    expect(twoDigits('12')).toBe('12')
  })
})

describe('chunk', () => {
  it('tamanho inválido vira 1 e a ordem é preservada', () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1], [2], [3]])
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe('datas', () => {
  it('parseDate rejeita vazio e inválido, e copia Date', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('xx')).toBeNull()
    const d = new Date(2026, 0, 1)
    const copy = parseDate(d)
    expect(copy).not.toBe(d)
    expect(copy?.getTime()).toBe(d.getTime())
  })

  it('combineDateTime junta data e hora local e rejeita data vazia ou inválida', () => {
    const d = combineDateTime('2026-10-05', '14', '30')!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 5, 14, 30])
    expect(combineDateTime('', '1', '1')).toBeNull()
    expect(combineDateTime('lixo', '1', '1')).toBeNull()
    expect(combineDateTime('2026-10-05', '', '')!.getHours()).toBe(0)
  })

  it('addDays atravessa mês e não altera o original', () => {
    const base = new Date(2026, 0, 31, 10)
    const next = addDays(base, 1)
    expect([next.getMonth(), next.getDate()]).toEqual([1, 1])
    expect(base.getDate()).toBe(31)
    expect(addDays(base, 0).getTime()).toBe(base.getTime())
  })

  it('compareAsc ordena por instante', () => {
    expect(compareAsc('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')).toBeLessThan(0)
    expect(compareAsc(new Date(5), new Date(5))).toBe(0)
  })

  it('campos de entrada e ISO', () => {
    const d = new Date(2026, 2, 4, 5, 6)
    expect(toDateInputValue(d)).toBe('2026-03-04')
    expect(toHourValue(d)).toBe('05')
    expect(toMinuteValue(d)).toBe('06')
    expect(toODataDate(new Date('2026-03-04T05:06:00Z'))).toBe('2026-03-04T05:06:00.000Z')
    expect(toDateInputValue(null)).toBe('')
    expect(toHourValue('xx')).toBe('00')
    expect(toODataDate('')).toBe('')
  })

  it('formatação pt-BR com traço para vazio', () => {
    const d = new Date(2026, 2, 4, 5, 6)
    expect(formatDate(d)).toBe('04/03/2026')
    expect(formatTime(d)).toBe('05:06')
    expect(formatDateTime(d).replace(/\s|,/g, '')).toBe('04/03/202605:06')
    expect(formatDate(null)).toBe('—')
    expect(formatTime('x')).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
  })

  it('isPast compara com o relógio', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 1, 12))
    expect(isPast(new Date(2026, 5, 1, 11))).toBe(true)
    expect(isPast(new Date(2026, 5, 1, 13))).toBe(false)
    expect(isPast(null)).toBe(false)
  })

  it('defaultVehicleWindow arredonda para cima de 5 em 5 minutos, com 10 min de janela', () => {
    expect(defaultVehicleWindow(new Date(2026, 5, 1, 12, 1, 0))).toMatchObject({ startHour: '12', startMinute: '05', endMinute: '15' })
    expect(defaultVehicleWindow(new Date(2026, 5, 1, 12, 5, 0))).toMatchObject({ startMinute: '05', endMinute: '15' })
    expect(defaultVehicleWindow(new Date(2026, 5, 30, 23, 58, 0))).toMatchObject({ startDate: '2026-07-01', startHour: '00', startMinute: '00', endMinute: '10' })
  })
})

describe('consultas OData', () => {
  it('systemUsersPath escapa aspas simples', () => {
    expect(systemUsersPath(["o'neil@x.com", 'b@x.com'])).toBe(
      "systemusers?$select=internalemailaddress&$filter=isdisabled eq false and (internalemailaddress eq 'o''neil@x.com' or internalemailaddress eq 'b@x.com')",
    )
  })

  it('servicesWindow vai de 00:00 de hoje −7 dias até 00:00 de hoje +8 dias', () => {
    const { start, end } = servicesWindow(new Date(2026, 9, 15, 18, 30))
    expect([start.getMonth(), start.getDate(), start.getHours()]).toEqual([9, 8, 0])
    expect([end.getMonth(), end.getDate(), end.getHours()]).toEqual([9, 23, 0])
  })

  it('passengerLinksPath tira chaves dos ids e junta com or', () => {
    const path = passengerLinksPath(['{A}', 'B'])
    expect(path).toContain('$filter=')
    expect(path).toMatch(/ eq A or .* eq B$/)
    expect(path).not.toContain('{')
  })

  it('trocas ativas Programadas ou Confirmadas; troca por id sem chaves', () => {
    expect(swapsPath()).toMatch(/\(statecode eq 0\) and \(.* eq 202410000 or .* eq 100000001\)$/)
    expect(swapPath('{T1}')).toMatch(/\(T1\)\?\$select=/)
  })

  it('possessões: abertas ou encerradas nos últimos 365 dias', () => {
    const now = new Date('2026-10-15T00:00:00Z')
    const path = possessionsPath(now)
    expect(path).toContain('eq null or')
    expect(path).toContain('ge 2025-10-15T00:00:00.000Z')
  })
})
