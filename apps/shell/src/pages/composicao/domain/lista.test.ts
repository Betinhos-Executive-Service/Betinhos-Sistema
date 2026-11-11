import { readFilters, type StoredView } from '@betinhos/ui'
import { describe, expect, it } from 'vitest'
import { filterRows } from '../../../app/filterRows'
import { MOCK_COMPOSICOES, composicoesPath, mapComposicao } from '../data/source'
import { builtinViews, composicaoFields, readComposicao, sortComposicoes } from './lista'

const fields = composicaoFields()
const ids = (list: { codigo: string }[]) => list.map((c) => c.codigo)
const viewFilters = (v: StoredView) => readFilters((JSON.parse(v.config) as { filters: unknown }).filters, fields)
const apply = (id: string) => ids(filterRows(MOCK_COMPOSICOES, viewFilters(builtinViews().find((v) => v.id === id)!), fields, readComposicao))

describe('ordenação', () => {
  it('ordena por coluna da Reserva (cliente) crescente e decrescente, com vazios por último', () => {
    const lista = [...MOCK_COMPOSICOES, { ...MOCK_COMPOSICOES[0], id: 'x', codigo: 'CP-SEM', cliente: '' }]
    const asc = sortComposicoes(lista, { key: 'cliente', dir: 'asc' }).map((c) => c.cliente)
    expect(asc).toEqual(['Embraer', 'Embraer', 'Johnson&Johnson', 'Particular', 'Tenaris', 'Tenaris', ''])
    const desc = sortComposicoes(lista, { key: 'cliente', dir: 'desc' }).map((c) => c.cliente)
    expect(desc).toEqual(['Tenaris', 'Tenaris', 'Particular', 'Johnson&Johnson', 'Embraer', 'Embraer', ''])
  })

  it('ordena por data de saída, por valor e por motorista vazio no fim', () => {
    expect(ids(sortComposicoes(MOCK_COMPOSICOES, { key: 'saida', dir: 'desc' }))[0]).toBe('CP-1003')
    expect(ids(sortComposicoes(MOCK_COMPOSICOES, { key: 'valorTotal', dir: 'asc' }))[0]).toBe('CP-1006')
    const motoristas = sortComposicoes(MOCK_COMPOSICOES, { key: 'motorista', dir: 'asc' }).map((c) => c.motorista)
    expect(motoristas.at(-1)).toBe('')
    expect(motoristas.at(-2)).toBe('Motorista Exemplo D')
  })

  it('ID numérico ordena como número', () => {
    const lista = ['10234', '9156', '200'].map((servicoId) => ({ ...MOCK_COMPOSICOES[0], servicoId }))
    expect(sortComposicoes(lista, { key: 'servicoId', dir: 'asc' }).map((c) => c.servicoId)).toEqual(['200', '9156', '10234'])
  })
})

describe('visões prontas', () => {
  it('Todos os CPs exclui o status de operação Cancelado', () => {
    expect(apply('todos-cps')).toEqual(['CP-1001', 'CP-1002', 'CP-1003', 'CP-1004', 'CP-1005'])
  })
  it('TenarisConfab, Johnson&Johnson e Embraer: CP pendente do cliente', () => {
    expect(apply('tenaris')).toEqual(['CP-1001', 'CP-1006'])
    expect(apply('jnj')).toEqual([])
    expect(apply('embraer')).toEqual(['CP-1003', 'CP-1004'])
  })
  it('Serviços sem CR: Embraer pendente com CR vazio', () => {
    expect(apply('sem-cr')).toEqual(['CP-1003', 'CP-1004'].filter((c) => c === 'CP-1004' || MOCK_COMPOSICOES.find((m) => m.codigo === c)!.cr === ''))
    expect(apply('sem-cr')).toEqual(['CP-1003', 'CP-1004'])
  })
  it('todas as visões prontas são lidas sem perder filtro', () => {
    for (const v of builtinViews()) {
      const f = viewFilters(v)
      expect(Object.keys(f.quick).length + f.advanced.items.length).toBeGreaterThan(0)
    }
  })
})

describe('mapComposicao', () => {
  const F = '@OData.Community.Display.V1.FormattedValue'
  const row = {
    cr40f_composicaodeprecosid: 'AAAAAAAA-0000-4000-8000-000000000001', cr40f_id: ' CP-77 ', new_status: 100000000, [`new_status${F}`]: 'Pendente',
    new_valortotal: 1500.5, new_valorpedagios: 20, createdon: '2026-11-01T13:00:00Z', modifiedon: 'invalida',
    cr40f_ServicoRelacionadoGeral: {
      cr40f_id: '9156', cr40f_statusdefaturamento: 202410010, [`cr40f_statusdefaturamento${F}`]: 'Pago',
      cr40f_dataehorriodesada: '2026-11-04T14:00:00Z', _cr40f_cliente_value: 'guid', [`_cr40f_cliente_value${F}`]: 'Tenaris',
      [`_cr40f_motorista_value${F}`]: 'Motorista Exemplo', cr40f_cotao: 1600, cr40f_tipodeveiculo: 202410001,
    },
  }
  it('lê choice, lookup e valores; ausentes viram vazio', () => {
    const c = mapComposicao(row)
    expect(c).toMatchObject({ id: 'aaaaaaaa-0000-4000-8000-000000000001', codigo: 'CP-77', servicoId: '9156', cliente: 'Tenaris', motorista: 'Motorista Exemplo', cotacao: 1600, modificadoEm: null, trajeto: '' })
    expect(c.status).toEqual({ value: 100000000, label: 'Pendente' })
    expect(c.faturamento).toEqual({ value: 202410010, label: 'Pago' })
    expect(c.tipoVeiculo).toEqual({ value: 202410001, label: '202410001' })
    expect(c.statusOperacao).toBeNull()
    expect(c.valores.valorTotal).toBe(1500.5)
    expect(c.valores.pedagios).toBe(20)
    expect(c.valores.locacao).toBeNull()
    expect(c.saida?.toISOString()).toBe('2026-11-04T14:00:00.000Z')
  })
  it('linha sem Reserva expandida não quebra', () => {
    expect(mapComposicao({ cr40f_composicaodeprecosid: 'b', cr40f_id: 'CP-1' }).cliente).toBe('')
  })
  it('consulta traz o filtro base e o expand da Reserva', () => {
    const path = decodeURIComponent(composicoesPath('cr40f_composicaodeprecoses'))
    expect(path).toContain('statecode eq 0')
    expect(path).toContain('cr40f_ServicoRelacionadoGeral/new_categoriadoitem eq 100000000')
    expect(path).toContain('cr40f_ServicoRelacionadoGeral/cr40f_status ne 100000001')
    expect(path).toContain('$expand=cr40f_ServicoRelacionadoGeral($select=')
  })
})
