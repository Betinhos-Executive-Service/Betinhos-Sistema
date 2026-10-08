// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { findItem } from './menu'
import { hrefFor, parseHash, routeFromHash, setHashQuery } from './useHashRoute'

afterEach(() => { history.replaceState(null, '', '#') })

it('separa id e query: o menu continua achando a tela pelo id', () => {
  expect(routeFromHash('#/dashboard?tab=servicos')).toBe('dashboard')
  expect(parseHash('#/dashboard?tab=servicos').query.get('tab')).toBe('servicos')
  expect(findItem(routeFromHash('#/dashboard?tab=servicos'))?.item).toMatchObject({ kind: 'page', page: 'dashboard' })
  expect(routeFromHash('#/new_dashboard')).toBe('new_dashboard')
  expect(parseHash('#/new_dashboard').query.toString()).toBe('')
  expect(routeFromHash('')).toBe('')
})

it('id codificado volta decodificado', () => {
  expect(routeFromHash(hrefFor('custom-page-funções'))).toBe('custom-page-funções')
})

it('setHashQuery troca só a query, sem mudar a tela', () => {
  location.hash = '#/dashboard'
  setHashQuery({ tab: 'servicos' })
  expect(location.hash).toBe('#/dashboard?tab=servicos')
  setHashQuery(new URLSearchParams())
  expect(location.hash).toBe('#/dashboard')
})
