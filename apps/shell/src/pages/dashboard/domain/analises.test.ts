import { describe, expect, it } from 'vitest'
import { alertasOperacao, alertasQualidade, cardsFrotaPessoas, type Secundarios } from './alertas'
import { emergenciais, producaoPropriaTerceira } from './destaques'
import { custoFrota, faturamentoPorCliente, metaRealizado, servicosPorMotorista, statusServicos, topByShare, topFaturamento, topVolume, totalProduzido } from './analises'
import { filtrarServicos } from './base'
import { comparacao } from './kpis'
import { reserva } from './test-utils'
import type { Filtros } from './types'

const NOW = new Date('2026-10-15T15:00:00Z')
const nowMs = NOW.getTime()
const f = (p: Partial<Filtros> = {}): Filtros => ({ atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [], ...p })
const vazio: Secundarios = { manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], indisponiveis: [] }
const SEM_NOTA = { media: null, validas: 0 }

describe('alertas', () => {
  it('CNH: só funcionário "ativo" com validade até 90 dias; multas e ocorrências', () => {
    const s: Secundarios = {
      ...vazio,
      funcionarios: [
        { statusLabel: 'Ativo', cnhMs: nowMs + 30 * 86_400_000 },
        { statusLabel: 'Ativo', cnhMs: NaN },
        { statusLabel: 'Inativo', cnhMs: nowMs },
        { statusLabel: 'Ativo', cnhMs: nowMs + 200 * 86_400_000 },
      ],
      multas: [{ dia: '2026-10-02', status: 202410000 }, { dia: '2026-10-03', status: 1 }],
      ocorrencias: [{ dia: '2026-10-02' }],
    }
    const rv = [reserva(), reserva(), reserva(), reserva()]
    const [cnh, multas, oco, score, ...resto] = alertasOperacao(rv, s, nowMs, { media: 72, validas: 3 })
    expect(cnh).toEqual({ id: 'cnh', valor: '1', rotulo: 'CNH', status: 'Atenção', tom: 'danger' })
    expect(multas).toEqual({ id: 'multas', valor: '1', rotulo: 'Multas', status: '50% pendentes', tom: 'danger' })
    expect(oco).toEqual({ id: 'ocorrencias', valor: '1', rotulo: 'Ocorrências', status: '25,0% dos serviços · 1 a cada 4', tom: 'danger' })
    expect(score).toEqual({ id: 'score', valor: '72', rotulo: 'Score motoristas', status: '3 notas válidas', tom: 'warn' })
    expect(resto).toEqual([])
    expect(alertasOperacao(rv, { ...vazio, indisponiveis: ['funcionarios'] }, nowMs, SEM_NOTA)[0]).toEqual({ id: 'cnh', valor: '—', rotulo: 'CNH', status: 's/dado', tom: 'neutral' })
    expect(alertasOperacao(rv, vazio, nowMs, SEM_NOTA)[3]).toEqual({ id: 'score', valor: '—', rotulo: 'Score motoristas', status: '0 notas válidas', tom: 'warn' })
  })

  it('Score motoristas vira s/dado se qualquer um dos três conjuntos do Infleet falhar, sem afetar os outros alertas', () => {
    for (const conjunto of ['viagens', 'eventos', 'telemetria'] as const) {
      const itens = alertasOperacao([], { ...vazio, indisponiveis: [conjunto] }, nowMs, { media: 90, validas: 4 })
      expect(itens.map((a) => a.id)).toEqual(['cnh', 'multas', 'ocorrencias', 'score'])
      expect(itens[3]).toEqual({ id: 'score', valor: '—', rotulo: 'Score motoristas', status: 's/dado', tom: 'neutral' })
      expect(itens[0].status).not.toBe('s/dado')
    }
    expect(alertasOperacao([], { ...vazio, indisponiveis: ['multas'] }, nowMs, { media: 90, validas: 4 })[3]).toMatchObject({ valor: '90', tom: 'ok' })
  })

  it('qualidade com as datas de corte do legado', () => {
    const rv = [
      reserva({ saidaRaw: '2026-07-01T12:00:00Z', motoristaId: 'm1', veiculoId: '' }),
      reserva({ saidaRaw: '2026-05-01T12:00:00Z', motoristaId: 'm1', veiculoId: '' }),
      reserva({ saidaRaw: '2026-07-01T12:00:00Z', motoristaId: '', status: 202410008 }),
      reserva({ saidaRaw: '2026-03-01T12:00:00Z', motoristaId: '', status: 202410008, cliente: 'Sem cliente' }),
      reserva({ saidaRaw: '2026-07-01T12:00:00Z', tipoVeiculoRaw: '', cliente: 'Tenaris', motoristaId: 'm1', veiculoId: 'v1' }),
    ]
    const q = Object.fromEntries(alertasQualidade(rv, nowMs).map((a) => [a.id, a]))
    expect(q.semVeiculo.valor).toBe('1')
    expect(q.semTipoVeiculo.valor).toBe('1')
    expect(q.semMotorista.valor).toBe('1')
    expect(q.semCliente).toMatchObject({ valor: '3', status: '60,0% dos serviços', tom: 'warn' })
  })

  it('cards de frota e pessoas', () => {
    const rv = [reserva({ valor: 1000 })]
    const s: Secundarios = { ...vazio, manutencoes: [{ dia: '2026-10-02', valor: 200 }], veiculos: [{ id: 'a', statusLabel: 'Disponível', categoria: '' }, { id: 'b', statusLabel: 'Inativo', categoria: '' }, { id: 'c', statusLabel: 'Em manutenção', categoria: '' }] }
    const c = Object.fromEntries(cardsFrotaPessoas(rv, s, nowMs).map((x) => [x.id, x]))
    expect(c.manutencoes).toMatchObject({ valor: '1', apoio: 'R$ 200,00 · 20,0% da receita', atencao: true })
    expect(c.frota).toMatchObject({ valor: '2', apoio: 'Total: 3' })
  })

  it('manutenção sem receita no período não marca atenção (pctRec = 0, como o card de custo da frota)', () => {
    const s: Secundarios = { ...vazio, manutencoes: [{ dia: '2026-10-02', valor: 200 }] }
    const c = Object.fromEntries(cardsFrotaPessoas([], s, nowMs).map((x) => [x.id, x]))
    expect(c.manutencoes).toMatchObject({ atencao: false })
    expect(c.manutencoes.apoio).toMatch(/ · 0,0% da receita$/)
  })
})

