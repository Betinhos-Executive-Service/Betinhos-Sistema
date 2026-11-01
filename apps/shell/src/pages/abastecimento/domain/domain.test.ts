import { describe, expect, it } from 'vitest'
import { detectarAnomalias } from './anomalias'
import { gerarAlertas, gerarDicas, montarContextoIA } from './dicas'
import { acharMotorista, chaveDe, cobertaPorExtrato, lerLinhas, prepararImportacao } from './importacao'
import { filtrar, kmPorLitroPorAbastecimento, mesesDisponiveis, resumoPorMotorista, resumoPorVeiculo, totais, trechos } from './indicadores'
import { carregarMapeamento, faltamNoMapeamento, mapeamentoInicial, salvarMapeamento, sugerirMapeamento } from './mapeamento'
import { detectarSeparador, normalizarPlaca, parseCsv, parseData, parseNumero } from './parse'
import type { Abastecimento, Motorista, Veiculo } from './types'

const VEICULOS: Veiculo[] = [
  { id: 'v1', placa: 'TST1A11', modelo: 'Corolla', motoristaId: 'm1', motorista: 'Carlos Alberto Teste', capacidadeTanque: 50, ativo: true },
  { id: 'v2', placa: 'TST2B22', modelo: 'Virtus', motoristaId: 'm2', motorista: 'Bruna Ficticia Lima', capacidadeTanque: null, ativo: true },
]
const MOTORISTAS: Motorista[] = [
  { id: 'm1', nome: 'Carlos Alberto Teste', ativo: true },
  { id: 'm2', nome: 'Bruna Ficticia Lima', ativo: true },
  { id: 'm3', nome: 'Carlos Eduardo Teste', ativo: true },
]
const base = (n: number, extra: Partial<Abastecimento>): Abastecimento => ({
  id: `a${n}`, data: new Date(2026, 9, n, 8, 0), veiculoId: 'v1', placa: 'TST1A11', motoristaId: 'm1', motorista: 'Carlos Alberto Teste',
  litros: 40, valor: 240, precoLitro: 6, posto: 'Posto A', combustivel: 'Gasolina', origem: 'ctf', odometro: null, chave: `k${n}`, arquivo: 'x.csv', ...extra,
})

