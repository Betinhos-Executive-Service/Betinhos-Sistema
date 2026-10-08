import { describe, expect, it } from 'vitest'
import { alertaScore, linhasScore, notaPorMes, ordenarLinhasScore, rankingMensal, scoreMotoristas } from './score'
import { evento, telemetria, viagem } from './test-utils'
import type { EventoConducao, TelemetriaDia, Viagem } from './types'

const v = (p: Partial<Viagem> = {}): Viagem => viagem({ dia: '2026-10-05', mes: '2026-10', veiculoId: 'v1', motoristaId: 'm1', distancia: 100, ...p })
const e = (p: Partial<EventoConducao> = {}): EventoConducao => evento({ dia: '2026-10-05', mes: '2026-10', motoristaId: 'm1', tipo: 'hardAcceleration', ...p })
const t = (p: Partial<TelemetriaDia> = {}): TelemetriaDia => telemetria({ dia: '2026-10-05', mes: '2026-10', veiculoId: 'v1', ociosoMin: 0, ...p })
const mais = <T,>(n: number, make: () => T) => Array.from({ length: n }, make)
const INI = '2026-10-01'
const FIM = '2026-10-15'

describe('scoreMotoristas (renderDriverSafetyScore do legado)', () => {
  it('nota conhecida: 250 km, 5 acelerações, 2 frenagens e 12 min de motor ocioso dão 82', () => {
    // aceleração 5/250*100 = 2,0 → 100*(4-2)/3,5 = 57,14; frenagem 0,8 → 91,43; ocioso 12/250*100 = 4,8 → 100.
    // 57,14*0,35 + 91,43*0,35 + 100*0,30 = 20 + 32 + 30 = 82.
    const viagens = [v({ distancia: 100 }), v({ dia: '2026-10-06', distancia: 150 })]
    const eventos = [
      ...mais(3, () => e()), ...mais(2, () => e({ tipo: '  HardAcceleration ' })),
      ...mais(2, () => e({ tipo: 'HARDBRAKING' })), ...mais(3, () => e({ tipo: 'hardCornering' })), e({ tipo: 'driverChanged' }),
    ]
    const telemetria = [t({ ociosoMin: 7 }), t({ dia: '2026-10-06', ociosoMin: 5 })]
    expect(scoreMotoristas(viagens, eventos, telemetria, INI, FIM)).toEqual({ media: 82, validas: 1 })
    const [linha] = linhasScore(viagens, eventos, telemetria, INI, FIM)
    expect(linha).toMatchObject({ motoristaId: 'm1', mes: '2026-10', distancia: 250, suficiente: true, nota: 82 })
    expect(linha.taxaAceleracao).toBeCloseTo(2, 10)
    expect(linha.taxaFrenagem).toBeCloseTo(0.8, 10)
    expect(linha.taxaOcioso).toBeCloseTo(4.8, 10)
  })

  it('componentes entre o limite bom e o ruim são proporcionais; acima do ruim zera', () => {
    // 200 km, 3 acelerações (1,5 → 71,43), 1 frenagem (0,5 → 100), 21 min ociosos (10,5 → 72,5): 25 + 35 + 21,75 = 81,75 → 82.
    // 100 km, 4 acelerações (4,0 → 0), 4 frenagens (4,0 → 0), 25 min ociosos (25,0 → 0): nota 0. Média (82 + 0) / 2 = 41.
    const viagens = [v({ distancia: 200 }), v({ motoristaId: 'm2', veiculoId: 'v2', distancia: 100 })]
    const eventos = [...mais(3, () => e()), e({ tipo: 'hardbraking' }), ...mais(4, () => e({ motoristaId: 'm2' })), ...mais(4, () => e({ motoristaId: 'm2', tipo: 'hardbraking' }))]
    const telemetria = [t({ ociosoMin: 21 }), t({ veiculoId: 'v2', ociosoMin: 25 })]
    const linhas = linhasScore(viagens, eventos, telemetria, INI, FIM)
    expect(linhas.find((l) => l.motoristaId === 'm1')?.nota).toBe(82)
    expect(linhas.find((l) => l.motoristaId === 'm2')?.nota).toBe(0)
    expect(scoreMotoristas(viagens, eventos, telemetria, INI, FIM)).toEqual({ media: 41, validas: 2 })
  })

  it('média das linhas válidas: dois motoristas no mesmo mês, nota 82 e 100, dão 91', () => {
    const viagens = [
      v({ distancia: 100 }), v({ dia: '2026-10-06', distancia: 150 }),
      v({ motoristaId: 'm2', veiculoId: 'v2', distancia: 400 }),
    ]
    const eventos = [...mais(5, () => e()), ...mais(2, () => e({ tipo: 'hardBraking' }))]
    const telemetria = [t({ ociosoMin: 12 }), t({ veiculoId: 'v2', ociosoMin: 0 })]
    expect(scoreMotoristas(viagens, eventos, telemetria, INI, FIM)).toEqual({ media: 91, validas: 2 })
  })

  it('o mesmo motorista em dois meses gera duas linhas, cada uma com a sua nota', () => {
    const viagens = [v({ dia: '2026-09-20', mes: '2026-09', distancia: 120 }), v({ distancia: 120 })]
    const telemetria = [t({ dia: '2026-09-20', mes: '2026-09' }), t()]
    expect(scoreMotoristas(viagens, [], telemetria, '2026-09-01', FIM)).toEqual({ media: 100, validas: 2 })
  })

  it('veículo com 2 motoristas no mês não distribui ocioso: ninguém tem nota', () => {
    const viagens = [v({ distancia: 120 }), v({ motoristaId: 'm2', distancia: 130 })]
    const telemetria = [t({ ociosoMin: 4 })]
    const linhas = linhasScore(viagens, [], telemetria, INI, FIM)
    expect(linhas).toHaveLength(2)
    expect(linhas.every((l) => !l.suficiente && l.nota === null && l.taxaOcioso === null)).toBe(true)
    expect(scoreMotoristas(viagens, [], telemetria, INI, FIM)).toEqual({ media: null, validas: 0 })
  })

  it('o mesmo veículo com motoristas diferentes em meses diferentes dá nota aos dois', () => {
    const viagens = [v({ dia: '2026-09-10', mes: '2026-09', distancia: 110 }), v({ motoristaId: 'm2', distancia: 110 })]
    const telemetria = [t({ dia: '2026-09-10', mes: '2026-09' }), t()]
    expect(scoreMotoristas(viagens, [], telemetria, '2026-09-01', FIM)).toEqual({ media: 100, validas: 2 })
  })

  it('menos de 100 km no mês é insuficiente; 100 km exatos servem', () => {
    const telemetria = [t()]
    expect(scoreMotoristas([v({ distancia: 99.9 })], [], telemetria, INI, FIM)).toEqual({ media: null, validas: 0 })
    expect(scoreMotoristas([v({ distancia: 60 }), v({ distancia: 40 })], [], telemetria, INI, FIM)).toEqual({ media: 100, validas: 1 })
  })

  it('sem telemetria do veículo no mês o ocioso é desconhecido e a linha é insuficiente', () => {
    expect(scoreMotoristas([v({ distancia: 500 })], [], [], INI, FIM)).toEqual({ media: null, validas: 0 })
    expect(scoreMotoristas([v({ distancia: 500 })], [], [t({ veiculoId: 'outro' })], INI, FIM)).toEqual({ media: null, validas: 0 })
  })

  it('linhas sem motorista, veículo ou mês são ignoradas', () => {
    const viagens = [v({ motoristaId: '', distancia: 100 }), v({ veiculoId: '', distancia: 100 }), v({ mes: '', distancia: 100 }), v({ distancia: 60 })]
    const linhas = linhasScore(viagens, [], [t()], INI, FIM)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].distancia).toBe(60)
    expect(scoreMotoristas(viagens, [e({ motoristaId: '' }), e({ mes: '' })], [t()], INI, FIM)).toEqual({ media: null, validas: 0 })
  })

  it('o período filtra viagens, eventos e telemetria pelo dia, com início e fim inclusivos', () => {
    // 60 km em 01/10 e 60 km em 15/10 contam (120 km); 100 km em 30/09 e em 16/10 ficam de fora.
    const viagens = [v({ dia: '2026-10-01', distancia: 60 }), v({ dia: '2026-10-15', distancia: 60 }), v({ dia: '2026-09-30', mes: '2026-09', distancia: 100 }), v({ dia: '2026-10-16', distancia: 100 })]
    // Aceleração fora do período (16/10) não conta; sem ela a nota é 100. Contando daria 97.
    const eventos = [e({ dia: '2026-10-16' }), e({ dia: '2026-09-30', mes: '2026-09' })]
    expect(scoreMotoristas(viagens, eventos, [t({ dia: '2026-10-15' })], INI, FIM)).toEqual({ media: 100, validas: 1 })
    // Ocioso só fora do período deixa o ocioso desconhecido.
    expect(scoreMotoristas(viagens, eventos, [t({ dia: '2026-10-20' }), t({ dia: '2026-09-30', mes: '2026-09' })], INI, FIM)).toEqual({ media: null, validas: 0 })
    // Viagem sem dia (data ausente) nunca entra no período.
    expect(scoreMotoristas([v({ dia: '', distancia: 500 })], [], [t()], INI, FIM)).toEqual({ media: null, validas: 0 })
  })

  it('o mês vem do texto bruto, sem fuso: a linha do motorista usa o mês de `mes`, não o de `dia`', () => {
    // 01/11 01:00Z é 31/10 22:00 em Brasília: `dia` cai no período de outubro, mas o mês bruto é 2026-11.
    const viagens = [v({ dia: '2026-10-31', mes: '2026-11', distancia: 150 })]
    const [linha] = linhasScore(viagens, [], [t({ dia: '2026-10-31', mes: '2026-11' })], '2026-10-01', '2026-10-31')
    expect(linha).toMatchObject({ mes: '2026-11', distancia: 150, suficiente: true })
  })

  it('sem dados não há média', () => {
    expect(scoreMotoristas([], [], [], INI, FIM)).toEqual({ media: null, validas: 0 })
  })
})

