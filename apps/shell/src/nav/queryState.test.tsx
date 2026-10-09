// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { gravarInteiros, lerDia, lerInteiros, useQueryAlvo, useQueryBandeira, useQueryConjunto, useQueryFilters, useQueryId, useQueryPagina, useQueryPeriodo, useQueryTexto, type QueryCodec } from './queryState'
import { patchHashQuery } from './useHashRoute'

beforeEach(() => { history.replaceState(null, '', '#/lista') })

type F = { q: string; status: number[] }
const codec: QueryCodec<F> = {
  chaves: ['q', 'status'],
  ler: (q) => ({ q: q.get('q') ?? '', status: lerInteiros(q, 'status') ?? [] }),
  gravar: (f) => ({ q: f.q || null, status: gravarInteiros(f.status) }),
}

it('patchHashQuery mescla, remove com null e grava listas sem perder o resto', () => {
  patchHashQuery({ a: '1', b: ['x', 'y'] })
  patchHashQuery({ c: '2', a: null })
  expect(location.hash).toBe('#/lista?b=x&b=y&c=2')
  patchHashQuery({ b: [] })
  expect(location.hash).toBe('#/lista?c=2')
})

it('várias alterações no mesmo tick se acumulam', () => {
  patchHashQuery({ a: '1' })
  patchHashQuery({ b: '2' })
  expect(location.hash).toBe('#/lista?a=1&b=2')
})

it('vírgula e dois-pontos ficam legíveis no link', () => {
  patchHashQuery({ status: '0,2', registro: 'multa:abc' })
  expect(location.hash).toBe('#/lista?status=0,2&registro=multa:abc')
})

it('lerDia rejeita datas impossíveis; lerInteiros separa ausente de vazio', () => {
  expect(lerDia(new URLSearchParams('d=2026-02-31'), 'd')).toBeNull()
  expect(lerDia(new URLSearchParams('d=2026-02-28'), 'd')).toBe('2026-02-28')
  expect(lerInteiros(new URLSearchParams(''), 'status')).toBeNull()
  expect(lerInteiros(new URLSearchParams('status='), 'status')).toEqual([])
  expect(lerInteiros(new URLSearchParams('status=1,x,3'), 'status')).toEqual([1, 3])
})

it('useQueryFilters lê a URL, grava ao alterar e volta a página para a 1', () => {
  history.replaceState(null, '', '#/lista?q=ana&status=1,2&pagina=3')
  const { result } = renderHook(() => ({ filtros: useQueryFilters(codec), pagina: useQueryPagina() }))
  expect(result.current.filtros[0]).toEqual({ q: 'ana', status: [1, 2] })
  expect(result.current.pagina[0]).toBe(3)
  act(() => result.current.filtros[1]({ q: 'bia', status: [] }))
  expect(location.hash).toBe('#/lista?q=bia')
  expect(result.current.filtros[0]).toEqual({ q: 'bia', status: [] })
  expect(result.current.pagina[0]).toBe(1)
})

it('a semente só entra na URL quando ela não traz nenhum filtro da tela', () => {
  renderHook(() => useQueryFilters(codec, () => ({ q: 'ultima', status: [4] })))
  expect(location.hash).toBe('#/lista?q=ultima&status=4')
  history.replaceState(null, '', '#/lista?status=')
  renderHook(() => useQueryFilters(codec, () => ({ q: 'ultima', status: [4] })))
  expect(location.hash).toBe('#/lista?status=')
})

it('alvo da gaveta: ver, editar e novo são excludentes', () => {
  const { result } = renderHook(() => useQueryAlvo())
  expect(result.current[0]).toBeNull()
  act(() => result.current[1]({ mode: 'view', id: 'p1' }))
  expect(location.hash).toBe('#/lista?ver=p1')
  act(() => result.current[1]({ mode: 'edit', id: 'p1' }))
  expect(location.hash).toBe('#/lista?editar=p1')
  expect(result.current[0]).toEqual({ mode: 'edit', id: 'p1' })
  act(() => result.current[1]({ mode: 'create' }))
  expect(location.hash).toBe('#/lista?novo=1')
  act(() => result.current[1](null))
  expect(location.hash).toBe('#/lista')
})

it('useQueryId, useQueryTexto e useQueryPeriodo usam o padrão quando a URL não diz nada', () => {
  const padrao = { de: '2025-10-01', ate: '2026-09-30' }
  const { result } = renderHook(() => ({ id: useQueryId('ficha'), texto: useQueryTexto('status', '3'), periodo: useQueryPeriodo('de', 'ate', padrao) }))
  expect(result.current.id[0]).toBeNull()
  expect(result.current.texto[0]).toBe('3')
  expect(result.current.periodo[0]).toEqual(padrao)
  act(() => result.current.texto[1](''))
  expect(location.hash).toBe('#/lista?status=')
  expect(result.current.texto[0]).toBe('')
  act(() => result.current.texto[1]('3'))
  expect(location.hash).toBe('#/lista')
  act(() => result.current.periodo[1]({ de: '2026-01-01', ate: padrao.ate }))
  expect(location.hash).toBe('#/lista?de=2026-01-01')
  expect(result.current.periodo[0]).toEqual({ de: '2026-01-01', ate: '2026-09-30' })
  // Intervalo invertido na URL cai no padrão.
  act(() => patchHashQuery({ de: '2027-01-01' }))
  expect(result.current.periodo[0]).toEqual(padrao)
})

it('useQueryBandeira e useQueryConjunto: abrir/fechar itens, alternar sem perder o que já estava e descartar sumidos', () => {
  const { result } = renderHook(() => ({ aberto: useQueryBandeira('menu'), linhas: useQueryConjunto('linha') }))
  expect(result.current.aberto[0]).toBe(false)
  act(() => result.current.aberto[1](true))
  expect(location.hash).toBe('#/lista?menu=1')
  act(() => result.current.aberto[1](false))
  expect(location.hash).toBe('#/lista')

  act(() => { result.current.linhas.alternar('a'); result.current.linhas.alternar('b') })
  expect(location.hash).toBe('#/lista?linha=a&linha=b')
  expect([...result.current.linhas.valores]).toEqual(['a', 'b'])
  act(() => result.current.linhas.alternar('a'))
  expect(location.hash).toBe('#/lista?linha=b')
  // Lista ainda vazia (carregando) não apaga nada; com a lista carregada, só ficam os que existem.
  act(() => result.current.linhas.manter(new Set()))
  expect(location.hash).toBe('#/lista?linha=b')
  act(() => result.current.linhas.manter(new Set(['z'])))
  expect(location.hash).toBe('#/lista')
})
