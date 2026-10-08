import { describe, expect, it } from 'vitest'
import { brl, brlS } from '../format'
import type { CategoriaDespesa, Despesa, FormaPagamento } from '../types'
import { calcularDespesas, filtrarDespesas, periodoAnteriorDespesa, type FiltrosDespesa, type KpiDespesa } from './despesas'

let seq = 0
/** Despesa de teste: R$ 0 com comprovante completo, sem motorista nem reserva; `mes` (Brasília) segue o dia salvo se não vier; sobrescreva o que importa. */
function despesa(p: Partial<Despesa> = {}): Despesa {
  const dia = p.dia ?? '2026-10-05'
  seq++
  return {
    id: `d${seq}`, dia, mes: dia.slice(0, 7), valor: 0, categoriaId: '', categoria: 'Sem categoria', formaId: '', forma: 'Sem forma de pagamento',
    empresa: 'Sem empresa', motoristaId: '', motorista: 'Sem motorista', reservaId: '', statusFinanceiro: null, statusAnexo: 100000002, anexos: 0,
    descricao: 'Despesa sem título', ...p,
  }
}

const SEM_FILTRO: FiltrosDespesa = { categorias: [], formas: [], empresas: [] }
const OUT = { inicio: '2026-10-01', fim: '2026-10-31' }
const CATEGORIAS: CategoriaDespesa[] = [
  { id: 'c-almoco', nome: 'Almoço', grupoDre: 'Custos operacionais' },
  { id: 'c-hosp', nome: 'Hospedagem', grupoDre: 'Viagens' },
  { id: 'c-comb', nome: 'Combustível', grupoDre: 'Custos operacionais' },
  { id: 'c-cafe', nome: 'Café da manhã', grupoDre: 'Custos operacionais' },
  { id: 'c-jantar', nome: 'Jantar', grupoDre: 'Custos operacionais' },
]
const FORMAS: FormaPagamento[] = [{ id: 'f-pix', nome: 'Pix' }, { id: 'f-cartao', nome: 'Cartão corporativo' }]
const cat = (id: string) => ({ categoriaId: id, categoria: CATEGORIAS.find((c) => c.id === id)!.nome })

/** Outubro: total 620, alimentação 50, aguardando 410, 5 lançamentos, 2 sem comprovante, hospedagem média 150. */
const atuais = () => [
  despesa({ ...cat('c-almoco'), valor: 50, statusAnexo: 100000000, anexos: 0, motoristaId: 'm1', motorista: 'Ana Souza', empresa: 'BETINHOS', formaId: 'f-pix', forma: 'Pix' }),
  despesa({ ...cat('c-hosp'), valor: 160, statusFinanceiro: 100000001, motoristaId: 'm1', motorista: 'Ana Souza', empresa: 'BETINHOS', dia: '2026-10-06' }),
  despesa({ ...cat('c-hosp'), valor: 140, statusAnexo: null, anexos: 1, motoristaId: 'm2', motorista: 'Bruno Lima', empresa: 'DEPAULA', dia: '2026-10-20' }),
  despesa({ ...cat('c-comb'), valor: 250, statusFinanceiro: 100000001, statusAnexo: 100000004, anexos: 0, motoristaId: 'm2', motorista: 'Bruno Lima', empresa: 'DEPAULA', formaId: 'f-cartao', forma: 'Cartão corporativo' }),
  despesa({ ...cat('c-cafe'), valor: 20, empresa: 'BETINHOS' }),
]
/** Janela anterior de outubro (31/08 a 30/09): total 500, alimentação 100, aguardando 400, 1 sem comprovante. */
const anteriores = () => [
  despesa({ ...cat('c-jantar'), valor: 100, statusAnexo: 100000000, dia: '2026-09-15' }),
  despesa({ ...cat('c-hosp'), valor: 400, statusFinanceiro: 100000001, dia: '2026-08-31' }),
  despesa({ ...cat('c-hosp'), valor: 999, dia: '2026-08-30' }),
]
const kpi = (kpis: KpiDespesa[], id: KpiDespesa['id']) => kpis.find((k) => k.id === id)!

