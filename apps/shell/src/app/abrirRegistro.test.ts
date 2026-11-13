// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { instalarVoltarDaGaveta } from './abrirRegistro'
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
