// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { baixarPdf } from './baixar'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('baixarPdf', () => {
  it('cria o link com o nome do arquivo, clica e revoga a URL depois', () => {
    vi.useFakeTimers()
    const criar = vi.fn(() => 'blob:x')
    const revogar = vi.fn()
    Object.assign(URL, { createObjectURL: criar, revokeObjectURL: revogar })
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('a.pdf'); expect(this.href).toBe('blob:x') })
    baixarPdf(new Uint8Array([1, 2]), 'a.pdf')
    expect(clique).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revogar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revogar).toHaveBeenCalledWith('blob:x')
  })
})
