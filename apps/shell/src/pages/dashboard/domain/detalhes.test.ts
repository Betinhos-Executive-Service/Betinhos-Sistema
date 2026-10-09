import { describe, expect, it } from 'vitest'
import { detalheDoId, idDetalheMotorista } from './detalhes'
import type { Contexto } from './kpis'
import type { Dados } from './types'

const periodo = { inicio: '2026-01-01', fim: '2026-12-31' }
const ctx = { todas: [], rv: [{ id: 'r1', motoristaId: 'm1', motorista: 'Ana', dia: '2026-03-01', cpCodigo: '1', opCodigo: '', cliente: 'X', statusLabel: 'Concluído', valor: 10, saidaMs: 0, saidaRaw: '2026-03-01T10:00:00Z' }], f: { atalho: 'esteAno', ...periodo, status: [], clientes: [], motoristas: [], tipos: [] }, now: new Date('2026-10-09T12:00:00Z') } as unknown as Contexto
const dados = { funcionarios: [], multas: [] } as unknown as Dados

describe('detalheDoId', () => {
  it('refaz a lista pelo id guardado na URL', () => {
    expect(detalheDoId('cnh', ctx, dados)).toMatchObject({ tipo: 'cnh' })
    expect(detalheDoId('multas', ctx, dados)).toMatchObject({ tipo: 'multas' })
    expect(detalheDoId('sem-cliente', ctx, dados)).toMatchObject({ tipo: 'servicos', titulo: 'Sem cliente' })
    expect(detalheDoId(idDetalheMotorista('m1'), ctx, dados)).toMatchObject({ tipo: 'servicos', titulo: 'Serviços de Ana' })
  })

  it('id desconhecido ou motorista fora do recorte não abre nada', () => {
    expect(detalheDoId('qualquer', ctx, dados)).toBeNull()
    expect(detalheDoId(idDetalheMotorista('outro'), ctx, dados)).toBeNull()
  })
})
