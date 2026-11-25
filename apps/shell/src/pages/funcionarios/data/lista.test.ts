import { describe, expect, it } from 'vitest'
import { emptyFilters, matchesFilters, readFilters, type TableFilters } from '@betinhos/ui'
import { withAlertas } from './filters'
import { acessosDoMock, TODOS } from '../../../app/acessos'
import { alertasDoPerfil, camposDoPerfil, colunasDoPerfil, FUNCIONARIO_DEFAULT_FILTERS, FUNCIONARIO_FIELDS, builtinViews, fromLegacyFilters, matchesAlerta, matchesKeyword, readFuncionario, sortFuncionarios } from './lista'
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
    const semMascara = withAlertas([row('9', { cr40f_nomecompleto: 'Caio', cr40f_numerodocpf: '52998224725', cr40f_telefonepessoal: '11987654321' })], '2026-10-01')[0]
    expect(matchesKeyword(semMascara, '529.982.247-25')).toBe(true)
    expect(matchesKeyword(semMascara, '(11) 98765-4321')).toBe(true)
    expect(matchesKeyword(semMascara, 'caio 98765')).toBe(true)
    expect(matchesKeyword(semMascara, 'caio 1234')).toBe(false)
    expect(rows.filter((r) => matchesAlerta(r, 'aniversario')).map((r) => r.id)).toEqual(['3'])
  })

  it('ordena por nome sem acento', () => {
    expect(sortFuncionarios(rows, { key: 'nome', dir: 'asc' }).map((r) => r.id)).toEqual(['3', '1', '2'])
  })
})

describe('lista por perfil', () => {
  const chaves = (itens: { key: string }[]) => itens.map((i) => i.key)

  it('admin e RH Operador veem todas as colunas; RH Operador perde só o chip de aniversários', () => {
    for (const a of [TODOS, acessosDoMock('rh:operador')]) expect(chaves(colunasDoPerfil(a))).toEqual(['nome', 'apelido', 'funcao', 'status', 'contato', 'veiculo', 'cnh', 'aso', 'admissao'])
    expect(alertasDoPerfil(TODOS)).toEqual(['cnh', 'aso', 'aniversario'])
    expect(alertasDoPerfil(acessosDoMock('rh:operador'))).toEqual(['cnh', 'aso'])
    expect(alertasDoPerfil(acessosDoMock('rh:gestor'))).toEqual(['cnh', 'aso', 'aniversario'])
  })

  it('Administrador de acessos: sem CNH, ASO, admissão e vínculo', () => {
    const a = acessosDoMock('acessos')
    expect(chaves(colunasDoPerfil(a))).toEqual(['nome', 'apelido', 'funcao', 'status', 'contato', 'veiculo'])
    expect(chaves(camposDoPerfil(a))).not.toContain('vinculo')
    expect(chaves(camposDoPerfil(a))).not.toContain('cnh')
    expect(alertasDoPerfil(a)).toEqual([])
  })
})
