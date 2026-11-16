import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  // O ambiente do teste pode não ter requestAnimationFrame: o quadro roda na hora.
  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 0 }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('detecta documento rolado ou visual viewport deslocado', () => {
    expect(deslocado(alvoFalso({}).alvo as never)).toBe(false)
    expect(deslocado(alvoFalso({ scrollY: 47 }).alvo as never)).toBe(true)
    expect(deslocado(alvoFalso({ offsetTop: -47 }).alvo as never)).toBe(true)
  })

  it('volta o documento para 0 quando o iOS o desloca', () => {
    const { alvo, ouvintes } = alvoFalso({})
    instalarCorrecaoViewportIos(alvo as never)
    expect(alvo.scrollTo).not.toHaveBeenCalled()

    alvo.visualViewport.offsetTop = 47
    ouvintes['vv:resize']!()
    expect(alvo.scrollTo).toHaveBeenCalledWith(0, 0)
  })
})
