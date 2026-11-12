import { describe, expect, it } from 'vitest'
import { gridFieldDraft, gridFieldValue, gridNumberInput } from './grid-field-value'
import type { CatalogField } from './views'

const field = (type: string) => ({ type }) as unknown as CatalogField

describe('gridNumberInput', () => {
  it.each([
    ['1.234,56', '1234.56'],
    ['R$ 1.234,56', '1234.56'],
    ['  -25,5 ', '-25.5'],
    ['100', '100'],
  ])('aceita %s', (input, expected) => expect(gridNumberInput(input)).toBe(expected))

  it.each(['', 'abc', '1,2,3', '--1', '1e5', ',5', '12,'])('rejeita "%s"', (input) => expect(gridNumberInput(input)).toBeNull())
})

describe('gridFieldDraft', () => {
  it('vazio para null/undefined', () => {
    expect(gridFieldDraft(field('String'), null)).toBe('')
    expect(gridFieldDraft(field('Money'), undefined)).toBe('')
  })
  it('números usam vírgula decimal', () => expect(gridFieldDraft(field('Money'), 12.5)).toBe('12,5'))
  it('texto é preservado', () => expect(gridFieldDraft(field('String'), 'Olá ção')).toBe('Olá ção'))
  it('data sem fuso do usuário corta Z e segundos', () =>
    expect(gridFieldDraft(field('DateTime'), '2026-09-22T08:30:45Z', 'TimeZoneIndependent')).toBe('2026-09-22T08:30'))
  it('data inválida vira vazio', () => expect(gridFieldDraft(field('DateTime'), 'xx')).toBe(''))
  it('data local tem formato datetime-local', () =>
    expect(gridFieldDraft(field('DateTime'), '2026-09-22T08:30:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
})

describe('gridFieldValue', () => {
  it('rascunho vazio vira null', () => expect(gridFieldValue(field('Money'), '   ')).toBeNull())
  it('número pt-BR vira Number', () => expect(gridFieldValue(field('Money'), '1.250,75')).toBe(1250.75))
  it('número inválido lança', () => expect(() => gridFieldValue(field('Decimal'), 'abc')).toThrow('Informe um número válido.'))
  it('inteiro exige inteiro seguro', () => {
    expect(gridFieldValue(field('Integer'), '42')).toBe(42)
    expect(() => gridFieldValue(field('Integer'), '1,5')).toThrow('número válido')
    expect(() => gridFieldValue(field('BigInt'), '99999999999999999999')).toThrow('número válido')
  })
  it('GUID aceita chaves e normaliza para minúsculas', () =>
    expect(gridFieldValue(field('Uniqueidentifier'), '{ABCDEF01-2345-6789-ABCD-EF0123456789}')).toBe('abcdef01-2345-6789-abcd-ef0123456789'))
  it('GUID inválido lança', () => expect(() => gridFieldValue(field('Uniqueidentifier'), '123')).toThrow('identificador válido'))
  it('data exige ano de quatro dígitos', () => {
    expect(() => gridFieldValue(field('DateTime'), '0000-01-01T00:00')).toThrow('data válida')
    expect(() => gridFieldValue(field('DateTime'), '26-01-01')).toThrow('data válida')
    expect(() => gridFieldValue(field('DateTime'), '2026-13-45T00:00')).toThrow('data válida')
  })
  it('somente data zera a hora em UTC', () => expect(gridFieldValue(field('DateTime'), '2026-09-22T08:30', 'UserLocal', true)).toBe('2026-09-22T00:00:00Z'))
  it('comportamento independente de fuso grava como UTC literal', () =>
    expect(gridFieldValue(field('DateTime'), '2026-09-22T08:30', 'TimeZoneIndependent')).toBe('2026-09-22T08:30:00Z'))
  it('ida e volta de data local preserva o rascunho', () => {
    const iso = gridFieldValue(field('DateTime'), '2026-09-22T08:30') as string
    expect(gridFieldDraft(field('DateTime'), iso)).toBe('2026-09-22T08:30')
  })
  it('texto passa direto', () => expect(gridFieldValue(field('String'), ' Pedágio ')).toBe(' Pedágio '))
})
