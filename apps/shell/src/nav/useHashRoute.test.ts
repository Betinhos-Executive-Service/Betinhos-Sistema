import { describe, expect, it } from 'vitest'
import { hrefFor, queryFromHash, routeFromHash } from './useHashRoute'

describe('routeFromHash', () => {
  it('devolve o id da rota e ignora a query', () => {
    expect(routeFromHash('#/geral')).toBe('geral')
    expect(routeFromHash('#/geral?view=a&q=x')).toBe('geral')
    expect(routeFromHash('#/cr40f_clientes1?')).toBe('cr40f_clientes1')
    expect(routeFromHash('')).toBe('')
    expect(routeFromHash('#/')).toBe('')
  })
})

describe('queryFromHash', () => {
  it('lê os parâmetros depois do ponto de interrogação', () => {
    const params = queryFromHash('#/geral?view=mock-hoje&q=OS+10')
    expect(params.get('view')).toBe('mock-hoje')
    expect(params.get('q')).toBe('OS 10')
  })
  it('sem query devolve parâmetros vazios', () => {
    expect([...queryFromHash('#/geral')]).toEqual([])
    expect([...queryFromHash('')]).toEqual([])
  })
})

describe('hrefFor', () => {
  it('sem parâmetros mantém o formato antigo', () => {
    expect(hrefFor('geral')).toBe('#/geral')
    expect(hrefFor('geral', new URLSearchParams())).toBe('#/geral')
    expect(hrefFor('geral', {})).toBe('#/geral')
  })
  it('anexa a query quando há parâmetros e ela volta íntegra pela leitura', () => {
    const href = hrefFor('geral', { view: 'a b', q: 'x&y' })
    expect(href.startsWith('#/geral?')).toBe(true)
    expect(routeFromHash(href)).toBe('geral')
    const params = queryFromHash(href)
    expect(params.get('view')).toBe('a b')
    expect(params.get('q')).toBe('x&y')
    expect(hrefFor('geral', new URLSearchParams('view=a'))).toBe('#/geral?view=a')
  })
})
