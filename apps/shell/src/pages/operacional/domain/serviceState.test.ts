import { describe, expect, it } from 'vitest'
import { addDays, dateKey, dayLabel, dayRange, formatDuration, formatHour } from './time'
import { isOpenStatus, normalizeStatus, serviceState, statusTone } from './serviceState'

const at = (iso: string) => new Date(iso)
const now = at('2026-10-05T11:00:00-03:00')

describe('time', () => {
  it('usa o dia de São Paulo', () => {
    expect(dateKey(at('2026-10-06T02:30:00Z'))).toBe('2026-10-05')
    expect(dayRange('2026-10-05').start.toISOString()).toBe('2026-10-05T03:00:00.000Z')
    expect(dayRange('2026-10-05').end.toISOString()).toBe('2026-10-06T03:00:00.000Z')
    expect(addDays('2026-10-05', 1)).toBe('2026-10-06')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })
  it('formata hora, duração e rótulo do dia', () => {
    expect(formatHour(at('2026-10-05T08:05:00-03:00'))).toBe('08:05')
    expect(formatDuration(-12)).toBe('12 min')
    expect(formatDuration(95)).toBe('1h35')
    expect(dayLabel('2026-10-05', '2026-10-05')).toBe('Hoje · seg 05/10')
    expect(dayLabel('2026-10-06', '2026-10-05')).toBe('Amanhã · ter 06/10')
    expect(dayLabel('2026-10-09', '2026-10-05')).toBe('sex 09/10')
  })
})

describe('serviceState', () => {
  const r = (status: string, saida: string | null) => ({ status, saida: saida ? at(saida) : null })

  it('normaliza acento e soft hyphen', () => {
    expect(normalizeStatus('Conclu­ído ')).toBe('concluido')
    expect(isOpenStatus('Pré-reserva')).toBe(true)
    expect(isOpenStatus('Confirmado')).toBe(false)
  })
  it('sem horário vem antes de tudo', () => {
    expect(serviceState(r('Concluído', null), now).kind).toBe('unknown')
  })
  it('concluído e cancelado', () => {
    expect(serviceState(r('Concluído', '2026-10-05T09:00:00-03:00'), now)).toMatchObject({ kind: 'concluded', label: 'Concluído' })
    expect(serviceState(r('Cancelado', '2026-10-05T13:00:00-03:00'), now)).toMatchObject({ kind: 'concluded', label: 'Cancelado' })
  })
  it('próximo: atenção até 30 min, info depois', () => {
    expect(serviceState(r('Confirmado', '2026-10-05T11:30:00-03:00'), now)).toMatchObject({ kind: 'upcoming', minutes: 30, tone: 'warning', label: 'Em 30 min' })
    expect(serviceState(r('Confirmado', '2026-10-05T11:31:00-03:00'), now)).toMatchObject({ kind: 'upcoming', tone: 'info' })
    expect(serviceState(r('Confirmado', '2026-10-05T11:00:00-03:00'), now).label).toBe('Saindo agora')
  })
  it('passou do horário: agendado vira em curso, aberto vira atrasado', () => {
    expect(serviceState(r('Programado', '2026-10-05T10:40:00-03:00'), now)).toMatchObject({ kind: 'in_progress', label: 'Saiu há 20 min, sem conclusão' })
    expect(serviceState(r('Solicitado', '2026-10-05T10:48:00-03:00'), now)).toMatchObject({ kind: 'delayed', tone: 'danger', label: 'Atrasado 12 min' })
  })
  it('mapeia status para os cinco tons', () => {
    expect(statusTone('Confirmado')).toBe('success')
    expect(statusTone('Concluído')).toBe('success')
    expect(statusTone('Requer Análise')).toBe('warning')
    expect(statusTone('Cancelado')).toBe('danger')
    expect(statusTone('Programado')).toBe('info')
    expect(statusTone('Solicitado')).toBe('neutral')
    expect(statusTone('Pré-reserva')).toBe('neutral')
    expect(statusTone('')).toBe('neutral')
  })
})
