// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LookupCell } from '@betinhos/ui'
import { afterEach, expect, it } from 'vitest'
import { RegistrosAbriveis } from './RegistrosAbriveis'
import { fecharGavetaRegistro, gavetaRegistroAberta } from './registroAberto'

afterEach(() => { cleanup(); fecharGavetaRegistro() })

it('lookup de tabela com gaveta abre o registro sem código próprio; sem destino vira texto', () => {
  render(<RegistrosAbriveis>
    <LookupCell table="cr40f_veiculos" id="v1">TST1A11</LookupCell>
    <LookupCell table="cr40f_solicitantes" id="s1">Sem tela</LookupCell>
  </RegistrosAbriveis>)
  expect(screen.queryByRole('button', { name: 'Abrir Sem tela' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Abrir TST1A11' }))
  expect(gavetaRegistroAberta()).toEqual({ table: 'cr40f_veiculos', id: 'v1' })
})
