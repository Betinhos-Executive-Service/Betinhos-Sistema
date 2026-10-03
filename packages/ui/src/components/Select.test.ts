import { expect, it } from 'vitest'
import { filterOptions, normalizeSearch } from './Select'

const options = [
  { value: '1', label: 'João Araújo', subtitle: 'Embraer' },
  { value: '2', label: 'Marina Lopes', subtitle: 'Tenaris', search: 'mari' },
  { value: '3', label: 'Carlos Prado' },
]

it('ignora acento e caixa', () => {
  expect(normalizeSearch('  JOÃO Araújo ')).toBe('joao araujo')
  expect(filterOptions(options, 'joao').map((option) => option.value)).toEqual(['1'])
})

it('busca todas as palavras no rótulo, no subtítulo e no texto extra', () => {
  expect(filterOptions(options, 'lopes tenaris').map((option) => option.value)).toEqual(['2'])
  expect(filterOptions(options, 'mari').map((option) => option.value)).toEqual(['2'])
  expect(filterOptions(options, 'embraer').map((option) => option.value)).toEqual(['1'])
})

it('sem texto devolve todas; sem correspondência devolve vazio', () => {
  expect(filterOptions(options, '  ')).toBe(options)
  expect(filterOptions(options, 'xyz')).toEqual([])
})
