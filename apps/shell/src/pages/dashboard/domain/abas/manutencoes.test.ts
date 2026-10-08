import { describe, expect, it } from 'vitest'
import { filtrarServicos } from '../base'
import type { Contexto } from '../kpis'
import { manutencao, reserva } from '../test-utils'
import type { Dados, Filtros, Manutencao, Reserva } from '../types'
import { calcularManutencoes, categoriaManutencao } from './manutencoes'

const NOW = new Date('2026-10-15T15:00:00Z')
const f: Filtros = { atalho: 'personalizado', inicio: '2026-09-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const ctxDe = (rows: Reserva[] = [], filtros: Filtros = f): Contexto => ({ todas: rows, rv: filtrarServicos(rows, filtros), f: filtros, now: NOW })
const dadosCom = (manutencoes: Manutencao[], p: Partial<Dados> = {}): Dados => ({
  reservas: [], manutencoes, multas: [], ocorrencias: [], funcionarios: [], veiculos: [], viagens: [], eventos: [], telemetria: [],
  pagantes: [], despesas: [], categoriasDespesa: [], formasPagamento: [], indisponiveis: [], ...p,
})
const cat = (r: ReturnType<typeof calcularManutencoes>, nome: string) => r.categorias.find((c) => c.categoria === nome)

describe('categoriaManutencao (maintenanceCategory do legado)', () => {
  it('palavras-chave na ordem do legado, sem acento e sem caixa; o resto é corretiva não crítica', () => {
    expect(categoriaManutencao('Avaria')).toBe('Avaria')
    expect(categoriaManutencao('Sinistro com colisão')).toBe('Avaria')
    expect(categoriaManutencao('Corretiva crítica')).toBe('Corretiva crítica')
    expect(categoriaManutencao('Pane elétrica')).toBe('Corretiva crítica')
    expect(categoriaManutencao('Conservação, conforto e imagem')).toBe('Conservação')
    expect(categoriaManutencao('Funilaria')).toBe('Conservação')
    expect(categoriaManutencao('Troca de pneu')).toBe('Preventiva por condição')
    expect(categoriaManutencao('Ar condicionado')).toBe('Preventiva por condição')
    expect(categoriaManutencao('Preventiva sistemática')).toBe('Preventiva programada')
    expect(categoriaManutencao('Troca de óleo')).toBe('Preventiva programada')
    // Correção do bug do legado (spec §6): "não crítica" contém "crit", mas não é crítica (rótulo real do option set em DEV).
    expect(categoriaManutencao('Corretiva não crítica')).toBe('Corretiva não crítica')
    expect(categoriaManutencao('CORRETIVA NAO CRITICA')).toBe('Corretiva não crítica')
    expect(categoriaManutencao('Mecânica geral')).toBe('Corretiva não crítica')
    expect(categoriaManutencao('—')).toBe('Corretiva não crítica')
  })
})

describe('calcularManutencoes', () => {
  it('KPIs do período: total, custo, em andamento (andamento/aberto/pend), custo médio e % da receita', () => {
    const rows = [reserva({ valor: 4000 }), reserva({ valor: 6000 }), reserva({ valor: 9999, categoriaItem: 100000001 })]
    const mans = [
      manutencao({ valor: 300, statusLabel: 'Em andamento' }),
      manutencao({ valor: 200, statusLabel: 'Pendente aprovação' }),
      manutencao({ valor: 500, statusLabel: 'Realizado' }),
      manutencao({ valor: 0, statusLabel: 'Aberto' }),
      manutencao({ dia: '2026-08-31', valor: 999, statusLabel: 'Em andamento' }),
      manutencao({ dia: '', valor: 999 }),
    ]
    expect(calcularManutencoes(ctxDe(rows), dadosCom(mans)).kpis).toEqual({ total: 4, custoTotal: 1000, emAndamento: 3, custoMedio: 250, pctReceita: 10 })
  })

  it('sem receita, % da receita é 0; sem registro, custo médio 0; conjunto fora do ar vira null (s/dado)', () => {
    expect(calcularManutencoes(ctxDe(), dadosCom([manutencao({ valor: 100 })])).kpis?.pctReceita).toBe(0)
    expect(calcularManutencoes(ctxDe(), dadosCom([])).kpis).toEqual({ total: 0, custoTotal: 0, emAndamento: 0, custoMedio: 0, pctReceita: 0 })
    const fora = calcularManutencoes(ctxDe(), dadosCom([manutencao({ valor: 100 })], { indisponiveis: ['manutencoes'] }))
    expect(fora).toMatchObject({ kpis: null, custoPorMes: [], porTipoReparo: [], categorias: [], prazo: null })
  })

  it('custo por mês: soma do valor pelo mês da data da manutenção, meses em ordem', () => {
    const mans = [manutencao({ dia: '2026-10-02', valor: 100 }), manutencao({ dia: '2026-09-30', valor: 50 }), manutencao({ dia: '2026-10-10', valor: 25 })]
    expect(calcularManutencoes(ctxDe(), dadosCom(mans)).custoPorMes).toEqual([
      { mes: '2026-09', rotulo: 'set/26', valor: 50 },
      { mes: '2026-10', rotulo: 'out/26', valor: 125 },
    ])
  })

  it('por tipo de reparo: ordenado por quantidade, participação por custo e topByShare sobre o custo', () => {
    const mans = [
      manutencao({ tipoReparo: 'Corretiva não crítica', valor: 100 }), manutencao({ tipoReparo: 'Corretiva não crítica', valor: 100 }),
      manutencao({ tipoReparo: 'Avaria', valor: 600 }),
      manutencao({ tipoReparo: '—', valor: 200 }),
    ]
    const r = calcularManutencoes(ctxDe(), dadosCom(mans))
    expect(r.porTipoReparo).toEqual([
      { tipo: 'Corretiva não crítica', qtd: 2, valor: 200, pct: 20, pctQtd: 50 },
      { tipo: 'Avaria', qtd: 1, valor: 600, pct: 60, pctQtd: 25 },
      { tipo: '—', qtd: 1, valor: 200, pct: 20, pctQtd: 25 },
    ])
    // Com mais de 3 tipos, só os acima de 10% do custo (se forem pelo menos 3).
    const muitos = [...mans, manutencao({ tipoReparo: 'Conservação', valor: 10 })]
    expect(calcularManutencoes(ctxDe(), dadosCom(muitos)).porTipoReparo.map((l) => l.tipo)).toEqual(['Corretiva não crítica', 'Avaria', '—'])
  })

  it('categorias: as 6 em ordem fixa, com quantidade, meta e status; LM só quando o filtro está no mês corrente; LY sempre', () => {
    const outubro: Filtros = { ...f, inicio: '2026-10-01', fim: '2026-10-15' }
    const mans = [
      manutencao({ dia: '2026-10-03', tipoReparo: 'Preventiva sistemática', criadoDia: '2026-09-28', aprovacaoDia: '2026-09-30' }),
      manutencao({ dia: '2026-10-05', tipoReparo: 'Corretiva crítica' }),
      manutencao({ dia: '2026-10-06', tipoReparo: 'Avaria' }),
      manutencao({ dia: '2026-09-10', tipoReparo: 'Corretiva crítica' }),
      manutencao({ dia: '2026-09-11', tipoReparo: 'Corretiva crítica' }),
      manutencao({ dia: '2025-10-07', tipoReparo: 'Avaria' }),
    ]
    const r = calcularManutencoes(ctxDe([], outubro), dadosCom(mans))
    expect(r.mostrarLM).toBe(true)
    expect(r.categorias.map((c) => [c.categoria, c.qtd, c.lm, c.ly])).toEqual([
      ['Preventiva programada', 1, 0, 0],
      ['Corretiva não crítica', 0, 0, 0],
      ['Corretiva crítica', 1, 2, 0],
      ['Conservação', 0, 0, 0],
      ['Avaria', 1, 0, 1],
      ['Preventiva por condição', 0, 0, 0],
    ])
    expect(cat(r, 'Corretiva crítica')).toMatchObject({ meta: 'Zero', status: 'fora' })
    expect(cat(r, 'Preventiva programada')).toMatchObject({ meta: 'Aprovação até a data em até 10 dias', status: 'dentro' })
    expect(cat(r, 'Avaria')).toMatchObject({ meta: null, status: 'sem-meta' })
    const setembro = calcularManutencoes(ctxDe(), dadosCom(mans))
    expect(setembro.mostrarLM).toBe(false)
    expect(setembro.categorias.every((c) => c.lm === null)).toBe(true)
  })

  it('metas: corretiva não crítica até 5 em cada mês; preventiva fora com aprovação a mais de 10 dias; sem medição é sem-dado', () => {
    const naoCrit = (dia: string) => manutencao({ dia, tipoReparo: 'Mecânica geral' })
    const cinco = [...Array.from({ length: 5 }, () => naoCrit('2026-09-05')), ...Array.from({ length: 5 }, () => naoCrit('2026-10-05'))]
    expect(cat(calcularManutencoes(ctxDe(), dadosCom(cinco)), 'Corretiva não crítica')).toMatchObject({ qtd: 10, meta: 'Até 5 por mês', status: 'dentro' })
    expect(cat(calcularManutencoes(ctxDe(), dadosCom([...cinco, naoCrit('2026-10-06')])), 'Corretiva não crítica')).toMatchObject({ status: 'fora' })
    expect(cat(calcularManutencoes(ctxDe(), dadosCom([])), 'Corretiva crítica')).toMatchObject({ qtd: 0, status: 'dentro' })

    const prev = (aprovacaoDia: string, dia = '2026-10-12') => manutencao({ dia, aprovacaoDia, tipoReparo: 'Preventiva sistemática' })
    expect(cat(calcularManutencoes(ctxDe(), dadosCom([prev('2026-10-02'), prev('2026-10-11')])), 'Preventiva programada')).toMatchObject({ status: 'dentro' })
    expect(cat(calcularManutencoes(ctxDe(), dadosCom([prev('2026-10-01'), prev('2026-10-11')])), 'Preventiva programada')).toMatchObject({ status: 'fora' })
    // Sem aprovação ou com aprovação depois da data não mede.
    expect(cat(calcularManutencoes(ctxDe(), dadosCom([prev(''), prev('2026-10-13')])), 'Preventiva programada')).toMatchObject({ status: 'sem-dado' })
  })

  it('prazo: média de dias entre a criação (createdon) e a data, % em até 10 dias; negativos e sem data ficam fora; LM/LY', () => {
    const outubro: Filtros = { ...f, inicio: '2026-10-01', fim: '2026-10-15' }
    const mans = [
      manutencao({ dia: '2026-10-11', criadoDia: '2026-10-01' }),
      manutencao({ dia: '2026-10-14', criadoDia: '2026-10-01' }),
      manutencao({ dia: '2026-10-05', criadoDia: '2026-10-05' }),
      manutencao({ dia: '2026-10-05', criadoDia: '2026-10-06' }),
      manutencao({ dia: '2026-10-05', criadoDia: '' }),
      manutencao({ dia: '2026-09-10', criadoDia: '2026-09-06' }),
    ]
    const r = calcularManutencoes(ctxDe([], outubro), dadosCom(mans))
    expect(r.prazo?.medio).toBeCloseTo(23 / 3, 10)
    expect(r.prazo).toMatchObject({ medidos: 3, lm: 4, ly: null })
    expect(r.prazo?.ate10).toBeCloseTo(200 / 3, 10)
    expect(calcularManutencoes(ctxDe(), dadosCom([manutencao()])).prazo).toMatchObject({ medio: null, ate10: null, medidos: 0 })
  })
})
