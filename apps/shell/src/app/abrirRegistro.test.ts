// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { openGridRecord } from './abrirRegistro'
import { TABELAS_COM_GAVETA, fecharGavetaRegistro, gavetaRegistroAberta } from './registroAberto'

afterEach(() => { fecharGavetaRegistro(); vi.unstubAllGlobals() })

const id = 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa'

it('toda tabela com tela no shell abre a gaveta por cima da lista e não troca a rota', () => {
  const navigateTo = vi.fn(async () => undefined)
  vi.stubGlobal('Xrm', { Navigation: { navigateTo } })
  location.hash = '#/composicao?q=ana'
  for (const table of TABELAS_COM_GAVETA) {
    void openGridRecord(table, `{${id}}`)
    expect(gavetaRegistroAberta()).toEqual({ table, id })
  }
  expect(location.hash).toBe('#/composicao?q=ana')
  expect(navigateTo).not.toHaveBeenCalled()
})

it('tabela sem tela no shell não abre a gaveta', () => {
  vi.stubGlobal('Xrm', { Navigation: { navigateTo: vi.fn(async () => undefined) } })
  void openGridRecord('cr40f_solicitantes', id)
  expect(gavetaRegistroAberta()).toBeNull()
})
