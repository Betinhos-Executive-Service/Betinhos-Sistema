import { expect, it } from 'vitest'
import { fieldIds } from './Field'

it('sem ajuda nem erro não descreve o controle', () => {
  expect(fieldIds('f1', {})).toEqual({ controlId: 'f1-control', hintId: undefined, errorId: undefined, describedBy: undefined })
})

it('descreve o controle com o erro antes da ajuda', () => {
  expect(fieldIds('f1', { hint: true, error: true }).describedBy).toBe('f1-error f1-hint')
  expect(fieldIds('f1', { hint: true }).describedBy).toBe('f1-hint')
})
