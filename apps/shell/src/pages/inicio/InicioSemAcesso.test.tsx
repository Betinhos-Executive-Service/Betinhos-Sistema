// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AcessosContext } from '../../app/AcessosProvider'
import { NENHUM } from '../../app/acessos'
import { InicioPage } from './InicioPage'

afterEach(cleanup)

it('quem só tem o Base vê a quem pedir acesso, sem carregar os blocos do Início', () => {
  render(
    <AcessosContext.Provider value={{ status: 'pronto', acessos: NENHUM, recarregar: () => {} }}>
      <InicioPage host={{ mode: 'mock' }} />
    </AcessosContext.Provider>,
  )
  expect(screen.getByText('Você ainda não tem acesso aos módulos')).toBeTruthy()
  expect(screen.getByText(/Peça ao TI da Betinhos/)).toBeTruthy()
})
