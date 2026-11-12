// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openGridRecord } from './record-navigation'

afterEach(() => vi.unstubAllGlobals())

describe('navegação da grade', () => {
  it('abre Geral no webresource da organização atual em modo de edição', () => {
    const navigateTo = vi.fn(async () => undefined)
    const openForm = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { navigateTo, openForm } })
    const id = 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa'
    void openGridRecord('cr40f_reservadeveculos', id)
    expect(navigateTo).toHaveBeenCalledWith({ pageType: 'webresource', webresourceName: 'new_formulario_geral.html', data: JSON.stringify({ mode: 'edit', entityName: 'cr40f_reservadeveculos', id, recordId: id, entityId: id }) }, { target: 1 })
    expect(openForm).not.toHaveBeenCalled()
  })

  it('mantém o formulário nativo para outras tabelas', () => {
    const navigateTo = vi.fn(async () => undefined)
    const openForm = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { navigateTo, openForm } })
    void openGridRecord('cr40f_clientes1', 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa')
    expect(openForm).toHaveBeenCalledWith({ entityName: 'cr40f_clientes1', entityId: 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa' })
  })
})
