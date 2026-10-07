import { describe, expect, it } from 'vitest'
import { duplicateMessage, findDuplicates } from './duplicates'
import { passedThreshold, resolveDrop, settleDelta } from './drag'
import { makeCurriculo as make } from './fixtures'

describe('duplicidade', () => {
  const list = [
    make({ id: 'a', nome: 'Ana', cpf: '123.456.789-01', telefone: '(11) 98888-2001' }),
    make({ id: 'b', nome: 'Bruno', whatsapp: '+55 11 3333-4444' }),
  ]
  it('acha CPF e telefone só por dígitos', () => {
    expect(findDuplicates({ cpf: '12345678901', telefone: '', whatsapp: '' }, list, null)).toEqual([{ kind: 'CPF', id: 'a', nome: 'Ana' }])
    expect(findDuplicates({ cpf: '', telefone: '1133334444', whatsapp: '' }, list, null)).toEqual([{ kind: 'telefone', id: 'b', nome: 'Bruno' }])
    expect(duplicateMessage({ kind: 'CPF', id: 'a', nome: 'Ana' })).toBe('Já existe um currículo com este CPF: Ana')
  })
  it('ignora o próprio registro e números curtos', () => {
    expect(findDuplicates({ cpf: '123.456.789-01', telefone: '(11) 98888-2001', whatsapp: '' }, list, 'a')).toEqual([])
    expect(findDuplicates({ cpf: '123', telefone: '2001', whatsapp: '' }, list, null)).toEqual([])
  })
})

describe('arrasto', () => {
  it('só começa depois de 6 px', () => {
    expect(passedThreshold(3, 4)).toBe(false)
    expect(passedThreshold(6, 0)).toBe(true)
  })
  it('ignora soltar na mesma coluna ou fora', () => {
    expect(resolveDrop(1, 1)).toBeNull()
    expect(resolveDrop(1, null)).toBeNull()
    expect(resolveDrop(1, 2)).toBe(2)
  })
  it('calcula o deslocamento do assentamento', () => {
    expect(settleDelta({ left: 300, top: 120 }, { left: 40, top: 200 })).toEqual({ x: 260, y: -80 })
  })
})
