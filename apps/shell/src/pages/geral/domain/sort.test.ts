import { describe, expect, it } from 'vitest'
import { nextSort } from './sort'
import type { Column, Sort } from './types'

const col = (attribute: string): Column => ({ key: attribute, attribute, alias: null, entity: null, width: 100 })
const asc = (attribute: string): Sort => ({ attribute, alias: null, descending: false })
const desc = (attribute: string): Sort => ({ attribute, alias: null, descending: true })

describe('nextSort', () => {
  it('coluna comum: crescente, decrescente, ordem da visão', () => {
    const fallback = asc('data')
    expect(nextSort(null, fallback, col('trajeto'))).toEqual(asc('trajeto'))
    expect(nextSort(asc('trajeto'), fallback, col('trajeto'))).toEqual(desc('trajeto'))
    expect(nextSort(desc('trajeto'), fallback, col('trajeto'))).toBeNull()
  })
  it('vindo de outra coluna, recomeça crescente', () => {
    expect(nextSort(desc('trajeto'), asc('data'), col('status'))).toEqual(asc('status'))
  })
  it('coluna que a visão ordena de forma crescente: primeiro clique inverte, depois volta, depois ordem da visão', () => {
    const fallback = asc('data')
    expect(nextSort(null, fallback, col('data'))).toEqual(desc('data'))
    expect(nextSort(desc('data'), fallback, col('data'))).toEqual(asc('data'))
    expect(nextSort(asc('data'), fallback, col('data'))).toBeNull()
  })
  it('coluna que a visão ordena de forma decrescente começa crescente', () => {
    const fallback = desc('data')
    expect(nextSort(null, fallback, col('data'))).toEqual(asc('data'))
    expect(nextSort(asc('data'), fallback, col('data'))).toEqual(desc('data'))
    expect(nextSort(desc('data'), fallback, col('data'))).toBeNull()
  })
  it('sem ordem na visão, começa crescente', () => {
    expect(nextSort(null, null, col('data'))).toEqual(asc('data'))
  })
})
