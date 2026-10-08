import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient, Row } from '@betinhos/dataverse'
import { carregarDataverse, createSource } from './source'
import { calcularResumo } from '../domain/resumo'
import { linhasScore } from '../domain/score'
import { ENTITIES, eventosPath, mapCps, mapEvento, mapReserva, mapTelemetria, mapViagem, reservasPath, telemetriaPath, viagensPath } from './queries'

const F = '@OData.Community.Display.V1.FormattedValue'
const SETS = { reserva: 'res', composicao: 'cps', manutencao: 'man', multa: 'mul', ocorrencia: 'oco', funcionario: 'fun', veiculo: 'vei', telemetria: 'tel', evento: 'eve', viagem: 'via' }
const client = (getAll: (path: string) => Promise<Row[]>) => ({ apiUrl: '', request: vi.fn(), getAll: vi.fn(getAll), create: vi.fn(), update: vi.fn(), remove: vi.fn() }) as unknown as DataverseClient

describe('consultas do Dashboard', () => {
  it('janela de reservas em Brasília com fim inclusivo', () => {
    const p = reservasPath('res', '2024-01-01', '2026-10-15')
    expect(p).toContain('$expand=cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)')
    expect(decodeURIComponent(p)).toContain('cr40f_dataehorriodesada ge 2024-01-01T03:00:00.000Z and cr40f_dataehorriodesada lt 2026-10-16T03:00:00.000Z')
  })

  it('tabelas do Infleet: janela de datas e colunas mínimas', () => {
    expect(ENTITIES).toMatchObject({ telemetria: 'new_telemetriadiariainfleet', evento: 'new_eventoinfleet', viagem: 'new_viageminfleet' })
    const tel = telemetriaPath('tel', '2024-01-01', '2026-10-15')
    expect(tel).toContain('tel?$select=new_data,_new_veiculo_value,new_tempomotorociosomin&$filter=')
    expect(decodeURIComponent(tel)).toContain('new_data ge 2024-01-01 and new_data le 2026-10-15')
    const via = viagensPath('via', '2024-01-01', '2026-10-15')
    expect(via).toContain('via?$select=new_iniciadoem,_new_veiculo_value,_new_motorista_value,new_distanciakm&$filter=')
    expect(decodeURIComponent(via)).toContain('new_iniciadoem ge 2024-01-01T03:00:00.000Z and new_iniciadoem lt 2026-10-16T03:00:00.000Z')
    const eve = eventosPath('eve', '2024-01-01', '2026-10-15')
    expect(eve).toContain('eve?$select=new_reportadoem,_new_motorista_value,new_slug&$filter=')
    expect(decodeURIComponent(eve)).toContain('new_reportadoem ge 2024-01-01T03:00:00.000Z and new_reportadoem lt 2026-10-16T03:00:00.000Z')
  })

  it('mapeia viagem, evento e telemetria do Infleet (mês = texto bruto, dia = Brasília)', () => {
    // 01/11 01:00Z é 31/10 22:00 em Brasília: `dia` fica em outubro, `mes` (slice do texto bruto, como o legado) em novembro.
    expect(mapViagem({ new_iniciadoem: '2026-11-01T01:00:00Z', _new_veiculo_value: 'V1', _new_motorista_value: 'M1', new_distanciakm: 12.5 }))
      .toEqual({ dia: '2026-10-31', mes: '2026-11', veiculoId: 'v1', motoristaId: 'm1', distancia: 12.5 })
    expect(mapViagem({ new_iniciadoem: '2026-10-02T12:00:00Z', _new_veiculo_value: 'V1', _new_motorista_value: null, new_distanciakm: null }))
      .toEqual({ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', motoristaId: '', distancia: 0 })
    expect(mapViagem({})).toEqual({ dia: '', mes: '', veiculoId: '', motoristaId: '', distancia: 0 })
    expect(mapEvento({ new_reportadoem: '2026-10-02T20:13:39Z', _new_motorista_value: 'M1', new_slug: 'hardBraking' }))
      .toEqual({ dia: '2026-10-02', mes: '2026-10', motoristaId: 'm1', tipo: 'hardBraking' })
    expect(mapEvento({})).toEqual({ dia: '', mes: '', motoristaId: '', tipo: '' })
    expect(mapTelemetria({ new_data: '2026-08-02', _new_veiculo_value: 'V1', new_tempomotorociosomin: 14 }))
      .toEqual({ dia: '2026-08-02', mes: '2026-08', veiculoId: 'v1', ociosoMin: 14 })
    expect(mapTelemetria({ new_data: '2026-08-02', _new_veiculo_value: 'V1', new_tempomotorociosomin: null }).ociosoMin).toBe(0)
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

  it('carrega as três tabelas do Infleet; uma que falha vira indisponível só para ela', async () => {
    const c = client(async (path) => {
      if (path.startsWith('via?')) return [{ new_iniciadoem: '2026-10-02T12:00:00Z', _new_veiculo_value: 'V1', _new_motorista_value: 'M1', new_distanciakm: 120 }]
      if (path.startsWith('eve?')) return [{ new_reportadoem: '2026-10-02T13:00:00Z', _new_motorista_value: 'M1', new_slug: 'hardBraking' }]
      if (path.startsWith('tel?')) return [{ new_data: '2026-10-02', _new_veiculo_value: 'V1', new_tempomotorociosomin: 3 }]
      return []
    })
    const ok = await carregarDataverse(c, SETS, '2024-01-01', '2026-10-15')
    expect(ok.indisponiveis).toEqual([])
    expect(ok.viagens).toEqual([{ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', motoristaId: 'm1', distancia: 120 }])
    expect(ok.eventos).toEqual([{ dia: '2026-10-02', mes: '2026-10', motoristaId: 'm1', tipo: 'hardBraking' }])
    expect(ok.telemetria).toEqual([{ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', ociosoMin: 3 }])

    const semViagens = await carregarDataverse(client(async (path) => {
      if (path.startsWith('via?')) throw new Error('sem permissão')
      if (path.startsWith('eve?')) return [{ new_reportadoem: '2026-10-02T13:00:00Z', _new_motorista_value: 'M1', new_slug: 'hardBraking' }]
      return []
    }), SETS, '2024-01-01', '2026-10-15')
    expect(semViagens.indisponiveis).toEqual(['viagens'])
    expect(semViagens.viagens).toEqual([])
    expect(semViagens.eventos).toHaveLength(1)
    const dois = await carregarDataverse(client(async (path) => { if (path.startsWith('eve?') || path.startsWith('tel?')) throw new Error('x'); return [] }), SETS, '2024-01-01', '2026-10-15')
    expect(dois.indisponiveis).toEqual(['eventos', 'telemetria'])
  })

  it('mock devolve dados dentro da janela e marca mock', async () => {
    const s = createSource({ mode: 'mock' })
    expect(s.mock).toBe(true)
    const d = await s.carregar('2026-09-01', '2026-09-30')
    const doDataverse = d.reservas.filter((r) => !r.id.startsWith('legacy-'))
    expect(doDataverse.length).toBeGreaterThan(0)
    expect(doDataverse.every((r) => r.dia >= '2026-09-01' && r.dia <= '2026-09-30')).toBe(true)
  })

  it('mock do Infleet: fica na janela pedida e é determinístico', async () => {
    const s = createSource({ mode: 'mock' })
    const hoje = new Date().toISOString().slice(0, 10)
    const d = await s.carregar('2026-09-01', hoje)
    expect(d.viagens.length).toBeGreaterThan(0)
    expect(d.eventos.length).toBeGreaterThan(0)
    expect(d.telemetria.length).toBeGreaterThan(0)
    for (const x of [...d.viagens, ...d.eventos, ...d.telemetria]) expect(x.dia >= '2026-09-01' && x.dia <= hoje).toBe(true)
    const outra = await createSource({ mode: 'mock' }).carregar('2026-09-01', hoje)
    expect({ v: outra.viagens, e: outra.eventos, t: outra.telemetria }).toEqual({ v: d.viagens, e: d.eventos, t: d.telemetria })
  })

  it('mock do Infleet: notas válidas em faixas diferentes e meses com veículo compartilhado sem nota', async () => {
    const hoje = new Date()
    const d = await createSource({ mode: 'mock' }).carregar('2025-01-01', '2099-12-31')
    const linhas = linhasScore(d.viagens, d.eventos, d.telemetria, '2025-01-01', '2099-12-31')
    const validas = linhas.filter((l) => l.suficiente)
    expect(validas.length).toBeGreaterThanOrEqual(30)
    expect(validas.some((l) => (l.nota ?? 100) < 60)).toBe(true)
    expect(validas.some((l) => (l.nota ?? 0) >= 80)).toBe(true)
    expect(linhas.some((l) => !l.suficiente && l.distancia >= 100)).toBe(true)
    // Mês anterior fechado: vários motoristas com nota e o alerta mostra a média.
    const anterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
    expect(validas.filter((l) => l.mes === anterior).length).toBeGreaterThanOrEqual(3)
    const f = { atalho: 'personalizado' as const, inicio: `${anterior}-01`, fim: `${anterior}-28`, status: [], clientes: [], motoristas: [], tipos: [] }
    const score = calcularResumo(d, f, hoje).operacao.find((a) => a.id === 'score')
    expect(score?.valor).not.toBe('—')
    expect(score?.tom).not.toBe('neutral')
  })
})