describe('destaques', () => {
  it('top 5 mantém motoristas homônimos separados pela chave', () => {
    const rv = [reserva({ veiculoId: 'v1', motorista: 'Ana', motoristaKey: 'k1', valor: 100 }), reserva({ veiculoId: 'v1', motorista: 'Ana', motoristaKey: 'k2', valor: 50 })]
    const p = producaoPropriaTerceira(rv, [{ id: 'v1', statusLabel: 'Disponível', categoria: 'Propria' }])
    expect(p.topPropria.map((t) => t.key)).toEqual(['k1', 'k2'])
  })

  it('produção própria × terceirizada e top 5 por faturamento', () => {
    const rv = [
      reserva({ veiculoId: 'v1', motorista: 'Ana', motoristaKey: 'm1', valor: 100 }),
      reserva({ veiculoId: 'v1', motorista: 'Ana', motoristaKey: 'm1', valor: 100 }),
      reserva({ veiculoId: 'v2', motorista: 'Bia', motoristaKey: 'm2', valor: 500 }),
      reserva({ veiculoId: 'v9', motorista: 'Cid', motoristaKey: 'm3', valor: 900 }),
    ]
    const p = producaoPropriaTerceira(rv, [{ id: 'v1', statusLabel: 'Disponível', categoria: 'Propria' }, { id: 'v2', statusLabel: 'Disponível', categoria: 'Terceirizada' }])
    expect(p.classificados).toBe(3)
    expect(p.meses).toEqual([{ mes: '2026-10', rotulo: 'out/26', propria: 2, terceirizada: 1 }])
    expect(p.topPropria).toEqual([{ key: 'm1', nome: 'Ana', qtd: 2, fat: 200 }])
  })

  it('emergencial = criado no mesmo dia (texto UTC) da saída', () => {
    const rv = [
      reserva({ cliente: 'Tenaris', criadoRaw: '2026-10-05T09:00:00Z', saidaRaw: '2026-10-05T15:00:00Z' }),
      reserva({ cliente: 'Tenaris', criadoRaw: '2026-10-06T09:00:00Z', saidaRaw: '2026-10-06T15:00:00Z' }),
      reserva({ cliente: 'Embraer', criadoRaw: '2026-10-07T09:00:00Z', saidaRaw: '2026-10-07T15:00:00Z' }),
      reserva({ cliente: 'Vale', criadoRaw: '2026-10-01T09:00:00Z', saidaRaw: '2026-10-07T15:00:00Z' }),
    ]
    const e = emergenciais(rv)
    expect(e).toMatchObject({ total: 3, de: 4, percentual: 75 })
    expect(e.top3.map((t) => t.cliente)).toEqual(['Tenaris', 'Embraer'])
    expect(e.meses[0].ranking[0]).toEqual({ cliente: 'Tenaris', qtd: 2 })
  })
})

