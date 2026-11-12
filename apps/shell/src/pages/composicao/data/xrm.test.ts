// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getXrmHost } from './xrm'

afterEach(() => vi.unstubAllGlobals())

describe('contexto Xrm', () => {
  it('usa o Xrm da própria página (o shell é a página de cima)', () => {
    const local = { WebApi: { source: 'local' } }
    vi.stubGlobal('window', { Xrm: local, parent: { Xrm: { WebApi: { source: 'parent' } } } })
    expect(getXrmHost()).toBe(local)
  })

  it('não inventa contexto Dataverse no modo local', () => {
    vi.stubGlobal('window', { parent: {} })
    expect(getXrmHost()).toBeUndefined()
  })
})
