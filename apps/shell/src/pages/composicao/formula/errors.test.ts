import { expect, it } from 'vitest'
import { formulaErrorMessage } from './errors'

it('mostra a mensagem de rejeições do Xrm que não são instâncias de Error', () => {
  expect(formulaErrorMessage({ message: 'Acesso negado ao registro.' })).toBe('Acesso negado ao registro.')
  expect(formulaErrorMessage({ error: { message: 'Custom API não encontrada.' } })).toBe('Custom API não encontrada.')
})
