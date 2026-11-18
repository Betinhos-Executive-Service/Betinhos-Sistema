// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fecharGavetaRegistro, gavetaRegistroAberta as lerGaveta } from '../../../app/registroAberto'
import { openGridRecord } from './record-navigation'

afterEach(() => { vi.unstubAllGlobals(); fecharGavetaRegistro() })

const id = 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa'

describe('navegação da grade', () => {
  it('tabela com tela no shell abre a gaveta por cima da lista, sem trocar de rota', () => {
    const navigateTo = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { navigateTo } })
    location.hash = '#/geral?f=abc'
    void openGridRecord('cr40f_funcionarios', `{${id}}`)
    expect(lerGaveta()).toEqual({ table: 'cr40f_funcionarios', id })
    void openGridRecord('cr40f_clientes1', id)
    expect(lerGaveta()).toEqual({ table: 'cr40f_clientes1', id })
    expect(location.hash).toBe('#/geral?f=abc')
    expect(navigateTo).not.toHaveBeenCalled()
  })

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
    void openGridRecord('cr40f_solicitantes', `{${id}}`)
    expect(navigateTo).toHaveBeenCalledWith({ pageType: 'entityrecord', entityName: 'cr40f_solicitantes', entityId: id }, { target: 2, position: 2, width: { value: 50, unit: '%' } })
  })

  it('sem navigateTo usa o openForm', () => {
    const openForm = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { openForm } })
    void openGridRecord('cr40f_solicitantes', id)
    expect(openForm).toHaveBeenCalledWith({ entityName: 'cr40f_solicitantes', entityId: id })
  })

  it('por URL direta (shim sem navegação) abre o registro em aba nova', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    vi.stubGlobal('Xrm', { Navigation: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm2.dynamics.com/' }) } })
    void openGridRecord('cr40f_solicitantes', id)
    expect(open).toHaveBeenCalledWith(`https://org.crm2.dynamics.com/main.aspx?pagetype=entityrecord&etn=cr40f_solicitantes&id=${id}`, '_blank', 'noopener')
  })
})
