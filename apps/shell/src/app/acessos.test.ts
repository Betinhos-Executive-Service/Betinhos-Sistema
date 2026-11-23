import { describe, expect, it } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import { NENHUM, TODOS, acessosDoMock, lerPapeis, nomesDosPapeis, semModulos, temAlgum, temPerfil } from './acessos'

describe('lerPapeis', () => {
  it('Administrador do Sistema vale como todos os perfis', () => {
    expect(lerPapeis(['Administrador do Sistema'])).toEqual(TODOS)
    expect(lerPapeis(['System Administrator', 'Perfil - Base'])).toEqual(TODOS)
  })

  it('lê área e nível; Gestor vence Operador', () => {
    const a = lerPapeis(['Perfil - Base', 'Perfil - Financeiro - Operador', 'Perfil - RH - Operador', 'Perfil - RH - Gestor'])
    expect(a).toEqual({ admin: false, areas: { financeiro: 'operador', rh: 'gestor' }, acessos: false })
  })

  it('reconhece o Administrador de acessos e ignora papel desconhecido', () => {
    expect(lerPapeis(['Perfil - Administrador de acessos', 'Acesso-Betinhos-MDA'])).toEqual({ admin: false, areas: {}, acessos: true })
  })
})

describe('temPerfil', () => {
  const a = lerPapeis(['Perfil - Financeiro - Operador', 'Perfil - Frota - Gestor'])
  it('Operador alcança a área, mas não o nível Gestor', () => {
    expect(temPerfil(a, 'financeiro')).toBe(true)
    expect(temPerfil(a, 'financeiro', 'gestor')).toBe(false)
    expect(temPerfil(a, 'frota', 'gestor')).toBe(true)
    expect(temPerfil(a, 'rh')).toBe(false)
    expect(temPerfil(a, 'acessos')).toBe(false)
  })
  it('rota sem perfis é livre; com perfis basta um', () => {
    expect(temAlgum(NENHUM, undefined)).toBe(true)
    expect(temAlgum(a, ['rh', 'frota'])).toBe(true)
    expect(temAlgum(a, ['rh'])).toBe(false)
  })
  it('semModulos só para quem tem apenas o Base', () => {
    expect(semModulos(NENHUM)).toBe(true)
    expect(semModulos(a)).toBe(false)
    expect(semModulos({ admin: false, areas: {}, acessos: true })).toBe(false)
  })
})

describe('nomesDosPapeis', () => {
  it('junta papéis diretos e os das equipes', async () => {
    const pedidos: string[] = []
    const client = {
      request: async (path: string) => {
        pedidos.push(path)
        if (path === 'WhoAmI') return { UserId: '{AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}' }
        if (path.includes('systemuserroles_association')) return { value: [{ name: 'Perfil - Base' }] }
        if (path.includes('teammembership_association')) return { value: [{ teamid: 't1' }] }
        if (path.startsWith('teams(t1)/teamroles_association')) return { value: [{ name: 'Administrador do Sistema' }] }
        throw new Error(`caminho inesperado: ${path}`)
      },
    } as unknown as DataverseClient
    expect(await nomesDosPapeis(client)).toEqual(['Perfil - Base', 'Administrador do Sistema'])
    expect(pedidos[1]).toContain('systemusers(aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)')
  })
})

describe('acessosDoMock', () => {
  it('sem parâmetro assume todos os perfis', () => {
    expect(acessosDoMock(null)).toEqual(TODOS)
  })
  it('lê a lista do parâmetro', () => {
    expect(acessosDoMock('financeiro:operador,rh:gestor,acessos')).toEqual({ admin: false, areas: { financeiro: 'operador', rh: 'gestor' }, acessos: true })
    expect(acessosDoMock('nenhum')).toEqual(NENHUM)
  })
  it('erro simula a falha de leitura', () => {
    expect(() => acessosDoMock('erro')).toThrow()
  })
})
