import { describe, expect, it } from 'vitest'
import { mapInfracao, mapMultaUso, parseMulti } from '../data/queries'
import { createMockInfracoes, createMockMultas } from '../data/mock'
import { EMPTY_FILTERS, filterInfracoes } from './filters'
import { buildPayload, emptyForm, isDirty, parseValor, toForm, validateForm, withGravidade } from './form'
import { resumoUso, usoIndex } from './uso'

const F = '@OData.Community.Display.V1.FormattedValue'
const list = createMockInfracoes()
const byCode = (c: string) => list.find((i) => i.codigo === c)!

describe('mapeamento', () => {
  it('lê multi-choice, estado e texto "null"', () => {
    const i = mapInfracao({ cr40f_infracaodetransitoid: 'ABC', cr40f_codigodainfracao: '7455', cr40f_descricaodainfracao: 'null', cr40f_competencia: '202410002,202410000', statecode: 1, cr40f_valordamulta: 130.16 })
    expect(i).toMatchObject({ id: 'abc', codigo: '7455', descricao: '', competencia: [202410000, 202410002], ativo: false, valor: 130.16, gravidade: null })
    expect(parseMulti(null)).toEqual([])
  })

  it('multa usa rótulos formatados dos lookups', () => {
    const m = mapMultaUso({ cr40f_multasid: 'M1', _cr40f_codigodainfracao_value: 'I1', _cr40f_placa_value: 'P', [`_cr40f_placa_value${F}`]: 'RTA-2B41', cr40f_status: 1, [`cr40f_status${F}`]: 'Pago', cr40f_dataehorario: '2026-05-01T12:00:00Z' })
    expect(m).toMatchObject({ id: 'm1', infracaoId: 'i1', placa: 'RTA-2B41', motorista: '', status: 'Pago' })
  })
})

describe('filtros', () => {
  const comUso = new Set(usoIndex(createMockMultas()).keys())
  it('padrão mostra só ativas', () => {
    expect(filterInfracoes(list, EMPTY_FILTERS, comUso).some((i) => !i.ativo)).toBe(false)
    expect(filterInfracoes(list, { ...EMPTY_FILTERS, situacao: 'inativas' }, comUso).map((i) => i.codigo)).toEqual(['5169'])
  })
  it('busca sem acento e por código com hífen', () => {
    expect(filterInfracoes(list, { ...EMPTY_FILTERS, query: 'semaforo' }, comUso).map((i) => i.codigo)).toEqual(['5746'])
    expect(filterInfracoes(list, { ...EMPTY_FILTERS, query: '745-5' }, comUso).map((i) => i.codigo)).toEqual(['7455'])
  })
  it('competência multi e gravidade', () => {
    const r = filterInfracoes(list, { ...EMPTY_FILTERS, competencia: 202410002, gravidade: [3] }, comUso).map((i) => i.codigo)
    expect(r).toEqual(['5010', '6050'])
  })
  it('só com multas', () => {
    expect(filterInfracoes(list, { ...EMPTY_FILTERS, comMultas: true }, comUso).every((i) => comUso.has(i.id))).toBe(true)
  })
})

describe('uso', () => {
  it('conta últimos 12 meses e ordena do mais recente', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    const d = (iso: string) => new Date(iso)
    const idx = usoIndex([
      { id: '1', infracaoId: 'a', titulo: '', status: '', placa: '', motorista: '', data: d('2025-01-01T00:00:00Z') },
      { id: '2', infracaoId: 'a', titulo: '', status: '', placa: '', motorista: '', data: d('2026-09-01T00:00:00Z') },
    ])
    expect(idx.get('a')!.map((m) => m.id)).toEqual(['2', '1'])
    expect(resumoUso(idx.get('a')!, now)).toMatchObject({ total: 2, ultimos12: 1 })
  })
})

describe('formulário', () => {
  it('aceita valor em formato brasileiro', () => {
    expect(parseValor('1.467,35')).toBe(1467.35)
    expect(parseValor('R$ 88')).toBe(88)
    expect(parseValor('293.47')).toBe(293.47)
    expect(parseValor('')).toBeNull()
    expect(parseValor('12,345')).toBeNaN()
  })

  it('gravidade sugere pontos só com pontos vazios', () => {
    expect(withGravidade(emptyForm(), '3').pontos).toBe('7')
    expect(withGravidade({ ...emptyForm(), pontos: '2' }, '3').pontos).toBe('2')
  })

  it('bloqueia código repetido, exige competência e valida pontos', () => {
    const e = validateForm({ ...emptyForm(), codigo: ' 7455 ', descricao: 'x', pontos: '30', valor: 'abc' }, list, null)
    expect(e).toMatchObject({ codigo: 'Já existe a infração 7455.', competencia: expect.any(String), pontos: expect.any(String), valor: expect.any(String) })
    const self = byCode('7455')
    expect(validateForm(toForm(self), list, self.id, toForm(self))).toEqual({})
  })

  it('não exige descrição de registro antigo sem descrição', () => {
    const antiga = { ...byCode('5002'), descricao: '' }
    expect(validateForm(toForm(antiga), list, antiga.id, toForm(antiga)).descricao).toBeUndefined()
  })

  it('payload só com o que mudou; multi-choice como texto', () => {
    const base = toForm(byCode('5185'))
    const f = { ...base, competencia: ['202410002', '202410000'], valor: '200,00' }
    expect(buildPayload(base, f)).toEqual({ cr40f_competencia: '202410000,202410002', cr40f_valordamulta: 200 })
    expect(isDirty(base, { ...base, competencia: [...base.competencia].reverse() })).toBe(false)
    const novo = buildPayload(null, { ...emptyForm(), codigo: '9999', descricao: 'Teste', competencia: ['202410000'] })
    expect(novo).toEqual({ cr40f_codigodainfracao: '9999', cr40f_descricaodainfracao: 'Teste', cr40f_competencia: '202410000', cr40f_responsabilidade: 0 })
  })
})
