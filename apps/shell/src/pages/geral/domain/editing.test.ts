import { describe, expect, it } from 'vitest'
import { decideChoice, decideCommit, draftOf, lookupOptions } from './editing'

describe('decideCommit', () => {
  it('texto sem mudança (ignorando espaços nas pontas) não grava', () => {
    expect(decideCommit('text', ' Rota ', 'Rota', false)).toBeNull()
    expect(decideCommit('memo', '', null, false)).toBeNull()
  })
  it('texto alterado grava o rascunho', () => {
    expect(decideCommit('text', 'Nova', 'Rota', false)).toEqual({ submit: 'Nova' })
  })
  it('dinheiro inválido devolve erro e não grava', () => {
    expect(decideCommit('money', 'abc', 300, false)).toEqual({ error: 'Valor inválido.' })
  })
  it('dinheiro vazio grava null só se havia valor', () => {
    expect(decideCommit('money', '  ', 300, false)).toEqual({ submit: null })
    expect(decideCommit('money', '', null, false)).toBeNull()
  })
  it('dinheiro válido e diferente grava o número', () => {
    expect(decideCommit('money', '1.234,50', 300, false)).toEqual({ submit: 1234.5 })
    expect(decideCommit('money', '300,00', 300, false)).toBeNull()
  })
  it('data pela metade (badInput) devolve erro', () => {
    expect(decideCommit('datetime', '', '2026-10-06T09:00:00Z', true)).toEqual({ error: 'Data ou hora inválida.' })
  })
  it('data igual não grava; diferente grava o valor local', () => {
    expect(decideCommit('datetime', '2026-10-06T06:00', '2026-10-06T09:00:00Z', false)).toBeNull()
    expect(decideCommit('datetime', '2026-10-06T07:00', '2026-10-06T09:00:00Z', false)).toEqual({ submit: '2026-10-06T07:00' })
  })
})

describe('decideChoice', () => {
  it('choice grava o número só se mudou', () => {
    expect(decideChoice('choice', '2', 1, 'X')).toEqual({ submit: 2 })
    expect(decideChoice('choice', '1', 1, 'X')).toBeNull()
  })
  it('lookup compara ids sem diferenciar caixa e limpar grava null', () => {
    expect(decideChoice('lookup', 'ABC', 'abc', 'Ana')).toBeNull()
    expect(decideChoice('lookup', 'def', 'abc', 'Ana')).toEqual({ submit: { id: 'def', nome: 'Ana' } })
    expect(decideChoice('lookup', null, 'abc', '')).toEqual({ submit: null })
    expect(decideChoice('lookup', null, null, '')).toBeNull()
  })
})

describe('draftOf e lookupOptions', () => {
  it('formata dinheiro e data para o controle', () => {
    expect(draftOf('money', { v: 1234.5 }, 'v')).toBe('1234,50')
    expect(draftOf('datetime', { v: '2026-10-06T09:00:00Z' }, 'v')).toBe('2026-10-06T06:00')
    expect(draftOf('text', { v: null }, 'v')).toBe('')
  })
  it('lookup mantém a opção atual no topo com a caixa do id da linha', () => {
    const keep = { value: 'abc', label: 'Ana' }
    expect(lookupOptions([{ id: 'ABC', nome: 'Ana' }, { id: 'def', nome: 'Beto' }], keep)).toEqual([{ value: 'abc', label: 'Ana' }, { value: 'def', label: 'Beto' }])
    expect(lookupOptions([{ id: 'def', nome: 'Beto' }], keep)[0]).toEqual(keep)
    expect(lookupOptions(null, null)).toEqual([])
  })
})
