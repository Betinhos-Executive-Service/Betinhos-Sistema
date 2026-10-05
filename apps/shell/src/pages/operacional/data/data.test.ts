import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@betinhos/dataverse'
import { SAFE_MODE_ERROR, loadOperacional, mapReserva, reservasPath } from './queries'
import { motoristaPatch, statusPatch } from './mutations'
import { createMockData } from './mock'
import { buildAttention } from '../domain/alerts'
import { findConflicts } from '../domain/conflicts'

const F = '@OData.Community.Display.V1.FormattedValue'
const sets = { reserva: 'cr40f_reservadeveculoses', funcionario: 'cr40f_funcionarioses', passageiro: 'cr40f_servicosporpassageiros' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('consultas', () => {
  it('monta o filtro do dia em UTC e só pede extras no modo completo', () => {
    const full = decodeURIComponent(reservasPath('cr40f_reservadeveculoses', '2026-10-05', 'full'))
    expect(full).toContain('cr40f_dataehorriodesada ge 2026-10-05T03:00:00.000Z and cr40f_dataehorriodesada lt 2026-10-06T03:00:00.000Z and statecode eq 0')
    expect(full).toContain('_cr40f_motorista_value')
    expect(full).toContain('$orderby=cr40f_dataehorriodesada asc')
    expect(decodeURIComponent(reservasPath('x', '2026-10-05', 'safe'))).not.toContain('_cr40f_motorista_value')
  })
  it('reconhece os erros de coluna que ativam o modo seguro', () => {
    expect(SAFE_MODE_ERROR.test("Could not find a property named 'cr40f_x'")).toBe(true)
    expect(SAFE_MODE_ERROR.test('Timeout')).toBe(false)
  })
  it('mapeia a linha com valores formatados', () => {
    const r = mapReserva({
      cr40f_reservadeveculosid: 'ABC', cr40f_idnovo: 'R-77', cr40f_id: '77', cr40f_status: 202410001, [`cr40f_status${F}`]: 'Confirmado',
      cr40f_dataehorriodesada: '2026-10-05T11:30:00Z', _cr40f_motorista_value: 'M1', [`_cr40f_motorista_value${F}`]: 'Carlos',
      _cr40f_passageiro1_value: 'P1', [`_cr40f_passageiro1_value${F}`]: 'Ana',
    })
    expect(r).toMatchObject({ id: 'abc', codigo: 'R-77', statusValue: 202410001, status: 'Confirmado', motoristaId: 'm1', motorista: 'Carlos', tipoServico: 'Outros', passageirosLookup: [{ id: 'p1', nome: 'Ana' }] })
    expect(r.saida?.toISOString()).toBe('2026-10-05T11:30:00.000Z')
  })
  it('cai no modo seguro e deriva motoristas das reservas quando a lista falha', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('cr40f_reservadeveculoses') && url.includes('_cr40f_motorista_value')) return json({ error: { message: 'Could not find a property named _cr40f_x' } }, 400)
      if (url.includes('cr40f_reservadeveculoses')) return json({ value: [{ cr40f_reservadeveculosid: 'A', cr40f_dataehorriodesada: '2026-10-05T11:30:00Z' }] })
      if (url.includes('cr40f_funcionarioses')) return json({ error: { message: 'falhou' } }, 500)
      return json({ value: [{ cr40f_servicosporpassageiroid: 'S1', cr40f_ordemdeselecao: 1, _cr40f_geral_value: 'A', [`_cr40f_bancodedados_value${F}`]: 'Ana' }] })
    })
    const data = await loadOperacional(createClient('https://org.example', fetchMock as typeof fetch), sets, '2026-10-05')
    expect(data.queryMode).toBe('safe')
    expect(data.reservas).toHaveLength(1)
    expect(data.motoristas).toEqual([])
    expect(data.passageiros.a[0]).toMatchObject({ nome: 'Ana', ordem: 1 })
  })
})

describe('mutações', () => {
  it('monta os payloads de PATCH', () => {
    expect(statusPatch(202410008)).toEqual({ cr40f_status: 202410008 })
    expect(motoristaPatch('cr40f_funcionarioses', '{ABC}')).toEqual({ 'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(abc)' })
    expect(motoristaPatch('cr40f_funcionarioses', null)).toEqual({ 'cr40f_Motorista@odata.bind': null })
  })
})

describe('mock', () => {
  it('cobre os casos da fila de atenção', () => {
    const now = new Date('2026-10-05T11:00:00-03:00')
    const data = createMockData(now)
    const reasons = buildAttention(data.reservas, now).map((i) => i.priority)
    expect(reasons).toContain(1)
    expect(reasons).toContain(2)
    expect(findConflicts(data.reservas).length).toBeGreaterThan(0)
  })
})
