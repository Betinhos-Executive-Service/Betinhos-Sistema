import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, buildStages, cargoOptions, choiceLabel, filterCurriculos, groupByStage, hasFilters, type Filters } from './funnel'
import { makeCurriculo as make } from './fixtures'

const STATUS = [
  { value: 100000000, label: 'Novo' }, { value: 100000001, label: 'Em análise' }, { value: 100000002, label: 'Aprovado para banco' },
  { value: 100000003, label: 'Reprovado' }, { value: 100000004, label: 'Contratado' },
]

describe('etapas', () => {
  it('ordena pelo funil e não pela metadata', () => {
    const stages = buildStages(STATUS)
    expect(stages.map((s) => s.key)).toEqual(['novo', 'analise', 'aprovado', 'contratado', 'reprovado'])
    expect(stages[2]).toMatchObject({ value: 100000002, short: 'Aprovado p/ banco', tone: 'success', confirm: false })
    expect(stages.filter((s) => s.confirm).map((s) => s.key)).toEqual(['contratado', 'reprovado'])
    expect(choiceLabel(STATUS, 100000001)).toBe('Em análise')
    expect(choiceLabel(STATUS, null)).toBe('')
  })
  it('agrupa e manda status vazio para Novo', () => {
    const stages = buildStages(STATUS)
    const groups = groupByStage([make({ id: '1' }), make({ id: '2', status: 100000003 }), make({ id: '3', status: 100000000 })], stages)
    expect(groups.get(100000000)?.map((c) => c.id)).toEqual(['1', '3'])
    expect(groups.get(100000003)?.map((c) => c.id)).toEqual(['2'])
    expect(groups.get(100000004)).toEqual([])
  })
})

describe('filtros', () => {
  const list = [
    make({ id: '1', nome: 'João Prado', cidade: 'São Paulo', telefone: '(11) 98888-2001', cargo: 'Motorista executivo', cnh: 1, origem: 2, nota: 9 }),
    make({ id: '2', nome: 'Elaine Souza', cidade: 'Santo André', telefone: '(11) 3333-4444', cargo: 'motorista executivo ', cnh: 2, origem: 3, nota: 5 }),
    make({ id: '3', nome: 'Karina', cidade: 'Rio', cargo: 'Assistente' }),
  ]
  const ids = (f: Partial<Filters>) => filterCurriculos(list, { ...EMPTY_FILTERS, ...f }).map((c) => c.id)

  it('busca sem acento por nome, cidade e telefone', () => {
    expect(ids({ query: 'joao' })).toEqual(['1'])
    expect(ids({ query: 'santo andre' })).toEqual(['2'])
    expect(ids({ query: '3333-44' })).toEqual(['2'])
    expect(ids({ query: '98888' })).toEqual(['1'])
  })
  it('combina cargo, CNH, origem e nota mínima', () => {
    expect(ids({ cargo: 'Motorista executivo' })).toEqual(['1', '2'])
    expect(ids({ cnh: 2 })).toEqual(['2'])
    expect(ids({ origem: 2 })).toEqual(['1'])
    expect(ids({ notaMin: 6 })).toEqual(['1'])
    expect(hasFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasFilters({ ...EMPTY_FILTERS, notaMin: 0 })).toBe(true)
  })
  it('lista cargos sem repetir', () => {
    expect(cargoOptions(list)).toEqual(['Assistente', 'Motorista executivo'])
  })
})
