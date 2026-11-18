// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { AppShell } from './AppShell'
import { aplicarTema, lerTema, TEMA_STORAGE_KEY, useTema } from './tema'

const html = () => document.documentElement.dataset.theme

describe('tema', () => {
  beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme })
  afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.theme })

  it('o padrão é sistema e aplica data-theme="auto" no html', () => {
    expect(lerTema()).toBe('sistema')
    const { result } = renderHook(() => useTema())
    expect(result.current[0]).toBe('sistema')
    expect(html()).toBe('auto')
  })

  it('escolher escuro ou claro aplica no html e persiste', () => {
    const { result } = renderHook(() => useTema())
    act(() => result.current[1]('escuro'))
    expect(html()).toBe('dark')
    expect(localStorage.getItem(TEMA_STORAGE_KEY)).toBe('escuro')
    act(() => result.current[1]('claro'))
    expect(html()).toBe('light')
    expect(localStorage.getItem(TEMA_STORAGE_KEY)).toBe('claro')
  })

  it('lê a preferência salva e ignora valor inválido', () => {
    localStorage.setItem(TEMA_STORAGE_KEY, 'escuro')
    expect(renderHook(() => useTema()).result.current[0]).toBe('escuro')
    localStorage.setItem(TEMA_STORAGE_KEY, 'roxo')
    expect(lerTema()).toBe('sistema')
  })

  it('storage que lança não derruba: segue o sistema e a escolha vale na sessão', () => {
    const original = Storage.prototype.getItem
    const originalSet = Storage.prototype.setItem
    Storage.prototype.getItem = () => { throw new Error('bloqueado') }
    Storage.prototype.setItem = () => { throw new Error('bloqueado') }
    try {
      const { result } = renderHook(() => useTema())
      expect(result.current[0]).toBe('sistema')
      act(() => result.current[1]('escuro'))
      expect(html()).toBe('dark')
    } finally {
      Storage.prototype.getItem = original
      Storage.prototype.setItem = originalSet
    }
  })

  it('aplicarTema não grava nada', () => {
    aplicarTema('escuro')
    expect(html()).toBe('dark')
    expect(localStorage.getItem(TEMA_STORAGE_KEY)).toBeNull()
  })

  it('o botão do rodapé alterna Claro → Escuro → Sistema', () => {
    render(<AppShell activeId="inicio" title="Início" entityLabels={new Map()} connection={{ ok: true, text: 'Conectado' }}><p>conteúdo</p></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: /Tema: Sistema/ }))
    expect(html()).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: /Tema: Claro/ }))
    expect(html()).toBe('dark')
    expect(localStorage.getItem(TEMA_STORAGE_KEY)).toBe('escuro')
    fireEvent.click(screen.getByRole('button', { name: /Tema: Escuro/ }))
    expect(html()).toBe('auto')
  })
})
