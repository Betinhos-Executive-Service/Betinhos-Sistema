import { expect, it } from 'vitest'
import { dateTileParts } from './DateTile'

it('mostra dia e mês abreviado em America/Sao_Paulo', () => {
  expect(dateTileParts('2026-10-06T02:30:00.000Z')).toMatchObject({ day: '05', month: 'out' })
  expect(dateTileParts(new Date('2026-02-28T15:00:00.000Z')).label).toBe('28 de fevereiro de 2026')
})

it('trata "aaaa-mm-dd" como dia do calendário, sem voltar um dia', () => {
  expect(dateTileParts('2026-10-06')).toMatchObject({ day: '06', month: 'out' })
})

it('não quebra com data inválida', () => {
  expect(dateTileParts('abc')).toEqual({ day: '--', month: '', label: 'Data inválida' })
})
