// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell, type AppShellProps } from '@betinhos/ui'

const groups: AppShellProps['groups'] = [{ id: 'operacional', label: 'Operacional', icon: <span>O</span>, items: [{ id: 'geral', label: 'Geral', href: '#/geral' }] }]
const brand = { name: 'Betinhos' }

/** `desktop` liga a media query `(min-width: 821px)`. */
function viewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: desktop && query.includes('min-width: 821px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
}
const shell = (props: Partial<AppShellProps> = {}) => (
  <AppShell brand={brand} groups={groups} activeId="geral" title="Geral" {...props}>conteúdo</AppShell>
)
const isRail = () => screen.getByRole('navigation', { name: 'Menu principal' }).classList.contains('bt-shell__rail')

beforeEach(() => { window.localStorage.clear(); viewport(true) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AppShell: defaultCollapsed', () => {
  it('sem preferência salva, no desktop, abre no trilho e não grava nada', () => {
    render(shell({ defaultCollapsed: true }))
    expect(isRail()).toBe(true)
    expect(window.localStorage.getItem('bt-shell-collapsed')).toBeNull()
  })

  it('sem o pedido, abre expandido', () => {
    render(shell())
    expect(isRail()).toBe(false)
  })

  it('a preferência salva vence o padrão, nos dois sentidos', () => {
    window.localStorage.setItem('bt-shell-collapsed', '0')
    const first = render(shell({ defaultCollapsed: true }))
    expect(isRail()).toBe(false)
    first.unmount()
    window.localStorage.setItem('bt-shell-collapsed', '1')
    render(shell())
    expect(isRail()).toBe(true)
  })

  it('no celular não recolhe', () => {
    viewport(false)
    render(shell({ defaultCollapsed: true }))
    expect(screen.getByRole('navigation', { name: 'Menu principal' }).classList.contains('bt-shell__rail')).toBe(false)
  })

  it('sem collapsible, o pedido é ignorado', () => {
    render(shell({ defaultCollapsed: true, collapsible: false }))
    expect(isRail()).toBe(false)
  })

  it('ao navegar para uma tela que pede o trilho, recolhe; com preferência salva, não', () => {
    const view = render(shell())
    expect(isRail()).toBe(false)
    view.rerender(shell({ defaultCollapsed: true }))
    expect(isRail()).toBe(true)
    expect(window.localStorage.getItem('bt-shell-collapsed')).toBeNull()
    view.unmount()

    window.localStorage.setItem('bt-shell-collapsed', '0')
    const saved = render(shell())
    saved.rerender(shell({ defaultCollapsed: true }))
    expect(isRail()).toBe(false)
  })
})