describe('análises', () => {
  const todas = [
    reserva({ saidaRaw: '2026-10-02T12:00:00Z', cliente: 'Tenaris', valor: 600, cpConcluida: true, motorista: 'Ana', motoristaKey: 'm1' }),
    reserva({ saidaRaw: '2026-10-03T12:00:00Z', cliente: 'Embraer', valor: 300, cpConcluida: true, motorista: 'Ana', motoristaKey: 'm1', statusLabel: 'Cancelado' }),
    reserva({ saidaRaw: '2026-10-04T12:00:00Z', cliente: 'Sem cliente', valor: 100, motorista: 'Bia', motoristaKey: 'm2' }),
  ]
  const ctx = { todas, rv: filtrarServicos(todas, f()), f: f(), now: NOW }
  const cmp = comparacao(ctx)

  it('topByShare: >10% dos 10 primeiros, no mínimo 3', () => {
    expect(topByShare([50, 30, 15, 5], 100, (x) => x)).toEqual([50, 30, 15])
    expect(topByShare([90, 4, 3, 3], 100, (x) => x)).toEqual([90, 4, 3])
    expect(topByShare([1, 2], 0, (x) => x)).toEqual([1, 2])
  })

  it('total produzido: compara os mesmos meses nos 3 anos (filtro deslocado para cada ano), 2026 do Dataverse e meta proporcional', () => {
    const t = totalProduzido(ctx, cmp)
    expect(t.anos).toEqual([2024, 2025, 2026])
    expect(t.valor).toBe('R$ 1,0k')
    // 01 a 15/out de cada ano: 2024 e 2025 vêm da tabela fixa rateada pelos 15 dias; 2026 do Dataverse.
    expect(t.pontos).toHaveLength(1)
    expect(t.pontos[0].rotulo).toBe('Out')
    expect(t.pontos[0].valores[0]).toBeCloseTo((553994.72 / 31) * 15, 4)
    expect(t.pontos[0].valores[1]).toBeCloseTo((434559.4 / 31) * 15, 4)
    expect(t.pontos[0].valores[2]).toBe(1000)
    expect(t.apoio[0].rotulo).toBe('Meta')
    const anoTodo = { ...ctx, f: f({ atalho: 'anoAnt', inicio: '2025-01-01', fim: '2025-12-31' }) }
    const t2 = totalProduzido({ ...anoTodo, rv: filtrarServicos(todas, anoTodo.f) }, comparacao({ ...anoTodo, rv: [] }))
    expect(t2.pontos).toHaveLength(12)
    expect(t2.pontos[0].valores[1]).toBeCloseTo(336469.65, 4)
  })

  it('total produzido: filtro do ano corrente mostra os meses cobertos e os mesmos meses dos anos anteriores', () => {
    const esteAno = { ...ctx, f: f({ atalho: 'esteAno', inicio: '2026-01-01', fim: '2026-10-15' }) }
    const t = totalProduzido({ ...esteAno, rv: filtrarServicos(todas, esteAno.f) }, comparacao({ ...esteAno, rv: [] }))
    // Jan a set só têm dado nos anos fixos; out tem 2026 do Dataverse e o rateio de 15 dias dos anos fixos.
    expect(t.pontos.map((p) => p.rotulo)).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'])
    expect(t.pontos[0].valores[0]).toBeCloseTo(213816.57, 4)
    expect(t.pontos[0].valores[1]).toBeCloseTo(336469.65, 4)
    expect(t.pontos[0].valores[2]).toBeNull()
    expect(t.pontos[9].valores[1]).toBeCloseTo((434559.4 / 31) * 15, 4)
    expect(t.pontos[9].valores[2]).toBe(1000)
  })

  it('total produzido: com segmento os anos fixos ficam sem dado e só o Dataverse de 2026 aparece', () => {
    const seg = { ...ctx, f: f({ clientes: ['Tenaris'] }) }
    const t = totalProduzido({ ...seg, rv: filtrarServicos(todas, seg.f) }, comparacao({ ...seg, rv: [] }))
    expect(t.pontos).toEqual([{ rotulo: 'Out', valores: [null, null, 600] }])
  })

  it('total produzido: filtro que cruza o ano desloca mantendo a diferença de anos e começa pelo mês inicial', () => {
    const cruza = f({ atalho: 'personalizado', inicio: '2025-12-01', fim: '2026-01-31' })
    const dados = [...todas, reserva({ saidaRaw: '2026-01-10T12:00:00Z', valor: 700 })]
    const c = { todas: dados, rv: filtrarServicos(dados, cruza), f: cruza, now: NOW }
    const t = totalProduzido(c, comparacao(c))
    // Cada série cobre dez do ano anterior e jan do ano seguinte: [2023-12 e 2024-01], [2024-12 e 2025-01], [2025-12 e 2026-01].
    expect(t.pontos.map((p) => p.rotulo)).toEqual(['Dez', 'Jan'])
    const [dez, jan] = t.pontos.map((p) => p.valores)
    ;[281865.47, 330595.71, 438377.83].forEach((v, i) => expect(dez[i]).toBeCloseTo(v, 4))
    ;[213816.57, 336469.65].forEach((v, i) => expect(jan[i]).toBeCloseTo(v, 4))
    expect(jan[2]).toBe(700)
  })

  it('meta × realizado por mês do recorte', () => {
    const m = metaRealizado(ctx, cmp)
    expect(m.linhas).toHaveLength(1)
    expect(m.linhas[0]).toMatchObject({ mes: '2026-10', real: 1000 })
    expect(m.sub).toMatch(/^1 meses · /)
  })

  it('clientes, status, tops e motoristas', () => {
    expect(faturamentoPorCliente(ctx).linhas.map((l) => l.cliente)).toEqual(['Tenaris', 'Embraer'])
    const st = statusServicos(ctx)
    expect(st.sub).toBe('2 concluídos · 1 cancelados')
    expect(topVolume(ctx).linhas.map((l) => l.cliente)).toEqual(['Tenaris', 'Embraer', 'Sem cliente'])
    expect(topFaturamento(ctx).linhas[0]).toMatchObject({ cliente: 'Tenaris', valor: 'R$ 600,00' })
    const mot = servicosPorMotorista(ctx)
    expect(mot.valor).toBe('2')
    expect(mot.linhas[0]).toMatchObject({ nome: 'Ana', total: 2 })
  })

  it('custo da frota sobre o faturamento', () => {
    const c = custoFrota(ctx, [{ dia: '2026-10-02', valor: 150 }], false)
    expect(c.valor).toBe('R$ 150,00')
    expect(c.sub).toBe('1 manutenções · 15,0% da receita')
    expect(c.apoio[0]).toMatchObject({ atencao: true })
  })
})