describe('periodoAnteriorDespesa (getPreviousExpensePeriod)', () => {
  it('é a janela imediatamente anterior com o mesmo número de dias', () => {
    expect(periodoAnteriorDespesa('2026-10-01', '2026-10-31')).toEqual({ inicio: '2026-08-31', fim: '2026-09-30' })
    expect(periodoAnteriorDespesa('2026-03-01', '2026-03-07')).toEqual({ inicio: '2026-02-22', fim: '2026-02-28' })
    expect(periodoAnteriorDespesa('2026-01-01', '2026-01-01')).toEqual({ inicio: '2025-12-31', fim: '2025-12-31' })
  })
  it('sem período válido devolve null', () => {
    expect(periodoAnteriorDespesa('', '2026-10-31')).toBeNull()
    expect(periodoAnteriorDespesa('2026-10-31', '2026-10-01')).toBeNull()
  })
})

describe('filtrarDespesas (expenseMatchesFilters)', () => {
  const rows = [
    despesa({ id: 'a', dia: '2026-10-01', categoriaId: 'c-almoco', formaId: 'f-pix', empresa: 'BETINHOS', motoristaId: 'm1', motorista: 'Ana Souza' }),
    despesa({ id: 'b', dia: '2026-10-31', categoriaId: 'c-hosp', formaId: 'f-cartao', empresa: 'DEPAULA', motorista: 'João Paulo' }),
    despesa({ id: 'c', dia: '2026-11-01', categoriaId: 'c-almoco' }),
    despesa({ id: 'd', dia: '' }),
  ]
  const ids = (f: Partial<FiltrosDespesa>) => filtrarDespesas(rows, OUT, { ...SEM_FILTRO, ...f }).map((d) => d.id)

  it('período inclusivo e sem data fica fora', () => expect(ids({})).toEqual(['a', 'b']))
  it('categoria e forma por id, empresa pelo rótulo', () => {
    expect(ids({ categorias: ['c-almoco'] })).toEqual(['a'])
    expect(ids({ formas: ['f-cartao'] })).toEqual(['b'])
    expect(ids({ empresas: ['BETINHOS', 'DEPAULA'] })).toEqual(['a', 'b'])
    expect(ids({ categorias: ['c-almoco'], empresas: ['DEPAULA'] })).toEqual([])
  })
  it('motorista do filtro global casa pelo id ou pela chave nome: normalizada', () => {
    expect(ids({ motoristas: ['{M1}'] })).toEqual(['a'])
    expect(ids({ motoristas: ['nome:joao paulo'] })).toEqual(['b'])
    // A chave das reservas sem id é `nome:` + normL: acento e caixa não separam o mesmo motorista.
    expect(ids({ motoristas: ['nome:João Paulo'] })).toEqual(['b'])
    expect(ids({ motoristas: ['m9'] })).toEqual([])
  })
})

