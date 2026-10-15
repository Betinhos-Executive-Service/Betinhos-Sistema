import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@betinhos/dataverse'
import { SAFE_MODE_ERROR, loadOperacional, mapMotorista, mapReserva, reservasPath } from './queries'
import { motoristaPatch, motoristaRefPath, statusPatch } from './mutations'
import { createMockData } from './mock'
import { buildAttention } from '../domain/alerts'
import { findConflicts } from '../domain/conflicts'

const F = '@OData.Community.Display.V1.FormattedValue'
const sets = { reserva: 'cr40f_reservadeveculoses', funcionario: 'cr40f_funcionarioses', passageiro: 'cr40f_servicosporpassageiros', veiculo: 'cr40f_veiculos' }
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
    expect(data.warnings).toEqual(['Não foi possível carregar a lista de motoristas; mostrando os que aparecem nas reservas.'])
    expect(data.passageiros.a[0]).toMatchObject({ nome: 'Ana', ordem: 1 })
  })
})

describe('permissão', () => {
  it('relança 403 da lista de motoristas em vez de usar o fallback', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('cr40f_funcionarioses')) return json({ error: { message: 'sem acesso' } }, 403)
      return json({ value: [] })
    })
    await expect(loadOperacional(createClient('https://org.example', fetchMock as typeof fetch), sets, '2026-10-05')).rejects.toMatchObject({ status: 403 })
  })
  it('avisa quando os passageiros falham por erro comum', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('cr40f_servicosporpassageiros')) return json({ error: { message: 'falhou' } }, 500)
      if (url.includes('cr40f_funcionarioses')) return json({ value: [] })
      return json({ value: [{ cr40f_reservadeveculosid: 'A', cr40f_dataehorriodesada: '2026-10-05T11:30:00Z' }] })
    })
    const data = await loadOperacional(createClient('https://org.example', fetchMock as typeof fetch), sets, '2026-10-05')
    expect(data.warnings).toContain('Não foi possível carregar os passageiros vinculados.')
  })
})

describe('mutações', () => {
  it('monta os payloads de PATCH', () => {
    expect(statusPatch(202410008)).toEqual({ cr40f_status: 202410008 })
    expect(motoristaPatch('cr40f_funcionarioses', '{ABC}')).toEqual({ 'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(abc)' })
    expect(motoristaRefPath('cr40f_reservadeveculoses', '{ABC}')).toBe('cr40f_reservadeveculoses(abc)/cr40f_Motorista/$ref')
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

describe('carro e link', () => {
  it('mapReserva e mapMotorista leem veículo, link e vínculo', () => {
    const r = mapReserva({ cr40f_reservadeveculosid: 'A', _cr40f_veiculo_value: 'V1', new_linkacompanhamento: 'https://l/r/x', new_linkacompanhamentoexpiraem: '2026-10-05T15:00:00Z' })
    expect(r).toMatchObject({ veiculoId: 'v1', linkAcompanhamento: 'https://l/r/x' })
    expect(r.linkExpiraEm?.toISOString()).toBe('2026-10-05T15:00:00.000Z')
    expect(mapMotorista({ cr40f_funcionariosid: 'M', _cr40f_veiculoatual_value: 'V2', cr40f_tipodevinculo: 1 })).toMatchObject({ veiculoAtualId: 'v2', terceiro: true })
    expect(mapMotorista({ cr40f_funcionariosid: 'M', cr40f_tipodevinculo: 0 })).toMatchObject({ veiculoAtualId: null, terceiro: false })
  })
  it('carrega veículos e, se falhar, avisa com lista vazia', async () => {
    const urls: string[] = []
    const ok = vi.fn(async (url: string) => {
      urls.push(decodeURIComponent(url))
      if (url.includes('cr40f_veiculos')) return json({ value: [{ cr40f_veiculosid: 'V1', cr40f_placa: 'RUH7G45', cr40f_modelo: 'Corolla', cr40f_cor: 'Prata' }] })
      return json({ value: [] })
    })
    const data = await loadOperacional(createClient('https://org.example', ok as typeof fetch), sets, '2026-10-05')
    expect(data.veiculos).toEqual([{ id: 'v1', placa: 'RUH7G45', modelo: 'Corolla', cor: 'Prata' }])
    expect(urls.some((u) => u.includes('cr40f_veiculos?$select=cr40f_veiculosid,cr40f_placa,cr40f_modelo,cr40f_cor&$filter=statecode eq 0'))).toBe(true)
    const bad = vi.fn(async (url: string) => (url.includes('cr40f_veiculos') ? json({ error: { message: 'falhou' } }, 500) : json({ value: [] })))
    const failed = await loadOperacional(createClient('https://org.example', bad as typeof fetch), sets, '2026-10-05')
    expect(failed.veiculos).toEqual([])
    expect(failed.warnings.some((w) => /veículos/.test(w))).toBe(true)
  })
})
