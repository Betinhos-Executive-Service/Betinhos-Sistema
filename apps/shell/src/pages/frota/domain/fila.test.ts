import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'
import { diasEsperando, filaEncaixe } from './fila'

const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: id, status: MANUT.SOLICITADO, grau: 1, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: null, solicitante: null, criadoEm: '2026-11-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })

describe('fila "A encaixar"', () => {
  it('só Solicitado; grau maior primeiro e, no mesmo grau, a mais antiga; sem grau no fim', () => {
    const fila = filaEncaixe([
      manut('baixaAntiga', { grau: 1, criadoEm: '2026-11-01T12:00:00Z' }),
      manut('urgenteNova', { grau: 4, criadoEm: '2026-11-15T12:00:00Z' }),
      manut('urgenteAntiga', { grau: 4, criadoEm: '2026-11-12T12:00:00Z' }),
      manut('semGrau', { grau: null, criadoEm: '2026-10-01T12:00:00Z' }),
      manut('alta', { grau: 3 }),
      manut('agendada', { grau: 4, status: MANUT.AGENDADO }),
      manut('cancelada', { grau: 4, status: MANUT.CANCELADO }),
    ])
    expect(fila.map((m) => m.id)).toEqual(['urgenteAntiga', 'urgenteNova', 'alta', 'baixaAntiga', 'semGrau'])
  })

  it('conta os dias desde o pedido no fuso de São Paulo', () => {
    expect(diasEsperando(manut('a', { criadoEm: '2026-11-16T02:00:00Z' }), '2026-11-18')).toBe(3) // 15/11 às 23:00 em São Paulo
    expect(diasEsperando(manut('b', { criadoEm: '2026-11-18T12:00:00Z' }), '2026-11-18')).toBe(0)
  })
})
