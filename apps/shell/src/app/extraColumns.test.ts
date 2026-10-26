import { describe, expect, it } from 'vitest'
import { createMockExtraSource, expandQuery, extraCatalog, extraFields, readValues, resolveExtras, sortByExtra, type ExtraValues, type ResolvedExtra } from './extraColumns'

const tel: ResolvedExtra = { key: 'x:cr40f_motorista/cr40f_telefone', label: 'Motorista › Telefone', navs: ['cr40f_motorista'], attr: { name: 'cr40f_telefone', label: 'Telefone', kind: 'text' } }
const placa: ResolvedExtra = { key: 'x:cr40f_motorista/cr40f_veiculo/cr40f_placa', label: 'Motorista › Veículo › Placa', navs: ['cr40f_motorista', 'cr40f_veiculo'], attr: { name: 'cr40f_placa', label: 'Placa', kind: 'text' } }
const dono: ResolvedExtra = { key: 'x:ownerid', label: 'Proprietário', navs: [], attr: { name: 'ownerid', label: 'Proprietário', kind: 'text', lookup: true } }
const criado: ResolvedExtra = { key: 'x:createdon', label: 'Criado em', navs: [], attr: { name: 'createdon', label: 'Criado em', kind: 'date' } }

describe('expandQuery', () => {
  it('junta campos da própria tabela e expande relações aninhadas uma vez', () => {
    expect(expandQuery([tel, placa, dono, criado])).toBe(
      ',_ownerid_value,createdon&$expand=cr40f_motorista($select=cr40f_telefone;$expand=cr40f_veiculo($select=cr40f_placa))',
    )
  })
})

describe('readValues', () => {
  it('segue as navegações, usa o texto formatado e converte data', () => {
    const row = {
      _ownerid_value: 'guid', '_ownerid_value@OData.Community.Display.V1.FormattedValue': 'Renan',
      createdon: '2026-10-20T12:00:00Z', 'createdon@OData.Community.Display.V1.FormattedValue': '20/10/2026',
      cr40f_motorista: { cr40f_telefone: '(12) 99999-0000', cr40f_veiculo: null },
    }
    const v = readValues(row, [tel, placa, dono, criado])
    expect(v[tel.key]).toEqual({ raw: '(12) 99999-0000', text: '(12) 99999-0000' })
    expect(v[placa.key]).toEqual({ raw: null, text: '' })
    expect(v[dono.key]).toEqual({ raw: 'Renan', text: 'Renan' })
    expect(v[criado.key].raw).toEqual(new Date('2026-10-20T12:00:00Z'))
    expect(v[criado.key].text).toBe('20/10/2026')
  })
})

describe('sortByExtra', () => {
  it('ordena números e deixa vazios no fim nos dois sentidos', () => {
    const vals: Record<string, number | null> = { a: 3, b: null, c: 1 }
    const rows = ['a', 'b', 'c']
    const of = (id: string) => ({ raw: vals[id], text: '' })
    expect(sortByExtra(rows, 'x:v', 'asc', of)).toEqual(['c', 'a', 'b'])
    expect(sortByExtra(rows, 'x:v', 'desc', of)).toEqual(['a', 'c', 'b'])
  })
})

describe('extraFields', () => {
  it('choice oferece os rótulos presentes nas linhas', () => {
    const status: ResolvedExtra = { key: 'x:statuscode', label: 'Status', navs: [], attr: { name: 'statuscode', label: 'Status', kind: 'choice' } }
    const values: ExtraValues = new Map([['1', { 'x:statuscode': { raw: 'Pendente', text: 'Pendente' } }], ['2', { 'x:statuscode': { raw: 'Ativo', text: 'Ativo' } }]])
    expect(extraFields([status, tel], values)).toEqual([
      { key: 'x:statuscode', label: 'Status', kind: 'choice', options: [{ value: 'Ativo', label: 'Ativo' }, { value: 'Pendente', label: 'Pendente' }] },
      { key: tel.key, label: tel.label, kind: 'text', money: undefined },
    ])
  })
})

describe('catálogo e resolução (mock)', () => {
  const source = createMockExtraSource()
  it('lista campos e relações e abre até o terceiro nível', async () => {
    const catalog = extraCatalog(source, 'lista')
    expect((await catalog.load([])).filter((e) => e.relation).map((e) => e.id)).toEqual(['cr40f_cliente', 'ownerid'])
    expect((await catalog.load(['cr40f_cliente', 'cr40f_gestor', 'cr40f_cargo'])).map((e) => e.label)).toEqual(['Nome'])
    expect(await catalog.load(['nao_existe'])).toEqual([])
  })
  it('ignora caminho que saiu da metadata e caminho fundo demais', async () => {
    const r = await resolveExtras(source, 'lista', [
      { key: 'x:cr40f_cliente/cr40f_gestor/cr40f_telefone', label: 'Cliente › Gestor › Telefone' },
      { key: 'x:cr40f_cliente/campo_removido', label: 'X' },
      { key: 'x:a/b/c/d/e', label: 'Fundo' },
      { key: 'createdon' },
    ])
    expect(r.map((c) => c.key)).toEqual(['x:cr40f_cliente/cr40f_gestor/cr40f_telefone'])
    expect(r[0].navs).toEqual(['cr40f_cliente', 'cr40f_gestor'])
  })
})
