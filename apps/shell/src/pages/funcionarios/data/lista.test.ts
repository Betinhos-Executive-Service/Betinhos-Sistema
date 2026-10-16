import { describe, expect, it } from 'vitest'
import { emptyFilters, matchesFilters, readFilters, type TableFilters } from '@betinhos/ui'
import { withAlertas } from './filters'
import { FUNCIONARIO_DEFAULT_FILTERS, FUNCIONARIO_FIELDS, builtinViews, fromLegacyFilters, matchesAlerta, matchesKeyword, readFuncionario, sortFuncionarios } from './lista'
import type { Funcionario } from './types'

function row(id: string, values: Funcionario['values']): Funcionario {
  return { id, values, veiculo: null, fotoThumb: null, fotoUrl: null, assinaturaUrl: null, loginsesenhas: null, modifiedon: null }
}

const rows = withAlertas([
  row('1', { cr40f_nomecompleto: 'João Ávila', new_apelido: 'Jota', cr40f_status: 0, cr40f_funcao: 202410000, cr40f_numerodocpf: '529.982.247-25', cr40f_validadedacnh: '2026-10-10', cr40f_nomedaempresa: 202410001 }),
  row('2', { cr40f_nomecompleto: 'Maria Lopes', cr40f_status: 1, cr40f_funcao: 202410000, cr40f_validadedacnh: '2026-10-10' }),
  row('3', { cr40f_nomecompleto: 'Ana Reis', cr40f_status: 2, cr40f_funcao: 202410001, cr40f_datadeaniversario: '1990-10-03' }),
], '2026-10-01')

const ids = (filters: TableFilters) => rows.filter((r) => matchesFilters(r, readFilters(filters, FUNCIONARIO_FIELDS), FUNCIONARIO_FIELDS, readFuncionario)).map((r) => r.id)
const view = (id: string) => (JSON.parse(builtinViews().find((v) => v.id === id)!.config) as { filters: TableFilters }).filters

describe('lista de funcionários (Design System)', () => {
  it('Visão padrão esconde desligados; prontas cobrem todos, motoristas ativos e desligados', () => {
    expect(ids(FUNCIONARIO_DEFAULT_FILTERS)).toEqual(['1', '3'])
    expect(ids(view('todos'))).toEqual(['1', '2', '3'])
    expect(ids(view('motoristas'))).toEqual(['1'])
    expect(ids(view('desligados'))).toEqual(['2'])
    expect(ids(emptyFilters())).toEqual(['1', '2', '3'])
  })

  it('links antigos com status, função e empresa', () => {
    expect(ids(fromLegacyFilters({ status: [1], funcao: null, empresa: null, vinculo: null }))).toEqual(['2'])
    expect(ids(fromLegacyFilters({ status: [0, 2], funcao: 202410001, empresa: null, vinculo: null }))).toEqual(['3'])
    expect(ids(fromLegacyFilters({ status: [], funcao: null, empresa: 202410001, vinculo: null }))).toEqual(['1'])
  })

  it('busca sem acento e por CPF sem pontuação; chips de alerta fora da visão', () => {
    expect(rows.filter((r) => matchesKeyword(r, 'avila')).map((r) => r.id)).toEqual(['1'])
    expect(rows.filter((r) => matchesKeyword(r, '52998224725')).map((r) => r.id)).toEqual(['1'])
    expect(rows.filter((r) => matchesAlerta(r, 'aniversario')).map((r) => r.id)).toEqual(['3'])
  })

  it('ordena por nome sem acento', () => {
    expect(sortFuncionarios(rows, { key: 'nome', dir: 'asc' }).map((r) => r.id)).toEqual(['3', '1', '2'])
  })
})
