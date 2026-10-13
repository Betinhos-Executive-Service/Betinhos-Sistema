// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { findItem } from './menu'
import { applyRouteFromSearch, hashFromSearch, hrefFor, parseHash, queryFromHash, routeFromHash, setHashQuery } from './useHashRoute'

afterEach(() => { history.replaceState(null, '', '#') })

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

describe('hashFromSearch (sitemap do model-driven: ?data=rota)', () => {
  it('converte data=geral em #/geral quando não há hash', () => {
    expect(hashFromSearch('?data=geral', '')).toBe('#/geral')
    expect(hashFromSearch('?data=geral', '#/')).toBe('#/geral')
    expect(hashFromSearch('?data=%2Fgeral', '')).toBe('#/geral')
  })
  it('preserva a query da rota codificada em data', () => {
    const next = hashFromSearch('?data=geral%3Fview%3Da%26q%3Dx', '')!
    expect(routeFromHash(next)).toBe('geral')
    expect(queryFromHash(next).get('view')).toBe('a')
    expect(queryFromHash(next).get('q')).toBe('x')
  })
  it('não sobrepõe uma rota já presente no hash e ignora data vazio', () => {
    expect(hashFromSearch('?data=geral', '#/frota')).toBeNull()
    expect(hashFromSearch('?data=', '')).toBeNull()
    expect(hashFromSearch('', '')).toBeNull()
    expect(hashFromSearch('?outro=1', '')).toBeNull()
  })
})

describe('applyRouteFromSearch', () => {
  it('troca a URL por replaceState mantendo pathname e query', () => {
    const calls: unknown[][] = []
    const win = {
      location: { pathname: '/WebResources/x.html', search: '?data=geral', hash: '' },
      history: { replaceState: (...args: unknown[]) => calls.push(args) },
    } as unknown as Pick<Window, 'location' | 'history'>
    expect(applyRouteFromSearch(win)).toBe('#/geral')
    expect(calls).toEqual([[null, '', '/WebResources/x.html?data=geral#/geral']])
  })
  it('não mexe na URL sem data', () => {
    const win = { location: { pathname: '/', search: '', hash: '#/frota' }, history: { replaceState: () => { throw new Error('não deveria') } } } as unknown as Pick<Window, 'location' | 'history'>
    expect(applyRouteFromSearch(win)).toBeNull()
  })
})

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
