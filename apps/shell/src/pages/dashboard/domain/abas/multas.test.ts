import { describe, expect, it } from 'vitest'
import type { Contexto } from '../kpis'
import { dadosVazios, multa } from '../test-utils'
import type { Dados, Filtros, Multa } from '../types'
import { calcularMultas, infracaoDe } from './multas'

const NOW = new Date('2026-10-15T15:00:00Z')
const f: Filtros = { atalho: 'personalizado', inicio: '2026-09-01', fim: '2026-10-15', status: ['Concluído'], clientes: ['X'], motoristas: [], tipos: [] }
const ctx: Contexto = { todas: [], rv: [], f, now: NOW }
const dadosCom = (multas: Multa[], p: Partial<Dados> = {}) => dadosVazios({ multas, ...p })

describe('infracaoDe (multaTipo do legado)', () => {
  it('"código - descrição", só um dos dois, ou "Sem tipo"', () => {
    expect(infracaoDe(multa({ infracaoCodigo: '745-50', infracaoDescricao: 'Transitar em velocidade superior' }))).toBe('745-50 - Transitar em velocidade superior')
    expect(infracaoDe(multa({ infracaoCodigo: '745-50' }))).toBe('745-50')
    expect(infracaoDe(multa({ infracaoDescricao: 'Estacionar em local proibido' }))).toBe('Estacionar em local proibido')
    expect(infracaoDe(multa())).toBe('Sem tipo')
  })
})

describe('calcularMultas', () => {
  it('KPIs pela data da multa no período (segmentos não se aplicam): total, pendentes (Notificar) e resolvidas pelos status reais (spec §6)', () => {
    const muls = [
      multa({ status: 202410000, statusLabel: 'Notificar o Condutor' }),
      multa({ status: 202410000, statusLabel: 'Notificar o Condutor' }),
      multa({ status: 202410006, statusLabel: 'Pago' }),
      multa({ status: 202410003, statusLabel: 'Descontado' }),
      multa({ status: 202410005, statusLabel: 'Finalizado' }),
      multa({ status: 202410001, statusLabel: 'Indicada' }),
      multa({ status: 202410002, statusLabel: 'Recurso' }),
      multa({ statusLabel: 'Resolvida' }),
      multa({ statusLabel: 'Concluída' }),
      multa({ dia: '2026-08-31', status: 202410000 }),
      multa({ dia: '', status: 202410000 }),
    ]
    // Pago, Descontado, Finalizado, Resolvida e Concluída; Indicada e Recurso seguem em aberto.
    expect(calcularMultas(ctx, dadosCom(muls)).kpis).toEqual({ total: 9, pendentes: 2, resolvidas: 5 })
  })

  it('conjunto fora do ar: KPIs null (s/dado) e listas vazias', () => {
    expect(calcularMultas(ctx, dadosCom([multa()], { indisponiveis: ['multas'] }))).toEqual({ kpis: null, ant: null, porMotorista: [], porInfracao: [], porMes: [] })
  })

  it('por motorista: nome já resolvido (apelido ou rótulo do lookup), ordenado por quantidade, % sobre o total e topByShare', () => {
    const muls = [
      ...Array.from({ length: 4 }, () => multa({ motorista: 'Ana' })),
      ...Array.from({ length: 3 }, () => multa({ motorista: 'Bruno' })),
      ...Array.from({ length: 2 }, () => multa({ motorista: '—' })),
      multa({ motorista: 'Caio' }),
    ]
    // 10 multas: Ana 40%, Bruno 30%, — 20%, Caio 10% (não passa de 10%); com 3 acima de 10%, só eles.
    expect(calcularMultas(ctx, dadosCom(muls)).porMotorista).toEqual([
      { motorista: 'Ana', qtd: 4, pct: 40 },
      { motorista: 'Bruno', qtd: 3, pct: 30 },
      { motorista: '—', qtd: 2, pct: 20 },
    ])
  })

  it('por infração: agrupado por código/descrição, ordenado por quantidade; até 3 linhas passam direto', () => {
    const muls = [
      multa({ infracaoCodigo: '518-51' }),
      multa({ infracaoCodigo: '745-50', infracaoDescricao: 'Velocidade' }), multa({ infracaoCodigo: '745-50', infracaoDescricao: 'Velocidade' }),
      multa(),
    ]
    expect(calcularMultas(ctx, dadosCom(muls)).porInfracao).toEqual([
      { infracao: '745-50 - Velocidade', qtd: 2, pct: 50 },
      { infracao: '518-51', qtd: 1, pct: 25 },
      { infracao: 'Sem tipo', qtd: 1, pct: 25 },
    ])
  })

  it('por mês: quantidade e pendentes pelo mês da multa, meses em ordem', () => {
    const muls = [
      multa({ dia: '2026-10-01', status: 202410000 }), multa({ dia: '2026-09-15' }), multa({ dia: '2026-10-09' }),
    ]
    expect(calcularMultas(ctx, dadosCom(muls)).porMes).toEqual([
      { mes: '2026-09', rotulo: 'set/26', qtd: 1, pendentes: 0 },
      { mes: '2026-10', rotulo: 'out/26', qtd: 2, pendentes: 1 },
    ])
  })
})
