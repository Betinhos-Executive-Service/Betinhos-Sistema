import { describe, expect, it } from 'vitest'
import { detalheDoId, idDetalheMotorista } from './detalhes'
import type { Contexto } from './kpis'
import { dadosVazios, reserva } from './test-utils'

const f = { atalho: 'esteAno' as const, inicio: '2026-01-01', fim: '2026-12-31', status: [], clientes: [], motoristas: [], tipos: [] }
const rv = [reserva({ saidaRaw: '2026-03-01T10:00:00Z', motoristaId: 'm1', motorista: 'Ana', cpId: 'cp1', cpCodigo: 'CP-1', cpPendente: true, fatStatusLabel: 'Pendente', valor: 10 })]
const ctx: Contexto = { todas: rv, rv, f, now: new Date('2026-10-09T12:00:00Z') }
const dados = dadosVazios()

describe('detalheDoId (drill-down guardado na URL)', () => {
  it('refaz a lista pelo id com o recorte atual', () => {
    expect(detalheDoId('cnh', ctx, dados)).toMatchObject({ tipo: 'cnh' })
    expect(detalheDoId('multas', ctx, dados)).toMatchObject({ tipo: 'multas' })
    expect(detalheDoId('cp-pendente', ctx, dados)).toMatchObject({ tipo: 'servicos', titulo: 'CP pendente' })
    expect(detalheDoId('sem-cliente', ctx, dados)).toMatchObject({ tipo: 'servicos', titulo: 'Sem cliente' })
    expect(detalheDoId(idDetalheMotorista('m1'), ctx, dados)).toMatchObject({ tipo: 'servicos', titulo: 'Serviços de Ana' })
  })

  it('id desconhecido ou motorista fora do recorte não abre nada', () => {
    expect(detalheDoId('qualquer', ctx, dados)).toBeNull()
    expect(detalheDoId(idDetalheMotorista('outro'), ctx, dados)).toBeNull()
  })
})
