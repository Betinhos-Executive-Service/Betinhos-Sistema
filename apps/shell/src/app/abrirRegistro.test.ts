// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { fundoDaGaveta, instalarVoltarDaGaveta, openGridRecord } from './abrirRegistro'
import { patchHashQuery } from '../nav/useHashRoute'

let desinstalar: (() => void) | undefined
afterEach(() => { desinstalar?.(); vi.restoreAllMocks() })

it('fechar a gaveta aberta de outra lista volta para ela', () => {
  desinstalar = instalarVoltarDaGaveta()
  const back = vi.spyOn(history, 'back').mockImplementation(() => undefined)
  location.hash = '#/funcionarios?ficha=abc&voltar=1'
  patchHashQuery({ ficha: 'def' })
  expect(back).not.toHaveBeenCalled()
  patchHashQuery({ ficha: null })
  expect(back).toHaveBeenCalledOnce()
})

it('sem voltar=1, fechar a gaveta fica na tela', () => {
  desinstalar = instalarVoltarDaGaveta()
  const back = vi.spyOn(history, 'back').mockImplementation(() => undefined)
  location.hash = '#/funcionarios?ficha=abc'
  patchHashQuery({ ficha: null })
  expect(back).not.toHaveBeenCalled()
})

it('gaveta aberta da Geral guarda a Geral como fundo, também numa gaveta aberta de dentro da outra', () => {
  location.hash = '#/geral?view=abc'
  openGridRecord('cr40f_funcionarios', '{11111111-1111-1111-1111-111111111111}')
  expect(location.hash).toBe('#/funcionarios?ficha=11111111-1111-1111-1111-111111111111&voltar=1')
  expect(fundoDaGaveta(location.hash)).toBe('#/geral?view=abc')
  openGridRecord('cr40f_veiculos', '22222222-2222-2222-2222-222222222222')
  expect(fundoDaGaveta(location.hash)).toBe('#/geral?view=abc')
  location.hash = '#/funcionarios'
  expect(fundoDaGaveta(location.hash)).toBeNull()
})

it('OP aberta da Geral abre a tela inteira: a gaveta só acharia a OP no período carregado', () => {
  location.hash = '#/geral?view=abc'
  openGridRecord('cr40f_financeiro', '33333333-3333-3333-3333-333333333333')
  expect(location.hash).toBe('#/ops?abrir=33333333-3333-3333-3333-333333333333&voltar=1')
  expect(fundoDaGaveta(location.hash)).toBeNull()
})
