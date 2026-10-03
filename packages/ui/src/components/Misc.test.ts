import { expect, it } from 'vitest'
import { initials } from './Misc'

it('tira as iniciais do primeiro e do último nome', () => {
  expect(initials('Marina Lopes')).toBe('ML')
  expect(initials('João Pedro de Araújo')).toBe('JA')
  expect(initials('Renan')).toBe('R')
  expect(initials('  ')).toBe('')
})
