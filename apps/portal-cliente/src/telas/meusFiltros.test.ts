import { describe, expect, it } from 'vitest'
import type { Pedido } from '../domain/types'
import { agruparPorDia, daAbaPedidos, filtrarPedidos, tituloDia } from './meusFiltros'

const AGORA = Date.parse('2026-11-23T15:00:00Z')
const p = (id: string, saida: string, extra: Partial<Pedido> = {}): Pedido => ({
  id, numero: `RV-${id}`, status: 'solicitado', saida, origem: 'Latasa, Pindamonhangaba', destino: 'Aeroporto de Guarulhos', passageiros: ['Ana Lúcia'], pessoas: [], criadoEm: saida, ...extra,
})

describe('Meus serviços: filtros e grupos', () => {
  it('Próximos tira passados e encerrados; Todos ordena do mais recente', () => {
    const lista = [p('1', '2026-11-20T12:00:00Z'), p('2', '2026-11-25T12:00:00Z'), p('3', '2026-11-24T12:00:00Z', { status: 'cancelado' })]
    expect(daAbaPedidos(lista, 'proximos', AGORA).map((x) => x.id)).toEqual(['2'])
    expect(daAbaPedidos(lista, 'todos', AGORA).map((x) => x.id)).toEqual(['2', '3', '1'])
  })

  it('busca sem acento por passageiro, local, código e placa; situação agrupa status', () => {
    const lista = [p('1', '2026-11-25T12:00:00Z'), p('2', '2026-11-25T13:00:00Z', { status: 'programado', placa: 'RTA2E41', motorista: 'Carlos', passageiros: ['Bruno'] }), p('3', '2026-11-25T14:00:00Z', { status: 'confirmado', destino: 'Hotel Mercure' })]
    const ids = (busca: string, situacao: Parameters<typeof filtrarPedidos>[1]['situacao'] = null) => filtrarPedidos(lista, { busca, situacao }).map((x) => x.id)
    expect(ids('ana lucia')).toEqual(['1', '3'])
    expect(ids('mercure')).toEqual(['3'])
    expect(ids('rv-2')).toEqual(['2'])
    expect(ids('rta2')).toEqual(['2'])
    expect(ids('', 'solicitado')).toEqual(['1', '3'])
    expect(ids('', 'programado')).toEqual(['2'])
    expect(ids('guarulhos', 'cancelado')).toEqual([])
  })

  it('agrupa pelo dia de São Paulo, mantendo a ordem', () => {
    // 01:30Z do dia 26 ainda é dia 25 em São Paulo.
    const grupos = agruparPorDia([p('1', '2026-11-26T12:00:00Z'), p('2', '2026-11-26T01:30:00Z'), p('3', '2026-11-25T12:00:00Z')], AGORA)
    expect(grupos.map((g) => [g.titulo, g.pedidos.map((x) => x.id)])).toEqual([['Quinta, 26/11', ['1']], ['Quarta, 25/11', ['2', '3']]])
  })

  it('título leva o ano só fora do ano corrente', () => {
    expect(tituloDia('2026-11-26', '2026-11-23')).toBe('Quinta, 26/11')
    expect(tituloDia('2025-12-31', '2026-11-23')).toBe('Quarta, 31/12/2025')
  })
})
