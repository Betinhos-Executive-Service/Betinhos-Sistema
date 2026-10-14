// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockData } from '../pages/documentos/data/mock'
import { DOCUMENTOS_ALTERADOS } from '../pages/documentos/data/source'
import { contarUrgentes, useDocumentosBadge } from './useDocumentosBadge'

const carregar = vi.fn(async () => createMockData('2026-10-13'))
vi.mock('../pages/documentos/data/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pages/documentos/data/source')>()),
  createDocsSource: () => ({ carregar }),
}))

afterEach(() => { carregar.mockClear() })

describe('contador de documentos', () => {
  it('soma vencidos e até 7 dias das duas categorias', () => {
    // mock: Ana CNH vencida, Bruno CNH em 6 dias, ABC1D23 CRLV em 3 dias, ABC1D23 IPVA vencido
    expect(contarUrgentes(createMockData('2026-10-13'), '2026-10-13')).toBe(4)
  })

  it('recarrega quando a tela de documentos avisa que salvou, e para de ouvir ao desmontar', async () => {
    const host = { mode: 'mock' } as const
    const { result, unmount } = renderHook(() => useDocumentosBadge(host))
    await waitFor(() => expect(result.current).toBe(4))
    expect(carregar).toHaveBeenCalledTimes(1)
    act(() => { window.dispatchEvent(new CustomEvent(DOCUMENTOS_ALTERADOS)) })
    await waitFor(() => expect(carregar).toHaveBeenCalledTimes(2))
    unmount()
    window.dispatchEvent(new CustomEvent(DOCUMENTOS_ALTERADOS))
    expect(carregar).toHaveBeenCalledTimes(2)
  })
})
