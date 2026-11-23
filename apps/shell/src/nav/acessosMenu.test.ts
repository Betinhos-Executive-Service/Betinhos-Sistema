import { describe, expect, it } from 'vitest'
import { NENHUM, TODOS, lerPapeis, temAlgum, type Acessos } from '../app/acessos'
import { menuVisivel, perfisDoItem } from './acessosMenu'
import { MENU } from './menu'

const ids = (grupos: { items: { id: string }[] }[]) => grupos.flatMap((g) => g.items.map((i) => i.id))

describe('menuVisivel', () => {
  it('quem tem todos os perfis vê o menu inteiro', () => {
    expect(ids(menuVisivel(TODOS))).toEqual(ids(MENU))
  })

  it('quem só tem o Base vê só as rotas livres, e grupo vazio some', () => {
    const visivel = menuVisivel(NENHUM)
    expect(ids(visivel).sort()).toEqual(['inicio', 'planner'])
    expect(visivel.every((g) => g.items.length > 0)).toBe(true)
  })

  it('Financeiro vê o que é do Financeiro e não o que é só do Operacional', () => {
    const a = lerPapeis(['Perfil - Financeiro - Operador'])
    const visivel = ids(menuVisivel(a))
    expect(visivel).toContain('despesas-operacionais')
    expect(visivel).not.toContain('geral')
    expect(visivel.every((id) => temAlgum(a, perfisDoItem(id)))).toBe(true)
  })

  it('rota livre não tem perfis', () => {
    expect(perfisDoItem('inicio')).toBeUndefined()
    expect(perfisDoItem('geral')).toEqual(['operacional'])
  })

  it('Acessos aparece só para Administrador de acessos e para o Administrador do Sistema', () => {
    const ver = (a: Acessos) => ids(menuVisivel(a))
    expect(ver({ admin: false, areas: { financeiro: 'gestor' }, acessos: false })).not.toContain('acessos')
    expect(ver({ admin: false, areas: {}, acessos: true })).toContain('acessos')
    expect(ver(TODOS)).toContain('acessos')
  })
})