describe('calcularDespesas: os 6 KPIs', () => {
  const r = calcularDespesas([...atuais(), ...anteriores()], CATEGORIAS, FORMAS, OUT, SEM_FILTRO, periodoAnteriorDespesa(OUT.inicio, OUT.fim), false)

  it('valores do período, crus, com o formato do legado (brlS, brl no ticket e na hospedagem, inteiro no sem comprovante)', () => {
    expect(r.lancamentos).toBe(5)
    expect(r.total).toBe(620)
    expect(r.kpis.map((k) => [k.id, k.valor, k.formato])).toEqual([
      ['despesa', 620, 'brlS'],
      ['alimentacao', 50, 'brlS'],
      ['aguardando', 410, 'brlS'],
      ['ticket', 124, 'brl'],
      ['semComprovante', 2, 'int'],
      ['hospedagem', 150, 'brl'],
    ])
  })

  it('chip ANT. contra a janela anterior; subir é desfavorável', () => {
    expect(kpi(r.kpis, 'despesa').chip).toEqual({ rotulo: 'ANT.', tipo: 'valor', anterior: brlS(500), variacao: 24, favoravel: false })
    expect(kpi(r.kpis, 'alimentacao').chip).toEqual({ rotulo: 'ANT.', tipo: 'valor', anterior: brlS(100), variacao: -50, favoravel: true })
    expect(kpi(r.kpis, 'aguardando').chip).toMatchObject({ tipo: 'valor', anterior: brlS(400), favoravel: false })
    expect((kpi(r.kpis, 'aguardando').chip as { variacao: number }).variacao).toBeCloseTo(2.5)
    expect(kpi(r.kpis, 'ticket').chip).toMatchObject({ tipo: 'valor', anterior: brlS(250), favoravel: true })
    expect((kpi(r.kpis, 'ticket').chip as { variacao: number }).variacao).toBeCloseTo(-50.4)
    expect(kpi(r.kpis, 'semComprovante').chip).toEqual({ rotulo: 'ANT.', tipo: 'valor', anterior: '1', variacao: 100, favoravel: false })
  })

  it('média de hospedagem não tem chip; mostra a faixa da política', () => {
    const h = kpi(r.kpis, 'hospedagem')
    expect(h.chip).toBeNull()
    expect(h.faixa).toEqual({ tom: 'ok', texto: 'Dentro da meta', apoio: `Alvo ${brl(150)} · teto ${brl(200)}` })
  })

  it('variação zero é favorável (expenseDeltaMarkup: delta <= 0 com higherIsWorse)', () => {
    const iguais = [despesa({ valor: 100 }), despesa({ valor: 100, dia: '2026-09-15' })]
    const z = calcularDespesas(iguais, CATEGORIAS, FORMAS, OUT, SEM_FILTRO, periodoAnteriorDespesa(OUT.inicio, OUT.fim), false)
    expect(kpi(z.kpis, 'despesa').chip).toEqual({ rotulo: 'ANT.', tipo: 'valor', anterior: brlS(100), variacao: 0, favoravel: true })
  })

  it('base zero e sem período anterior', () => {
    const base = calcularDespesas(atuais(), CATEGORIAS, FORMAS, OUT, SEM_FILTRO, { inicio: '2026-08-31', fim: '2026-09-30' }, false)
    expect(kpi(base.kpis, 'despesa').chip).toEqual({ rotulo: 'ANT.', tipo: 'base-zero', anterior: brlS(0) })
    expect(kpi(base.kpis, 'semComprovante').chip).toEqual({ rotulo: 'ANT.', tipo: 'base-zero', anterior: '0' })
    const sem = calcularDespesas(atuais(), CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false)
    expect(kpi(sem.kpis, 'despesa').chip).toEqual({ rotulo: 'ANT.', tipo: 'sem-dado' })
  })

  it('despesas indisponíveis: KPIs null (s/dado), sem chip, série nem faixa, como o dvDisabled do legado', () => {
    const fora = calcularDespesas(atuais(), CATEGORIAS, FORMAS, OUT, SEM_FILTRO, periodoAnteriorDespesa(OUT.inicio, OUT.fim), true)
    expect(fora.kpis.map((k) => k.id)).toEqual(['despesa', 'alimentacao', 'aguardando', 'ticket', 'semComprovante', 'hospedagem'])
    for (const k of fora.kpis) expect(k).toMatchObject({ valor: null, chip: null, serie: [] })
    expect(kpi(fora.kpis, 'hospedagem').faixa).toBeUndefined()
    expect(fora).toMatchObject({ lancamentos: 0, total: 0, porMes: [], porMotorista: [] })
  })

  it('o período anterior respeita os filtros próprios', () => {
    const f = calcularDespesas([...atuais(), ...anteriores()], CATEGORIAS, FORMAS, OUT, { ...SEM_FILTRO, categorias: ['c-hosp'] }, periodoAnteriorDespesa(OUT.inicio, OUT.fim), false)
    expect(f.total).toBe(300)
    expect(kpi(f.kpis, 'despesa').chip).toMatchObject({ anterior: brlS(400), variacao: -25, favoravel: true })
  })

  it('faixas da hospedagem: atenção até R$ 200, fora acima, sem lançamentos', () => {
    const faixa = (valor: number) => kpi(calcularDespesas([despesa({ ...cat('c-hosp'), valor })], CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false).kpis, 'hospedagem').faixa
    expect(faixa(200)).toMatchObject({ tom: 'warn', texto: 'Atenção' })
    expect(faixa(200.01)).toMatchObject({ tom: 'danger', texto: 'Fora da política' })
    const vazio = calcularDespesas([], CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false)
    expect(kpi(vazio.kpis, 'hospedagem').valor).toBeNull()
    expect(kpi(vazio.kpis, 'hospedagem').faixa).toMatchObject({ tom: 'neutral', texto: 'Sem lançamentos' })
    expect(kpi(vazio.kpis, 'ticket').valor).toBe(0)
  })

  it('séries mensais: totais por mês e média de hospedagem por mês', () => {
    const rows = [
      despesa({ ...cat('c-almoco'), valor: 30, dia: '2026-09-10' }),
      despesa({ ...cat('c-hosp'), valor: 100, dia: '2026-09-11' }),
      despesa({ ...cat('c-hosp'), valor: 300, dia: '2026-10-02' }),
      despesa({ ...cat('c-hosp'), valor: 100, dia: '2026-10-03' }),
    ]
    const s = calcularDespesas(rows, CATEGORIAS, FORMAS, { inicio: '2026-09-01', fim: '2026-10-31' }, SEM_FILTRO, null, false)
    expect(kpi(s.kpis, 'despesa').serie).toEqual([{ mes: '2026-09', rotulo: 'set/26', valor: 130 }, { mes: '2026-10', rotulo: 'out/26', valor: 400 }])
    expect(kpi(s.kpis, 'alimentacao').serie.map((p) => p.valor)).toEqual([30, 0])
    expect(kpi(s.kpis, 'ticket').serie.map((p) => p.valor)).toEqual([65, 200])
    expect(kpi(s.kpis, 'hospedagem').serie.map((p) => p.valor)).toEqual([100, 200])
  })

  it('borda do mês: gasto às 23h de 30/09 em Brasília (01/10 02:00Z) entra no período pelo dia salvo e na série de setembro (mK)', () => {
    // O mapper grava dia = texto bruto (2026-10-01) e mes = mês em Brasília (2026-09).
    const borda = despesa({ ...cat('c-hosp'), valor: 120, dia: '2026-10-01', mes: '2026-09' })
    const s = calcularDespesas([borda, despesa({ ...cat('c-hosp'), valor: 180, dia: '2026-10-02' })], CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false)
    expect(s.lancamentos).toBe(2)
    expect(s.porMes.map((l) => [l.mes, l.valor])).toEqual([['2026-09', 120], ['2026-10', 180]])
    expect(kpi(s.kpis, 'despesa').serie.map((p) => [p.mes, p.valor])).toEqual([['2026-09', 120], ['2026-10', 180]])
    expect(kpi(s.kpis, 'hospedagem').serie.map((p) => [p.mes, p.valor])).toEqual([['2026-09', 120], ['2026-10', 180]])
    expect(kpi(s.kpis, 'hospedagem').valor).toBe(150)
  })
})

