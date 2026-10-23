// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FuncionarioView } from '../data/types'
import { FuncionarioTable } from './FuncionarioTable'

const row = (id: string, nome: string, funcao: number, semApp?: boolean): FuncionarioView => ({
  id, values: { cr40f_nomecompleto: nome, cr40f_funcao: funcao, cr40f_status: 0 }, veiculo: null, fotoThumb: null, fotoUrl: null, assinaturaUrl: null, loginsesenhas: null, modifiedon: null, alertas: [], semApp,
})

afterEach(cleanup)

describe('FuncionarioTable: selo Sem app', () => {
  it('aparece só na linha do motorista sem acesso', () => {
    render(<FuncionarioTable rows={[row('1', 'Ana Sem', 202410000, true), row('2', 'Bia Com', 202410000, false), row('3', 'Caio Adm', 202410001, false)]} onOpen={() => {}} />)
    expect(screen.getAllByText('Sem app')).toHaveLength(1)
    const linha = screen.getByText('Ana Sem').closest('[role="row"], tr') as HTMLElement
    expect(within(linha).getByText('Sem app')).toBeTruthy()
  })
})
