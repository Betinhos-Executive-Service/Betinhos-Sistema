import { describe, expect, it } from 'vitest'
import { calcularResumo } from './resumo'
import { reserva } from './test-utils'
import type { Dados, Filtros } from './types'

const NOW = new Date('2026-10-15T15:00:00Z')
const f: Filtros = { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const vazio: Dados = { reservas: [], manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], indisponiveis: [] }

describe('calcularResumo', () => {
  it('não quebra sem dados', () => {
    const r = calcularResumo(vazio, f, NOW)
    expect(r.servicos).toBe(0)
    expect(r.kpis).toHaveLength(6)
    expect(r.qualidade.every((a) => a.status === 's/dado')).toBe(true)
  })

  it('filtra secundários pelo período e compõe as seções', () => {
    const dados: Dados = {
      ...vazio,
      reservas: [reserva({ saidaRaw: '2026-10-02T12:00:00Z', valor: 500, cliente: 'Tenaris' }), reserva({ saidaRaw: '2026-09-02T12:00:00Z', valor: 900 })],
      manutencoes: [{ dia: '2026-10-03', valor: 100 }, { dia: '2026-09-03', valor: 999 }],
      ocorrencias: [{ dia: '2026-10-05' }, { dia: '2026-08-01' }],
    }
    const r = calcularResumo(dados, f, NOW)
    expect(r.servicos).toBe(1)
    expect(r.custoFrota.valor).toBe('R$\u00a0100,00')
    expect(r.operacao.find((a) => a.id === 'ocorrencias')?.valor).toBe('1')
    expect(r.clientes.linhas[0].cliente).toBe('Tenaris')
  })
})
