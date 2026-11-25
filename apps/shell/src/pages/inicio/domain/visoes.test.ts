import { describe, expect, it } from 'vitest'
import { acessosDoMock, TODOS } from '../../../app/acessos'
import { visoesPermitidas } from './visoes'

describe('visoesPermitidas', () => {
  it('por perfil, na ordem do seletor', () => {
    expect(visoesPermitidas(TODOS)).toEqual(['operacao', 'financeiro', 'ti_marketing', 'gestao'])
    expect(visoesPermitidas(acessosDoMock('financeiro:operador'))).toEqual(['operacao', 'financeiro', 'gestao'])
    expect(visoesPermitidas(acessosDoMock('operacional:gestor'))).toEqual(['operacao'])
    expect(visoesPermitidas(acessosDoMock('frota:operador'))).toEqual(['operacao'])
    expect(visoesPermitidas(acessosDoMock('rh:gestor'))).toEqual([])
    expect(visoesPermitidas(acessosDoMock('acessos'))).toEqual([])
  })
})
