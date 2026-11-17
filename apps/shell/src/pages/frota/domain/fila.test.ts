import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'
import { diasEsperando } from './fila'

const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: id, status: MANUT.SOLICITADO, grau: 1, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: null, solicitante: null, criadoEm: '2026-11-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })

describe('dias esperando', () => {
  it('conta os dias desde o pedido no fuso de São Paulo', () => {
    expect(diasEsperando(manut('a', { criadoEm: '2026-11-16T02:00:00Z' }), '2026-11-18')).toBe(3) // 15/11 às 23:00 em São Paulo
    expect(diasEsperando(manut('b', { criadoEm: '2026-11-18T12:00:00Z' }), '2026-11-18')).toBe(0)
  })
})