describe('calcularDespesas: blocos', () => {
  const r = calcularDespesas([...atuais(), ...anteriores()], CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false)

  it('despesas por mês com lançamentos, despesa e alimentação', () => {
    const s = calcularDespesas([
      despesa({ ...cat('c-almoco'), valor: 30, dia: '2026-10-10', statusFinanceiro: 100000001, statusAnexo: 100000000 }),
      despesa({ ...cat('c-comb'), valor: 70, dia: '2026-09-11' }),
    ], CATEGORIAS, FORMAS, { inicio: '2026-09-01', fim: '2026-10-31' }, SEM_FILTRO, null, false)
    expect(s.porMes).toEqual([
      { mes: '2026-09', rotulo: 'set/26', lancamentos: 1, valor: 70, alimentacao: 0, aguardando: 0, ticket: 70, semComprovante: 0 },
      { mes: '2026-10', rotulo: 'out/26', lancamentos: 1, valor: 30, alimentacao: 30, aguardando: 30, ticket: 30, semComprovante: 1 },
    ])
  })

  it('por categoria: valor desc, participação por valor e % de lançamentos', () => {
    expect(r.porCategoria.grupos).toBe(4)
    // Almoço (8%) e Café (3%) ficam abaixo de 10%: sobram 2 elegíveis, então entram os 3 primeiros.
    expect(r.porCategoria.linhas.map((l) => l.rotulo)).toEqual(['Hospedagem', 'Combustível', 'Almoço'])
    expect(r.porCategoria.linhas[0]).toEqual({ rotulo: 'Hospedagem', lancamentos: 2, pctLancamentos: 40, valor: 300, participacao: (300 / 620) * 100 })
    expect(r.porCategoria.grafico).toHaveLength(4)
  })

  it('por empresa e grupos DRE (pelo cadastro da categoria; sem cadastro vira "Sem grupo DRE")', () => {
    expect(r.porEmpresa.linhas.map((l) => [l.rotulo, l.valor])).toEqual([['DEPAULA', 390], ['BETINHOS', 230]])
    expect(r.gruposDre.linhas.map((l) => [l.rotulo, l.valor])).toEqual([['Custos operacionais', 320], ['Viagens', 300]])
    const semCadastro = calcularDespesas([despesa({ categoriaId: 'x', categoria: 'Outros', valor: 10 })], CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false)
    expect(semCadastro.gruposDre.linhas.map((l) => l.rotulo)).toEqual(['Sem grupo DRE'])
  })

  it('topByShare corta a cauda abaixo de 10% quando sobram 3 ou mais', () => {
    const rows = [500, 400, 300, 10, 5].map((valor, i) => despesa({ categoriaId: `k${i}`, categoria: `Cat ${i}`, valor }))
    const t = calcularDespesas(rows, CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false)
    expect(t.porCategoria.linhas.map((l) => l.rotulo)).toEqual(['Cat 0', 'Cat 1', 'Cat 2'])
    expect(t.porCategoria.grupos).toBe(5)
    expect(t.porCategoria.grafico).toHaveLength(5)
  })

  it('por motorista une hospedagem, alimentação e total; "Sem motorista" fica fora', () => {
    expect(r.porMotorista).toEqual([
      { key: 'm2', motorista: 'Bruno Lima', hospedagem: 140, hospedagemMedia: 140, alimentacao: 0, alimentacaoMediaDia: 0, total: 390, lancamentos: 2 },
      { key: 'm1', motorista: 'Ana Souza', hospedagem: 160, hospedagemMedia: 160, alimentacao: 50, alimentacaoMediaDia: 50, total: 210, lancamentos: 2 },
    ])
  })

  it('alimentação por motorista: média por dia distinto com gasto', () => {
    const rows = [
      despesa({ ...cat('c-almoco'), valor: 40, motoristaId: 'm1', motorista: 'Ana', dia: '2026-10-01' }),
      despesa({ ...cat('c-jantar'), valor: 60, motoristaId: 'm1', motorista: 'Ana', dia: '2026-10-01' }),
      despesa({ ...cat('c-almoco'), valor: 50, motoristaId: 'm1', motorista: 'Ana', dia: '2026-10-02' }),
    ]
    const m = calcularDespesas(rows, CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false).porMotorista[0]
    expect(m).toMatchObject({ alimentacao: 150, alimentacaoMediaDia: 75, hospedagem: 0, hospedagemMedia: null, lancamentos: 3 })
  })

  it('opções: categorias e formas do cadastro, empresas distintas de todas as despesas, em ordem alfabética', () => {
    const o = calcularDespesas([...atuais(), despesa({ empresa: 'ACME', dia: '2025-01-01' })], CATEGORIAS, FORMAS, OUT, SEM_FILTRO, null, false).opcoes
    expect(o.categorias.map((c) => c.label)).toEqual(['Almoço', 'Café da manhã', 'Combustível', 'Hospedagem', 'Jantar'])
    expect(o.formas).toEqual([{ value: 'f-cartao', label: 'Cartão corporativo' }, { value: 'f-pix', label: 'Pix' }])
    expect(o.empresas.map((e) => e.value)).toEqual(['ACME', 'BETINHOS', 'DEPAULA'])
  })
})
