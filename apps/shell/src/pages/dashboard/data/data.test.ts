import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient, Row } from '@betinhos/dataverse'
import { carregarDataverse, createSource } from './source'
import { mapCps, mapReserva, reservasPath } from './queries'

const F = '@OData.Community.Display.V1.FormattedValue'
const SETS = { reserva: 'res', composicao: 'cps', manutencao: 'man', multa: 'mul', ocorrencia: 'oco', funcionario: 'fun', veiculo: 'vei' }
const client = (getAll: (path: string) => Promise<Row[]>) => ({ apiUrl: '', request: vi.fn(), getAll: vi.fn(getAll), create: vi.fn(), update: vi.fn(), remove: vi.fn() }) as unknown as DataverseClient

describe('consultas do Dashboard', () => {
  it('janela de reservas em Brasília com fim inclusivo', () => {
    const p = reservasPath('res', '2024-01-01', '2026-10-15')
    expect(p).toContain('$expand=cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)')
    expect(decodeURIComponent(p)).toContain('cr40f_dataehorriodesada ge 2024-01-01T03:00:00.000Z and cr40f_dataehorriodesada lt 2026-10-16T03:00:00.000Z')
  })

  it('mapeia reserva com CP, apelido, cliente e rótulos', () => {
    const cps = mapCps([{ cr40f_composicaodeprecosid: 'CP1', new_valortotal: 850.5, new_status: 100000001 }])
    const r = mapReserva({
      cr40f_reservadeveculosid: 'R1', cr40f_dataehorriodesada: '2026-10-02T12:00:00Z', createdon: '2026-10-01T10:00:00Z',
      cr40f_status: 202410008, [`cr40f_status${F}`]: 'Concluído', cr40f_statusdefaturamento: 202410010, [`cr40f_statusdefaturamento${F}`]: 'Pago',
      new_categoriadoitem: 100000000, [`new_categoriadoitem${F}`]: 'Serviço', cr40f_tipodeveiculo: 3, [`cr40f_tipodeveiculo${F}`]: 'Executivo',
      _cr40f_veiculo_value: 'V1', _new_composicaodepreco_value: 'cp1', _cr40f_financeiro_value: 'OP1',
      cr40f_Motorista: { cr40f_funcionariosid: 'M1', cr40f_nomecompleto: 'Carlos Oliveira', new_apelido: 'Oliveira' },
      cr40f_Cliente: { cr40f_nomedocliente: 'Tenaris' },
    }, cps)
    expect(r).toMatchObject({ id: 'r1', dia: '2026-10-02', mes: '2026-10', statusLabel: 'Concluído', fatStatus: 202410010, tipoVeiculo: 'Executivo', tipoVeiculoRaw: '3', veiculoId: 'v1', motoristaId: 'm1', motoristaKey: 'm1', motorista: 'Oliveira', cliente: 'Tenaris', valor: 850.5, cpConcluida: true, opId: 'op1' })
    expect(mapReserva({ cr40f_reservadeveculosid: 'R2' }, cps)).toMatchObject({ motorista: 'Sem motorista', motoristaKey: 'nome:sem motorista', cliente: 'Sem cliente', valor: 0, dia: '', statusLabel: 'Sem status' })
  })

  it('reservas e CPs obrigatórias; secundário que falha vira indisponível; CSV entra', async () => {
    const c = client(async (path) => {
      if (path.startsWith('res?')) return [{ cr40f_reservadeveculosid: 'R1', cr40f_dataehorriodesada: '2026-10-02T12:00:00Z', new_categoriadoitem: 100000000 }]
      if (path.startsWith('mul?')) throw new Error('sem permissão')
      return []
    })
    const d = await carregarDataverse(c, SETS, '2024-01-01', '2026-10-15')
    expect(d.indisponiveis).toEqual(['multas'])
    expect(d.reservas.some((r) => r.id === 'r1')).toBe(true)
    expect(d.reservas.some((r) => r.id.startsWith('legacy-2026-'))).toBe(true)
    await expect(carregarDataverse(client(async (p) => { if (p.startsWith('cps?')) throw new Error('falhou'); return [] }), SETS, '2024-01-01', '2026-10-15')).rejects.toThrow('falhou')
  })

  it('mock devolve dados dentro da janela e marca mock', async () => {
    const s = createSource({ mode: 'mock' })
    expect(s.mock).toBe(true)
    const d = await s.carregar('2026-09-01', '2026-09-30')
    const doDataverse = d.reservas.filter((r) => !r.id.startsWith('legacy-'))
    expect(doDataverse.length).toBeGreaterThan(0)
    expect(doDataverse.every((r) => r.dia >= '2026-09-01' && r.dia <= '2026-09-30')).toBe(true)
  })
})
