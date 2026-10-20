import { describe, expect, it } from 'vitest'
import type { Posse, Ref, Veiculo } from '../data/types'
import { motoristaAtual, possesAbertas, rotuloMotoristaAtual } from './motoristaAtual'

const ana: Ref = { id: 'f1', label: 'Ana' }
const bruno: Ref = { id: 'f2', label: 'Bruno' }
const base: Ref = { id: 'b1', label: 'Base Centro' }
const v1: Ref = { id: 'v1', label: 'ABC1D23' }

const veiculo = (motorista: Ref | null): Veiculo => ({ id: 'v1', placa: 'ABC1D23', marca: null, modelo: null, cor: null, anoModelo: null, status: null, categoria: null, motorista, hodometro: null, hodometroEm: null })
const posse = (id: string, extra: Partial<Posse>): Posse => ({ id, inicio: '2026-09-01T12:00:00Z', fim: null, veiculo: v1, motorista: null, localBase: null, ...extra })
const atual = (cadastro: Ref | null, posses: Posse[]) => motoristaAtual(veiculo(cadastro), possesAbertas(posses))

describe('motoristaAtual', () => {
  it('usa o motorista da posse aberta mesmo quando o cadastro diverge', () => {
    expect(atual(ana, [posse('p1', { motorista: bruno })])).toEqual({ tipo: 'motorista', motorista: bruno, fonte: 'posse' })
  })

  it('posse aberta sem motorista é carro na base, com o local', () => {
    const resultado = atual(ana, [posse('p1', { localBase: base })])
    expect(resultado).toEqual({ tipo: 'base', local: base })
    expect(rotuloMotoristaAtual(resultado)).toBe('Na base · Base Centro')
  })

  it('na base sem local informado mostra só "Na base"', () => {
    expect(rotuloMotoristaAtual(atual(null, [posse('p1', {})]))).toBe('Na base')
  })

  it('ignora posses encerradas e cai no cadastro como fallback', () => {
    const resultado = atual(ana, [posse('p1', { motorista: bruno, fim: '2026-09-10T12:00:00Z' })])
    expect(resultado).toEqual({ tipo: 'motorista', motorista: ana, fonte: 'cadastro' })
    expect(rotuloMotoristaAtual(resultado)).toBe('Ana')
  })

  it('sem posse aberta e sem cadastro não há motorista', () => {
    const resultado = atual(null, [])
    expect(resultado).toEqual({ tipo: 'sem' })
    expect(rotuloMotoristaAtual(resultado)).toBeNull()
  })

  it('com duas posses abertas vale a de início mais recente', () => {
    const posses = [posse('p1', { motorista: ana, inicio: '2026-08-01T12:00:00Z' }), posse('p2', { motorista: bruno, inicio: '2026-09-20T12:00:00Z' })]
    expect(atual(null, posses)).toMatchObject({ motorista: bruno })
    expect(atual(null, [...posses].reverse())).toMatchObject({ motorista: bruno })
  })

  it('não mistura posses de outro veículo', () => {
    expect(atual(ana, [posse('p1', { veiculo: { id: 'v2', label: 'EFG4H56' }, motorista: bruno })])).toMatchObject({ fonte: 'cadastro', motorista: ana })
  })
})
