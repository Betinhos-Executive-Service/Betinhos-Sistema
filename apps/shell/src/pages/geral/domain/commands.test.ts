import { describe, expect, it } from 'vitest'
import { contar, dayWindow, PROGRAMADO, programarPatch, splitOp } from './commands'

const ms = (id: string, nome: string) => ({ id, nome })
const res = (motorista: string | null) => ({ _cr40f_motorista_value: motorista })
const rep = (id: string, n: number) => Array.from({ length: n }, () => res(id))

describe('commands', () => {
  it('splitOp separa reservas com OP', () => {
    const rows = [{ a: 1 }, { _cr40f_financeiro_value: 'x' }, { _cr40f_op_value: 'y' }, { cr40f_op: 'z' }, { _cr40f_financeiro_value: null }]
    const { ok, comOp } = splitOp(rows)
    expect(ok).toHaveLength(2)
    expect(comOp).toHaveLength(3)
  })
  it('programarPatch', () => {
    expect(PROGRAMADO).toBe(202410005)
    expect(programarPatch()).toEqual({ cr40f_status: 202410005, new_foiprogramado: true })
  })
  it('dayWindow cobre o dia de São Paulo', () => {
    expect(dayWindow('2026-10-08')).toEqual({ start: '2026-10-08T03:00:00.000Z', end: '2026-10-09T03:00:00.000Z' })
    expect(dayWindow('2026-12-31').end).toBe('2027-01-01T03:00:00.000Z')
    expect(dayWindow('2028-02-28').end).toBe('2028-02-29T03:00:00.000Z')
    expect(() => dayWindow('08/10/2026')).toThrow()
  })
  it('contar: média, tons, excluídos e ordenação', () => {
    const motoristas = [ms('a', 'Ana'), ms('b', 'Bruno'), ms('c', 'Carlos'), ms('d', 'Dani'), ms('e', 'Eva')]
    const reservas = [...rep('a', 10), ...rep('b', 5), ...rep('c', 2), ...rep('d', 2), res(null)]
    const r = contar(reservas, motoristas, new Set())
    expect(r.total).toBe(19)
    expect(r.media).toBeCloseTo(19 / 4)
    expect(r.linhas.map((l) => l.motorista.nome)).toEqual(['Ana', 'Bruno', 'Carlos', 'Dani', 'Eva'])
    expect(r.linhas.map((l) => l.tone)).toEqual(['danger', 'warning', 'success', 'success', 'neutral'])
    expect(r.linhas[1].label).toBeUndefined()
    const alto = contar([...rep('a', 3), ...rep('b', 1)], motoristas.slice(0, 2), new Set())
    expect(alto.linhas[0]).toMatchObject({ tone: 'warning', label: 'acima da média' })
    const c = contar([...rep('a', 1), ...rep('b', 5), ...rep('c', 5)], motoristas.slice(0, 3), new Set())
    expect(c.linhas.find((l) => l.motorista.id === 'a')?.tone).toBe('success')
  })
  it('contar: excluídos saem da média mas continuam na lista', () => {
    const motoristas = [ms('a', 'Ana'), ms('b', 'Bruno')]
    const r = contar([...rep('a', 10), ...rep('b', 2)], motoristas, new Set(['a']))
    expect(r.media).toBe(2)
    expect(r.linhas.find((l) => l.motorista.id === 'a')?.total).toBe(10)
    expect(r.linhas.find((l) => l.motorista.id === 'a')?.tone).toBe('danger')
  })
  it('contar: empate ordena por nome e sem serviços tudo neutro', () => {
    const r = contar([res('b'), res('a')], [ms('b', 'Zé'), ms('a', 'Ana')], new Set())
    expect(r.linhas.map((l) => l.motorista.nome)).toEqual(['Ana', 'Zé'])
    const vazio = contar([], [ms('a', 'Ana')], new Set())
    expect(vazio.media).toBe(0)
    expect(vazio.linhas[0].tone).toBe('neutral')
  })
})
