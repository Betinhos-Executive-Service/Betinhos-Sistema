import { describe, expect, it } from 'vitest'
import type { Encerrado, Pessoa } from './types'
import { contagens, destinoDaLinha, destinoDoEncerrado, filtrarEncerrados, filtrarLinhas, linhasDaMatriz, textoEncerrado } from './matriz'

const p = (id: string, nome: string, extra: Partial<Pessoa> = {}): Pessoa => ({ id, nome, email: `${nome.split(' ')[0].toLowerCase()}@exemplo.test`, perfis: { areas: {}, acessos: false }, admin: false, amplo: false, alteradoEm: null, temFicha: false, ...extra })
const pessoas = [
  p('1', 'Ana Admin', { admin: true, amplo: true, temFicha: true, fichaId: 'f1' }),
  p('2', 'Bruno Operador', { perfis: { areas: { financeiro: 'operador', rh: 'gestor' }, acessos: true } }),
  p('3', 'Célia Base'),
  p('4', 'Davi Amplo', { amplo: true }),
]
const enc: Encerrado[] = [{ id: '9', nome: 'Elisa Fora', email: 'elisa@exemplo.test', encerradoEm: new Date('2026-11-10T15:00:00Z'), encerradoPor: 'Ana Admin', fichaId: 'f9' }, { id: '8', nome: 'Fábio Fora', email: 'f@exemplo.test', encerradoEm: null, encerradoPor: 'Ana Admin' }]

describe('matriz de acessos por papel', () => {
  const linhas = linhasDaMatriz(pessoas)
  it('mostra Operador, Gestor ou traço por área', () => {
    expect(linhas[1].areas).toEqual({ operacional: '—', financeiro: 'Operador', frota: '—', rh: 'Gestor' })
    expect(linhas[1].adminAcessos).toBe(true)
  })
  it('Administrador do Sistema vale Gestor em tudo e Admin de acessos', () => {
    expect(Object.values(linhas[0].areas)).toEqual(['Gestor', 'Gestor', 'Gestor', 'Gestor'])
    expect(linhas[0].adminAcessos).toBe(true)
    expect(linhas[0].soBase).toBe(false)
  })
  it('conta os chips', () => {
    expect(contagens(linhas, enc)).toEqual({ todos: 4, amplo: 2, base: 2, encerrados: 2 })
  })
  it('filtra por chip e por busca (nome ou e-mail, sem acento)', () => {
    expect(filtrarLinhas(linhas, 'amplo', '').map((l) => l.id)).toEqual(['1', '4'])
    expect(filtrarLinhas(linhas, 'base', '').map((l) => l.id)).toEqual(['3', '4'])
    expect(filtrarLinhas(linhas, 'todos', 'celia')).toHaveLength(1)
    expect(filtrarLinhas(linhas, 'todos', 'bruno@')).toHaveLength(1)
    expect(filtrarLinhas(linhas, 'amplo', 'davi')).toHaveLength(1)
    expect(filtrarEncerrados(enc, 'elisa')).toHaveLength(1)
  })
  it('clique: ficha na aba Acesso, ou gaveta quando não há ficha', () => {
    expect(destinoDaLinha(linhas[0])).toBe('#/funcionarios?ficha=f1&secao=acesso')
    expect(destinoDaLinha(linhas[1])).toBe('#/acessos?ver=2')
    expect(destinoDoEncerrado(enc[0])).toBe('#/funcionarios?ficha=f9&secao=acesso')
    expect(destinoDoEncerrado(enc[1])).toBeNull()
  })
  it('texto do encerrado', () => {
    expect(textoEncerrado(enc[0])).toBe('Encerrado em 10/11/2026 por Ana Admin')
    expect(textoEncerrado(enc[1])).toBe('Encerrado em data não registrada por Ana Admin')
  })
})
