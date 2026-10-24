import { describe, expect, it } from 'vitest'
import { createMockSource } from './mock'
import { semApp } from './semApp'

const MOTORISTA = 202410000
const ativos = new Set(['ana@betinhos.com.br'])

describe('semApp', () => {
  it('marca só motorista sem e-mail ou sem systemuser habilitado', () => {
    expect(semApp({ cr40f_funcao: MOTORISTA, cr40f_emailmicrosoft: null }, ativos)).toBe(true)
    expect(semApp({ cr40f_funcao: MOTORISTA, cr40f_emailmicrosoft: 'joao@betinhos.com.br' }, ativos)).toBe(true)
    expect(semApp({ cr40f_funcao: MOTORISTA, cr40f_emailmicrosoft: ' Ana@Betinhos.com.br ' }, ativos)).toBe(false)
    expect(semApp({ cr40f_funcao: 202410001, cr40f_emailmicrosoft: null }, ativos)).toBe(false)
  })

  it('mock: lista marca motoristas sem acesso e não marca Carlos (ativo) nem administrativos', async () => {
    const rows = await createMockSource().list()
    const por = (id: string) => rows.find((row) => row.id === id)?.semApp
    expect(por('m1')).toBe(false)
    expect(por('m2')).toBe(true)
    expect(por('m9')).toBe(true)
    expect(por('m4')).toBe(false)
  })
})
