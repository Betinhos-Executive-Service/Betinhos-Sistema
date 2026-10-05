import { expect, it, vi } from 'vitest'
import { createShellHeaderStore } from './ShellHeader'
import { pageToolbarClassName } from './PageToolbar'

it('começa vazio e devolve o registro da tela', () => {
  const store = createShellHeaderStore()
  expect(store.get()).toBeNull()
  const entry = { title: 'Ocorrências' }
  store.register(entry)
  expect(store.get()).toBe(entry)
})

it('sair limpa o próprio registro e avisa quem escuta', () => {
  const store = createShellHeaderStore()
  const listener = vi.fn()
  store.subscribe(listener)
  const unregister = store.register({ title: 'A' })
  unregister()
  expect(store.get()).toBeNull()
  expect(listener).toHaveBeenCalledTimes(2)
})

it('a tela anterior saindo depois não apaga o registro da nova', () => {
  const store = createShellHeaderStore()
  const leaveA = store.register({ title: 'A' })
  store.register({ title: 'B' })
  leaveA()
  expect(store.get()).toEqual({ title: 'B' })
})

it('parar de escutar não recebe mais avisos', () => {
  const store = createShellHeaderStore()
  const listener = vi.fn()
  store.subscribe(listener)()
  store.register({ title: 'A' })
  expect(listener).not.toHaveBeenCalled()
})

it('classe do PageToolbar por variante', () => {
  expect(pageToolbarClassName()).toBe('bt-page-toolbar bt-page-toolbar--filters')
  expect(pageToolbarClassName('utility', 'extra')).toBe('bt-page-toolbar bt-page-toolbar--utility extra')
})
