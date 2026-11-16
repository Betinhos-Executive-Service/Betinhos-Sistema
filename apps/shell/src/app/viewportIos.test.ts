import { describe, expect, it, vi } from 'vitest'
import { deslocado, instalarCorrecaoViewportIos } from './viewportIos'

function alvoFalso(estado: { scrollY?: number; offsetTop?: number }) {
  const ouvintes: Record<string, () => void> = {}
  const alvo = {
    scrollX: 0,
    scrollY: estado.scrollY ?? 0,
    scrollTo: vi.fn(),
    addEventListener: (tipo: string, fn: () => void) => { ouvintes[tipo] = fn },
    visualViewport: { offsetTop: estado.offsetTop ?? 0, offsetLeft: 0, addEventListener: (tipo: string, fn: () => void) => { ouvintes[`vv:${tipo}`] = fn } },
  }
  return { alvo, ouvintes }
}

describe('correção do viewport no app instalado do iOS', () => {
  it('detecta documento rolado ou visual viewport deslocado', () => {
    expect(deslocado(alvoFalso({}).alvo as never)).toBe(false)
    expect(deslocado(alvoFalso({ scrollY: 47 }).alvo as never)).toBe(true)
    expect(deslocado(alvoFalso({ offsetTop: -47 }).alvo as never)).toBe(true)
  })

  it('volta o documento para 0 quando o iOS o desloca', async () => {
    const { alvo, ouvintes } = alvoFalso({})
    instalarCorrecaoViewportIos(alvo as never)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(alvo.scrollTo).not.toHaveBeenCalled()

    alvo.visualViewport.offsetTop = 47
    ouvintes['vv:resize']!()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(alvo.scrollTo).toHaveBeenCalledWith(0, 0)
  })
})
