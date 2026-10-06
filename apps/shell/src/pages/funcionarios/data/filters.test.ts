import { describe, expect, it } from 'vitest'
import { applyFilters, countAlertas, DEFAULT_FILTERS, withAlertas } from './filters'
import type { Funcionario } from './types'

function row(id: string, values: Funcionario['values']): Funcionario {
  return { id, values, veiculo: null, fotoThumb: null, fotoUrl: null, assinaturaUrl: null, loginsesenhas: null, modifiedon: null }
}

const rows = withAlertas([
  row('1', { cr40f_nomecompleto: 'João Ávila', new_apelido: 'Jota', cr40f_status: 0, cr40f_funcao: 202410000, cr40f_numerodocpf: '529.982.247-25', cr40f_validadedacnh: '2026-10-10' }),
  row('2', { cr40f_nomecompleto: 'Maria Lopes', cr40f_status: 1, cr40f_funcao: 202410000, cr40f_validadedacnh: '2026-10-10' }),
  row('3', { cr40f_nomecompleto: 'Ana Reis', cr40f_status: 2, cr40f_funcao: 202410001, cr40f_datadeaniversario: '1990-10-03' }),
], '2026-10-01')

describe('filtros', () => {
  it('esconde desligados por padrão e ordena por nome', () => {
    expect(applyFilters(rows, DEFAULT_FILTERS).map((item) => item.id)).toEqual(['3', '1'])
  })

  it('busca sem acento e por CPF sem pontuação', () => {
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, search: 'avila' }).map((item) => item.id)).toEqual(['1'])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, search: '52998224725' }).map((item) => item.id)).toEqual(['1'])
  })

  it('chip de alerta filtra e conta, ignorando desligados', () => {
    expect(countAlertas(rows)).toEqual({ cnh: 1, aso: 0, aniversario: 1 })
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, alerta: 'cnh' }).map((item) => item.id)).toEqual(['1'])
  })
})