describe('parse', () => {
  it('detecta o separador e lê aspas, vírgula decimal e quebras CRLF', () => {
    const csv = '﻿Data;Placa;Litros;"Valor (R$)"\r\n01/10/2026 08:15;ABC-1D23;"45,5";"1.234,56"\r\n\r\n02/10/2026;ABC1D23;30;"R$ 180,00"\r\n'
    expect(detectarSeparador(csv)).toBe(';')
    expect(parseCsv(csv)).toEqual([['Data', 'Placa', 'Litros', 'Valor (R$)'], ['01/10/2026 08:15', 'ABC-1D23', '45,5', '1.234,56'], ['02/10/2026', 'ABC1D23', '30', 'R$ 180,00']])
    expect(detectarSeparador('a,b,c\n1,2,3')).toBe(',')
    expect(parseCsv('a,b\n"x, y",2')).toEqual([['a', 'b'], ['x, y', '2']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('números pt-BR, com ponto decimal e milhar com ponto', () => {
    expect(parseNumero('1.234,56')).toBe(1234.56)
    expect(parseNumero('R$ 45,90')).toBe(45.9)
    expect(parseNumero('45.9')).toBe(45.9)
    expect(parseNumero('123.456')).toBe(123456)
    expect(parseNumero('45,9 L')).toBe(45.9)
    expect(parseNumero('')).toBeNull()
    expect(parseNumero('abc')).toBeNull()
    expect(parseNumero(12.5)).toBe(12.5)
  })
  it('datas em vários formatos, hora separada e número de série do Excel', () => {
    expect(parseData('01/10/2026 08:15')).toEqual(new Date(2026, 9, 1, 8, 15))
    expect(parseData('01/10/26', '14:30:10')).toEqual(new Date(2026, 9, 1, 14, 30, 10))
    expect(parseData('2026-10-01T10:05:00')).toEqual(new Date(2026, 9, 1, 10, 5))
    expect(parseData('31/02/2026')).toBeNull()
    expect(parseData('ontem')).toBeNull()
    expect(parseData(46296)?.toDateString()).toBe(new Date(2026, 9, 1).toDateString())
    expect(parseData('46296', '09:00')?.getHours()).toBe(9)
    expect(parseData('46296', '0.4375')).toEqual(new Date(2026, 9, 1, 10, 30))
    expect(parseData('01/10/2026', '0,75')).toEqual(new Date(2026, 9, 1, 18, 0))
  })
  it('normaliza placa', () => { expect(normalizarPlaca(' abc-1d23 ')).toBe('ABC1D23') })
})

describe('mapeamento', () => {
  it('sugere pelos cabeçalhos do CTF e do Ticket Log, sem repetir coluna', () => {
    const ctf = sugerirMapeamento(['Data Transação', 'Hora', 'Placa', 'Motorista', 'Produto', 'Litros', 'Valor Unitário', 'Valor Total', 'Hodômetro', 'Estabelecimento'])
    expect(ctf).toEqual({ data: 'Data Transação', hora: 'Hora', placa: 'Placa', motorista: 'Motorista', litros: 'Litros', valor: 'Valor Total', precoLitro: 'Valor Unitário', posto: 'Estabelecimento', combustivel: 'Produto', odometro: 'Hodômetro' })
    const ticket = sugerirMapeamento(['DATA', 'VEÍCULO', 'CONDUTOR', 'COMBUSTÍVEL', 'QUANTIDADE', 'VALOR', 'KM', 'NOME FANTASIA'])
    expect(ticket).toMatchObject({ data: 'DATA', placa: 'VEÍCULO', motorista: 'CONDUTOR', litros: 'QUANTIDADE', valor: 'VALOR', odometro: 'KM', posto: 'NOME FANTASIA' })
    expect(faltamNoMapeamento(sugerirMapeamento(['Data', 'Descrição', 'Valor']), ['Data', 'Descrição', 'Valor'])).toEqual(['placa', 'litros'])
  })
  it('salva e recarrega por operadora; salvo que não serve ao arquivo volta à sugestão', () => {
    const store = new Map<string, string>()
    const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) } }
    expect(carregarMapeamento(kv, 'ctf')).toBeNull()
    salvarMapeamento(kv, 'ctf', { data: 'Dt', placa: 'Pl', litros: 'Lt', valor: 'Vl' })
    expect(carregarMapeamento(kv, 'ctf')).toEqual({ data: 'Dt', placa: 'Pl', litros: 'Lt', valor: 'Vl' })
    expect(carregarMapeamento(kv, 'ticket')).toBeNull()
    expect(mapeamentoInicial(kv, 'ctf', ['Dt', 'Pl', 'Lt', 'Vl'])).toEqual({ mapeamento: { data: 'Dt', placa: 'Pl', litros: 'Lt', valor: 'Vl' }, salvo: true })
    expect(mapeamentoInicial(kv, 'ctf', ['Data', 'Placa', 'Litros', 'Valor']).salvo).toBe(false)
    store.set('betinhos.abastecimento.mapeamento.ctf', '{bad')
    expect(carregarMapeamento(kv, 'ctf')).toBeNull()
  })
})

describe('importação', () => {
  const cab = ['Data', 'Placa', 'Motorista', 'Litros', 'Valor', 'Km']
  const m = { data: 'Data', placa: 'Placa', motorista: 'Motorista', litros: 'Litros', valor: 'Valor', odometro: 'Km' }
  const linhas = [
    ['01/10/2026 08:00', 'TST-1A11', 'Carlos A. Teste', '40,0', '240,00', '100000'],
    ['01/10/2026 08:00', 'TST-1A11', 'Carlos A. Teste', '40,0', '240,00', '100000'],
    ['02/10/2026 09:00', 'XYZ9Z99', '', '30', '180', ''],
    ['03/10/2026', 'TST2B22', 'Alguém Desconhecido', '0', '0', ''],
    ['', 'TST2B22', '', '10', '60', ''],
    ['04/10/2026', 'TST2B22', '', '35', '210', ''],
  ]
  it('lê as linhas pelo mapeamento', () => {
    const lidas = lerLinhas(cab, linhas, m)
    expect(lidas[0]).toMatchObject({ linha: 2, placa: 'TST1A11', litros: 40, valor: 240, odometro: 100000, motorista: 'Carlos A. Teste' })
    expect(lidas[0].data).toEqual(new Date(2026, 9, 1, 8, 0))
    expect(lidas[4].data).toBeNull()
  })
  it('preço do extrato lido como milhar ("6.199") cai para valor ÷ litros', () => {
    const l = lerLinhas(['Data', 'Placa', 'Litros', 'Valor', 'Preço'], [['01/10/2026 08:00', 'TST1A11', '40', '248', '6.199']], { data: 'Data', placa: 'Placa', litros: 'Litros', valor: 'Valor', precoLitro: 'Preço' })
    expect(prepararImportacao({ linhas: l, origem: 'ctf', arquivo: 'x.csv', existentes: [], veiculos: VEICULOS, motoristas: MOTORISTAS }).novos[0].precoLitro).toBe(6.2)
  })
  it('cria novos, ignora duplicados (arquivo e base), aponta pendências e inválidas', () => {
    const r = prepararImportacao({ linhas: lerLinhas(cab, linhas, m), origem: 'ctf', arquivo: 'ctf.csv', existentes: [], veiculos: VEICULOS, motoristas: MOTORISTAS })
    expect(r.novos).toHaveLength(3)
    expect(r.duplicados).toBe(1)
    expect(r.pendentes).toBe(1)
    expect(r.invalidas).toEqual([{ linha: 5, motivo: 'litros ou valor zerados' }, { linha: 6, motivo: 'sem data' }])
    expect(r.novos[0]).toMatchObject({ veiculoId: 'v1', motoristaId: 'm1', motorista: 'Carlos Alberto Teste', precoLitro: 6, chave: chaveDe('ctf', new Date(2026, 9, 1, 8, 0), 'TST1A11', 40, 240) })
    // Placa sem cadastro: entra sem veículo; sem motorista no extrato nem veículo, fica vazio.
    expect(r.novos[1]).toMatchObject({ veiculoId: null, placa: 'XYZ9Z99', motoristaId: null, motorista: '' })
    // Sem motorista no extrato, vale o motorista atual do veículo.
    expect(r.novos[2]).toMatchObject({ veiculoId: 'v2', motoristaId: 'm2', motorista: 'Bruna Ficticia Lima' })
    // Segunda importação do mesmo arquivo: nada novo.
    const r2 = prepararImportacao({ linhas: lerLinhas(cab, linhas, m), origem: 'ctf', arquivo: 'ctf.csv', existentes: r.novos.map((n) => n.chave), veiculos: VEICULOS, motoristas: MOTORISTAS })
    expect(r2.novos).toHaveLength(0)
    expect(r2.duplicados).toBe(4)
  })
  it('acha o motorista por nome exato ou primeiro+último; ambíguo só com o motorista atual do veículo', () => {
    expect(acharMotorista('carlos alberto teste', MOTORISTAS)?.id).toBe('m1')
    expect(acharMotorista('Carlos Teste', MOTORISTAS)).toBeNull()
    expect(acharMotorista('Carlos A. Teste', MOTORISTAS, 'm3')?.id).toBe('m3')
    expect(acharMotorista('Bruna Lima', MOTORISTAS)?.id).toBe('m2')
    expect(acharMotorista('', MOTORISTAS)).toBeNull()
  })
  it('despesa do App coberta pelo extrato: mesmo veículo, dia e valor (±R$ 0,50)', () => {
    const extrato = base(1, {})
    expect(cobertaPorExtrato(base(1, { id: 'd', origem: 'app', valor: 240.3, data: new Date(2026, 9, 1, 20, 0) }), [extrato])).toBe(true)
    expect(cobertaPorExtrato(base(1, { id: 'd', origem: 'app', valor: 250 }), [extrato])).toBe(false)
    expect(cobertaPorExtrato(base(1, { id: 'd', origem: 'app', veiculoId: null }), [extrato])).toBe(false)
  })
})

describe('indicadores', () => {
  const lista = [
    base(1, { odometro: 100000 }),
    base(5, { odometro: 100400, litros: 40 }), // 10 km/l
    base(9, { odometro: 100800, litros: 50 }), // 8 km/l
    base(13, { odometro: null, litros: 45 }), // sem odômetro: sem trecho
    base(17, { odometro: 101300, litros: 50 }), // vem depois de um sem odômetro: sem trecho
    base(21, { odometro: 101700, litros: 40 }), // 10 km/l
    base(2, { id: 'b1', veiculoId: 'v2', placa: 'TST2B22', motoristaId: 'm2', motorista: 'Bruna Ficticia Lima', litros: 30, valor: 210, odometro: null }),
    base(3, { id: 'b2', veiculoId: 'v2', placa: 'TST2B22', motoristaId: 'm2', motorista: 'Bruna Ficticia Lima', litros: 30, valor: 210, odometro: null }),
  ]
  it('km/l entre abastecimentos seguidos com odômetro; sem odômetro fica vazio', () => {
    const ts = trechos(lista)
    expect(ts.map((t) => [t.ate.id, t.km, t.kmPorLitro])).toEqual([['a5', 400, 10], ['a9', 400, 8], ['a21', 400, 10]])
    const porItem = kmPorLitroPorAbastecimento(ts)
    expect(porItem.get('a13')).toBeUndefined()
    expect(porItem.get('a5')).toBe(10)
  })
  it('resumo por veículo, por motorista e totais', () => {
    const ts = trechos(lista)
    const rv = resumoPorVeiculo(lista, ts, VEICULOS)
    const v1 = rv.find((r) => r.veiculoId === 'v1')!
    expect(v1).toMatchObject({ placa: 'TST1A11', modelo: 'Corolla', qtd: 6, litros: 265, valor: 1440, precoMedio: 1440 / 265, motoristas: ['Carlos Alberto Teste'] })
    expect(v1.kmPorLitro).toBeCloseTo(1200 / 130, 5)
    expect(v1.ultimo).toEqual(new Date(2026, 9, 21, 8, 0))
    expect(rv.find((r) => r.veiculoId === 'v2')).toMatchObject({ qtd: 2, kmPorLitro: null, precoMedio: 7 })
    const rm = resumoPorMotorista(lista, ts)
    expect(rm.find((r) => r.motoristaId === 'm2')).toMatchObject({ nome: 'Bruna Ficticia Lima', qtd: 2, litros: 60, valor: 420, kmPorLitro: null, placas: ['TST2B22'] })
    expect(totais(lista, ts)).toMatchObject({ qtd: 8, litros: 325, valor: 1860 })
  })
  it('filtro por mês e motorista; trechos continuam do histórico inteiro', () => {
    const nov = base(30, { id: 'n1', data: new Date(2026, 10, 2, 8, 0), odometro: 102100, litros: 40 })
    const tudo = [...lista, nov]
    const ts = trechos(tudo)
    const soNov = filtrar(tudo, { mes: '2026-11', motoristaId: null, veiculoId: null })
    expect(soNov).toEqual([nov])
    expect(totais(soNov, ts).kmPorLitro).toBe(10)
    expect(filtrar(tudo, { mes: null, motoristaId: 'm2', veiculoId: null })).toHaveLength(2)
    expect(filtrar(tudo, { mes: null, motoristaId: null, veiculoId: 'v2' })).toHaveLength(2)
    expect(mesesDisponiveis(tudo)).toEqual(['2026-11', '2026-10'])
  })
})

describe('anomalias e propostas', () => {
  const lista = [
    base(1, { odometro: 100000 }),
    base(3, { odometro: 100400, litros: 40 }),
    base(5, { odometro: 100800, litros: 40 }),
    base(7, { odometro: 101200, litros: 40 }),
    base(9, { odometro: 101600, litros: 40 }),
    base(11, { odometro: 101800, litros: 55, valor: 330 }), // 3,6 km/l e acima do tanque de 50 L
    base(12, { id: 'x2', data: new Date(2026, 9, 12, 8, 30), litros: 10, valor: 60, odometro: null }), // 30 min depois do anterior do dia 12
    base(12, { id: 'x1', data: new Date(2026, 9, 12, 8, 0), litros: 10, valor: 60, odometro: null }),
  ]
  it('detecta tanque, consumo fora de 2 desvios e intervalo curto, com motivo', () => {
    const an = detectarAnomalias(lista, trechos(lista), VEICULOS)
    expect(an.map((a) => [a.tipo, a.abastecimento.id, a.gravidade])).toEqual([['intervalo', 'x2', 'media'], ['tanque', 'a11', 'alta'], ['consumo', 'a11', 'media']])
    expect(an.find((a) => a.tipo === 'tanque')!.motivo).toBe('55,0 L em um tanque de 50 L')
    expect(an.find((a) => a.tipo === 'consumo')!.motivo).toBe('3,6 km/l; histórico do veículo 10,0 ± 1,0')
    expect(an.find((a) => a.tipo === 'intervalo')!.motivo).toBe('30 min depois do anterior (08:00 e 08:30)')
  })
  it('sem capacidade cadastrada e com menos de 4 trechos não acusa', () => {
    const curto = [base(1, { veiculoId: 'v2', placa: 'TST2B22', odometro: 1000, litros: 60 }), base(2, { veiculoId: 'v2', placa: 'TST2B22', odometro: 1100, litros: 60 })]
    expect(detectarAnomalias(curto, trechos(curto), VEICULOS)).toEqual([])
  })
  it('alertas agrupam por veículo; dicas por motorista comparam com o veículo e com o preço da frota', () => {
    const ts = trechos(lista)
    const alertas = gerarAlertas(detectarAnomalias(lista, ts, VEICULOS))
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({ tipo: 'FrotaConsumo', prioridade: 'alta', titulo: 'TST1A11: 3 anomalias de abastecimento', alvo: { entidade: 'cr40f_veiculos', id: 'v1', nome: 'TST1A11' } })
    // m3 dirige o mesmo carro com consumo pior e paga mais caro, sem odômetro na maioria.
    const m3 = [
      base(20, { id: 'c1', motoristaId: 'm3', motorista: 'Carlos Eduardo Teste', odometro: 102000, litros: 40, valor: 280 }),
      base(22, { id: 'c2', motoristaId: 'm3', motorista: 'Carlos Eduardo Teste', odometro: 102240, litros: 40, valor: 280 }), // 6 km/l
      base(24, { id: 'c3', motoristaId: 'm3', motorista: 'Carlos Eduardo Teste', odometro: 102480, litros: 40, valor: 280 }), // 6 km/l
      base(25, { id: 'c4', motoristaId: 'm3', motorista: 'Carlos Eduardo Teste', odometro: null, litros: 40, valor: 280 }),
      base(26, { id: 'c5', motoristaId: 'm3', motorista: 'Carlos Eduardo Teste', odometro: null, litros: 40, valor: 280 }),
      base(27, { id: 'c6', motoristaId: 'm3', motorista: 'Carlos Eduardo Teste', odometro: null, litros: 40, valor: 280 }),
    ]
    const tudo = [...lista, ...m3]
    const ts2 = trechos(tudo)
    const dicas = gerarDicas({ lista: tudo, ts: ts2, motoristas: resumoPorMotorista(tudo, ts2), veiculos: resumoPorVeiculo(tudo, ts2, VEICULOS) })
    expect(dicas.map((d) => d.id)).toEqual(['dica:consumo:m3', 'dica:preco:m3', 'dica:odometro:m3'])
    expect(dicas[0]).toMatchObject({ tipo: 'FrotaDicaCombustivel', alvo: { entidade: 'cr40f_funcionarios', id: 'm3' } })
    expect(dicas[0].titulo).toMatch(/^Carlos Eduardo Teste: consumo \d+% pior no TST1A11$/)
    expect(dicas[2].titulo).toBe('Carlos Eduardo Teste: odômetro em branco em 3 de 6')
    const ctx = montarContextoIA(new Date(2026, 10, 1), resumoPorVeiculo(tudo, ts2, VEICULOS), resumoPorMotorista(tudo, ts2), detectarAnomalias(tudo, ts2, VEICULOS))
    expect(ctx.hoje).toBe('2026-11-01')
    expect(ctx.veiculos[0]).toMatchObject({ placa: 'TST1A11' })
    expect(ctx.anomalias.length).toBeGreaterThan(0)
    expect(JSON.stringify(ctx)).not.toContain('chave')
    // Dicas só olham os trechos do período filtrado: sem os abastecimentos do m3 no filtro, nenhuma dica de consumo.
    const soOutros = tudo.filter((a) => a.motoristaId !== 'm3')
    const dicas2 = gerarDicas({ lista: soOutros, ts: ts2, motoristas: resumoPorMotorista(soOutros, ts2), veiculos: resumoPorVeiculo(soOutros, ts2, VEICULOS) })
    expect(dicas2.some((d) => d.id === 'dica:consumo:m3')).toBe(false)
  })
})
