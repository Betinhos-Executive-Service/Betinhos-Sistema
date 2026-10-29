// Rotas (portado de tela-funcoes-operacionais/tests/routes.test.ts para a query do shell), idempotência e formulários.
import { describe, expect, test } from 'vitest'
import { applyVehicleFieldChange, cloneDatesHint, emptyVehicleForm, validateCloneDraft, vehicleFormFromSwap } from './forms'
import { fnv1a } from './payloads'
import { parseRoute, routeIsCanonical, routePatch } from './routes'
import type { AppState, Swap } from './types'

const q = (text: string) => new URLSearchParams(text)
const id = 'a8cc18c4-c7c0-f111-aaaf-7ced8da8c473'

describe('aba e troca na query do shell', () => {
  test('aba= define a visão (com os apelidos antigos)', () => {
    expect(parseRoute(q(''))).toEqual({ view: null, editId: '' })
    expect(parseRoute(q('aba=motorista'))).toEqual({ view: 'driver', editId: '' })
    expect(parseRoute(q('aba=pedido'))).toEqual({ view: 'clone', editId: '' })
    expect(parseRoute(q('aba=carro'))).toEqual({ view: 'vehicle', editId: '' })
    expect(parseRoute(q('aba=trocas-de-carro')).view).toBe('vehicle')
    expect(parseRoute(q('aba=desconhecida'))).toEqual({ view: null, editId: '' })
  })

  test('troca= abre a edição na aba Carro; GUID inválido é ignorado; chaves saem', () => {
    expect(parseRoute(q(`aba=carro&troca=${id}`))).toEqual({ view: 'vehicle', editId: id })
    expect(parseRoute(q(`troca=%7B${id}%7D`))).toEqual({ view: 'vehicle', editId: id })
    expect(parseRoute(q('aba=carro&troca=qualquer'))).toEqual({ view: 'vehicle', editId: '' })
  })

  test('legado: view=, mode=edit&id= e data= (query codificada; os diretos têm prioridade)', () => {
    expect(parseRoute(q('view=duplicar-pedido')).view).toBe('clone')
    expect(parseRoute(q(`mode=edit&id=${id}`))).toEqual({ view: 'vehicle', editId: id })
    expect(parseRoute(q(`data=${encodeURIComponent(`mode=edit&id=${id}`)}`))).toEqual({ view: 'vehicle', editId: id })
    expect(parseRoute(q(`data=${encodeURIComponent('view=pedido')}&view=carro`)).view).toBe('vehicle')
  })

  test('patch grava aba (Motorista é o padrão) e troca só no Carro, removendo os parâmetros antigos', () => {
    expect(routePatch('driver')).toEqual({ aba: null, troca: null, view: null, mode: null, id: null, data: null })
    expect(routePatch('clone', id)).toMatchObject({ aba: 'pedido', troca: null })
    expect(routePatch('vehicle', id)).toMatchObject({ aba: 'carro', troca: id })
    expect(routeIsCanonical(q('aba=carro'), 'vehicle')).toBe(true)
    expect(routeIsCanonical(q(`mode=edit&id=${id}`), 'vehicle', id)).toBe(false)
    expect(routeIsCanonical(q(''), 'driver')).toBe(true)
  })
})

test('FNV-1a 32 bits com a semente e o primo do WebResource', () => {
  expect(fnv1a('')).toBe('811c9dc5')
  expect(fnv1a('a')).toBe('e40c292c')
  expect(fnv1a('foobar')).toBe('bf9cf968')
})

describe('formulários', () => {
  const now = new Date(2026, 9, 29, 14, 7, 30)

  test('troca nova: Troca, Agendar, automático, entre serviços, janela arredondada', () => {
    expect(emptyVehicleForm(now)).toMatchObject({
      typeValue: '100000000', executionMode: 'schedule', programAutomatically: true, windowMode: 'between',
      actualDate: '2026-10-29', actualHour: '14', actualMinute: '07', startHour: '14', startMinute: '10', endHour: '14', endMinute: '20',
    })
  })

  test('edição preenche a partir da troca; Programada liga o automático; veículo da base vem do vehicle2 na Retirada', () => {
    const swap = { id: 's', typeValue: 100000002, statusValue: 202410000, start: new Date(2026, 9, 30, 9, 0).toISOString(), end: new Date(2026, 9, 30, 9, 30).toISOString(), driver1Id: 'd1', driver2Id: null, vehicle2Id: 'v2', locationId: 'l1', obs: 'x', windowModeValue: 100000001, location: 'Base' } as unknown as Swap
    expect(vehicleFormFromSwap(swap, now)).toMatchObject({ typeValue: '100000002', startDate: '2026-10-30', startHour: '09', endMinute: '30', baseVehicleId: 'v2', programAutomatically: true, windowMode: 'between', location: 'Base', locationId: 'l1' })
  })

  test('mudar o tipo limpa motorista 2, veículo da base, local (fora de Devolução/Retirada) e âncoras', () => {
    const state = {
      driver: { query: '', startDate: '' }, clone: { query: '' },
      vehicle: { form: { ...emptyVehicleForm(now), driver2Id: 'd2', baseVehicleId: 'v', locationId: 'l', driver1AfterId: 'a', driver2BeforeId: 'b' } },
      data: { drivers: [], vehicles: [], services: [], passengerLinks: [], swaps: [], possessions: [], locations: [] },
    } as AppState
    const { form } = applyVehicleFieldChange(state, 'typeValue', '100000003')
    expect(form).toMatchObject({ typeValue: '100000003', driver2Id: '', baseVehicleId: '', locationId: '', driver1AfterId: '', driver2BeforeId: '' })
  })

  test('duplicação exige horário e data futura', () => {
    expect(validateCloneDraft({ date: '', dates: [], hour: '', minute: '', driverId: '', obsOperacao: '', obsInterna: '' }).errors)
      .toEqual({ cloneTime: 'Informe o horário de saída.', cloneDates: 'Escolha pelo menos uma data.' })
    expect(validateCloneDraft({ date: '', dates: ['2020-01-02'], hour: '08', minute: '05', driverId: '', obsOperacao: '', obsInterna: '' }).errors)
      .toEqual({ cloneDates: '02/01 às 08:05 já passou.' })
    expect(cloneDatesHint(['2026-11-02', '2026-11-03'])).toBe('2 datas: 02/11, 03/11')
  })
})