describe('alertaScore', () => {
  it('mostra a média, a quantidade de notas válidas e o tom por faixa (>= 80 ok, >= 60 atenção, senão perigo)', () => {
    expect(alertaScore({ media: 82, validas: 3 }, false)).toEqual({ id: 'score', valor: '82', rotulo: 'Score motoristas', status: '3 notas válidas', tom: 'ok' })
    expect(alertaScore({ media: 80, validas: 2 }, false).tom).toBe('ok')
    expect(alertaScore({ media: 79, validas: 2 }, false).tom).toBe('warn')
    expect(alertaScore({ media: 60, validas: 2 }, false).tom).toBe('warn')
    expect(alertaScore({ media: 59, validas: 2 }, false).tom).toBe('danger')
    expect(alertaScore({ media: 0, validas: 1 }, false)).toMatchObject({ valor: '0', tom: 'danger' })
  })

  it('sem nota válida mostra traço em atenção', () => {
    expect(alertaScore({ media: null, validas: 0 }, false)).toEqual({ id: 'score', valor: '—', rotulo: 'Score motoristas', status: '0 notas válidas', tom: 'warn' })
  })

  it('conjunto indisponível vira s/dado neutro', () => {
    expect(alertaScore({ media: 90, validas: 4 }, true)).toEqual({ id: 'score', valor: '—', rotulo: 'Score motoristas', status: 's/dado', tom: 'neutral' })
  })
})

