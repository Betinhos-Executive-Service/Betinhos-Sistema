// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openGridRecord } from './record-navigation'

afterEach(() => vi.unstubAllGlobals())

const id = 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa'

describe('navegação da grade', () => {
  it('abre Geral no Formulário Geral em painel lateral largo', () => {
    const navigateTo = vi.fn(async () => undefined)
    const openForm = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { navigateTo, openForm } })
    void openGridRecord('cr40f_reservadeveculos', id)
    expect(navigateTo).toHaveBeenCalledWith({ pageType: 'webresource', webresourceName: 'new_formulario_geral.html', data: JSON.stringify({ mode: 'edit', entityName: 'cr40f_reservadeveculos', id, recordId: id, entityId: id }) }, { target: 2, position: 2, width: { value: 75, unit: '%' } })
    expect(openForm).not.toHaveBeenCalled()
  })

  it('abre as outras tabelas no formulário nativo em painel lateral', () => {
    const navigateTo = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { navigateTo } })
    void openGridRecord('cr40f_clientes1', `{${id}}`)
    expect(navigateTo).toHaveBeenCalledWith({ pageType: 'entityrecord', entityName: 'cr40f_clientes1', entityId: id }, { target: 2, position: 2, width: { value: 50, unit: '%' } })
  })

  it('sem navigateTo usa o openForm', () => {
    const openForm = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { openForm } })
    void openGridRecord('cr40f_clientes1', id)
    expect(openForm).toHaveBeenCalledWith({ entityName: 'cr40f_clientes1', entityId: id })
  })

  it('por URL direta (shim sem navegação) abre o registro em aba nova', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    vi.stubGlobal('Xrm', { Navigation: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm2.dynamics.com/' }) } })
    void openGridRecord('cr40f_clientes1', id)
    expect(open).toHaveBeenCalledWith(`https://org.crm2.dynamics.com/main.aspx?pagetype=entityrecord&etn=cr40f_clientes1&id=${id}`, '_blank', 'noopener')
  })
})
