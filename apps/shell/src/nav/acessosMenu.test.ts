import { describe, expect, it } from 'vitest'
import { NENHUM, TODOS, lerPapeis, temAlgum, type Acessos } from '../app/acessos'
import { menuVisivel, perfisDoItem } from './acessosMenu'
import { MENU } from './menu'

const ids = (grupos: { items: { id: string }[] }[]) => grupos.flatMap((g) => g.items.map((i) => i.id))

describe('menuVisivel', () => {
  it('quem tem todos os perfis vê o menu inteiro, menos as rotas fora do menu', () => {
    expect(ids(menuVisivel(TODOS))).toEqual(ids(MENU).filter((id) => id !== 'acessos'))
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

  it('Acessos sem ficha não tem item no menu, mas a rota segue com a guarda do perfil', () => {
    for (const a of [TODOS, { admin: false, areas: {}, acessos: true }, NENHUM]) expect(ids(menuVisivel(a))).not.toContain('acessos')
    expect(perfisDoItem('acessos')).toEqual(['acessos'])
    expect(MENU.flatMap((g) => g.items).some((i) => i.id === 'acessos')).toBe(true)
  })

  it('Funcionários abre para RH e para o Administrador de acessos', () => {
    const ver = (a: Acessos) => ids(menuVisivel(a))
    expect(ver({ admin: false, areas: {}, acessos: true })).toContain('funcionarios')
    expect(ver(lerPapeis(['Perfil - RH - Operador']))).toContain('funcionarios')
    expect(ver({ admin: false, areas: { financeiro: 'gestor' }, acessos: false })).not.toContain('funcionarios')
  })

  it('Configuração do App Motoristas pede Operacional no nível Gestor, como a página e o servidor', () => {
    const ver = (a: Acessos) => ids(menuVisivel(a))
    expect(ver(lerPapeis(['Perfil - Operacional - Gestor']))).toContain('app-motoristas')
    expect(ver(lerPapeis(['Perfil - Operacional - Operador']))).not.toContain('app-motoristas')
    expect(ver({ admin: false, areas: {}, acessos: true })).not.toContain('app-motoristas')
  })
})