describe('linhas, ranking mensal e nota por mês (tblDriverSafetyScore, tblTopMotMonthly e cDriverSafetyScore do legado)', () => {
  it('cada linha expõe a nota de cada componente; linha insuficiente fica sem componentes', () => {
    // 200 km, 3 acelerações (1,5 → 71,43), 1 frenagem (0,5 → 100), 21 min ociosos (10,5 → 72,5).
    const viagens = [v({ distancia: 200 }), v({ motoristaId: 'm2', veiculoId: 'v2', distancia: 50 })]
    const eventos = [...mais(3, () => e()), e({ tipo: 'hardbraking' })]
    const linhas = linhasScore(viagens, eventos, [t({ ociosoMin: 21 }), t({ veiculoId: 'v2' })], INI, FIM)
    const m1 = linhas.find((l) => l.motoristaId === 'm1')
    expect(m1?.notaAceleracao).toBeCloseTo(71.428571, 5)
    expect(m1?.notaFrenagem).toBe(100)
    expect(m1?.notaOcioso).toBeCloseTo(72.5, 10)
    expect(linhas.find((l) => l.motoristaId === 'm2')).toMatchObject({ suficiente: false, nota: null, notaAceleracao: null, notaFrenagem: null, notaOcioso: null })
  })

  it('ordena por mês desc, nota desc (sem nota por último) e km desc', () => {
    const viagens = [
      v({ dia: '2026-09-10', mes: '2026-09', distancia: 150 }),
      v({ motoristaId: 'm2', veiculoId: 'v2', distancia: 300 }),
      v({ motoristaId: 'm3', veiculoId: 'v3', distancia: 500 }),
      v({ motoristaId: 'm4', veiculoId: 'v4', distancia: 50 }),
      v({ motoristaId: 'm5', veiculoId: 'v5', distancia: 120 }),
    ]
    const eventos = [...mais(4, () => e({ motoristaId: 'm3' }))]
    const telemetria = [t({ dia: '2026-09-10', mes: '2026-09' }), t({ veiculoId: 'v2' }), t({ veiculoId: 'v3' }), t({ veiculoId: 'v4' }), t({ veiculoId: 'v5' })]
    const ordem = ordenarLinhasScore(linhasScore(viagens, eventos, telemetria, '2026-09-01', FIM)).map((l) => `${l.mes}:${l.motoristaId}`)
    // out: m2 (100, 300 km), m5 (100, 120 km), m3 (0,8/100 km → 91 com ocioso 0: nota menor), m4 sem nota; set: m1.
    expect(ordem).toEqual(['2026-10:m2', '2026-10:m5', '2026-10:m3', '2026-10:m4', '2026-09:m1'])
  })

  it('ranking mensal: meses em ordem, top 5 notas válidas, desempate por km e depois por nome', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const viagens = [
      ...ids.map((id, i) => v({ motoristaId: id, veiculoId: `v${id}`, distancia: 200 + (i === 1 ? 100 : 0) })),
      v({ dia: '2026-09-10', mes: '2026-09', motoristaId: 'a', veiculoId: 'va', distancia: 100 }),
      v({ motoristaId: 'g', veiculoId: 'vg', distancia: 80 }),
    ]
    // f perde nota (8 acelerações em 200 km = 4/100 km → componente 0 → nota 65).
    const eventos = mais(8, () => e({ motoristaId: 'f' }))
    const telemetria = [...ids.map((id) => t({ veiculoId: `v${id}` })), t({ dia: '2026-09-10', mes: '2026-09', veiculoId: 'va' }), t({ veiculoId: 'vg' })]
    const nomes: Record<string, string> = { a: 'Zeca', b: 'Bia', c: 'Ana', d: 'Caio', e: 'Duda', f: 'Fábio' }
    const r = rankingMensal(linhasScore(viagens, eventos, telemetria, '2026-09-01', FIM), (id) => nomes[id] ?? 'Motorista vinculado')
    expect(r.map((m) => m.mes)).toEqual(['2026-09', '2026-10'])
    expect(r[0]).toMatchObject({ rotulo: 'set/26', ranking: [{ motoristaId: 'a', nome: 'Zeca', nota: 100, distancia: 100 }] })
    // out: todos 100 exceto f (65); b tem mais km; c, d, e, a empatam em km → por nome: Ana, Caio, Duda, Zeca. g sem nota fica fora.
    expect(r[1].ranking.map((p) => p.nome)).toEqual(['Bia', 'Ana', 'Caio', 'Duda', 'Zeca'])
  })

  it('nota por mês: média sem arredondar das notas válidas de cada mês, meses em ordem', () => {
    const viagens = [
      v({ distancia: 200 }), v({ motoristaId: 'm2', veiculoId: 'v2', distancia: 100 }),
      v({ dia: '2026-09-10', mes: '2026-09', motoristaId: 'm3', veiculoId: 'v3', distancia: 150 }),
      v({ dia: '2026-08-10', mes: '2026-08', motoristaId: 'm4', veiculoId: 'v4', distancia: 50 }),
    ]
    const eventos = [...mais(3, () => e()), e({ tipo: 'hardbraking' }), ...mais(4, () => e({ motoristaId: 'm2' })), ...mais(4, () => e({ motoristaId: 'm2', tipo: 'hardbraking' }))]
    const telemetria = [t({ ociosoMin: 21 }), t({ veiculoId: 'v2', ociosoMin: 25 }), t({ dia: '2026-09-10', mes: '2026-09', veiculoId: 'v3' }), t({ dia: '2026-08-10', mes: '2026-08', veiculoId: 'v4' })]
    expect(notaPorMes(linhasScore(viagens, eventos, telemetria, '2026-08-01', FIM))).toEqual([
      { mes: '2026-09', rotulo: 'set/26', nota: 100, validas: 1 },
      { mes: '2026-10', rotulo: 'out/26', nota: 41, validas: 2 },
    ])
  })
})
