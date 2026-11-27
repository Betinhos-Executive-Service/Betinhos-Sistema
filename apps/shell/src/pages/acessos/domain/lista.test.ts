import { describe, expect, it } from 'vitest'
import { pessoaKeywordText, readPessoa, sortPessoas } from './lista'
import type { Pessoa } from './types'

const p = (nome: string, extra: Partial<Pessoa> = {}): Pessoa => ({ id: nome, nome, email: `${nome.toLowerCase()}@exemplo.test`, perfis: { areas: {}, acessos: false }, admin: false, amplo: false, alteradoEm: null, temFicha: false, ...extra })

describe('lista de acessos', () => {
  it('o filtro de última alteração usa o dia de São Paulo', () => {
    expect(readPessoa(p('Ana', { alteradoEm: new Date('2026-11-21T01:00:00Z') }), 'alterado')).toBe('2026-11-20')
  })

  it('lê o nível de cada área para o filtro', () => {
    const pessoa = p('Bruno', { perfis: { areas: { financeiro: 'gestor' }, acessos: true } })
    expect(readPessoa(pessoa, 'financeiro')).toBe('gestor')
    expect(readPessoa(pessoa, 'rh')).toBe('nenhum')
    expect(readPessoa(pessoa, 'acessos')).toBe('sim')
    expect(readPessoa(p('Carla', { admin: true }), 'admin')).toBe('sim')
  })
  it('ordena por nome e deixa sem data por último', () => {
    const lista = [p('Carla'), p('Ana', { alteradoEm: new Date('2026-11-20T12:00:00Z') }), p('Bruno', { alteradoEm: new Date('2026-11-22T12:00:00Z') })]
    expect(sortPessoas(lista, 'nome', 'asc').map((x) => x.nome)).toEqual(['Ana', 'Bruno', 'Carla'])
    expect(sortPessoas(lista, 'alterado', 'desc').map((x) => x.nome)).toEqual(['Bruno', 'Ana', 'Carla'])
  })
  it('a busca acha por nome, e-mail e perfil', () => {
    const texto = pessoaKeywordText(p('Bruno', { perfis: { areas: { frota: 'operador' }, acessos: false } }))
    expect(texto).toContain('bruno@exemplo.test')
    expect(texto).toContain('Frota · Operador')
  })
})
