import { describe, expect, it } from 'vitest'
import { CONTA_ITAU, CONTA_NUBANK, createMockCartoes, createMockDespesas, createMockTransacoes } from '../data/mock'
import { candidatasPath, mapCartao, mapTransacao } from '../data/queries'
import {
  abaDe, acoes, CANAL, cartaoParaForm, cartaoVigente, csvLinhas, diasDesde, diferencaCandidata, ehCandidata, filtrar, FILTROS_VAZIOS, idadeTexto, janelaCandidatas,
  ordenar, resumoRevisar, SITUACAO, TIPO, validarCartao,
} from './regras'
import { filtrosCodec } from './url'
import type { Cartao, Transacao } from './types'

const trans = createMockTransacoes()
const t = (n: number) => trans[n - 1]
const cartao = (o: Partial<Cartao>): Cartao => ({ id: 'x', nome: 'X', conta: CONTA_ITAU, final: '', motoristaId: 'm1', motoristaNome: 'M1', inicio: '2026-01-01', fim: null, ...o })

describe('abas', () => {
  it('cada situação cai na aba certa; sem situação vai para revisar', () => {
    expect([SITUACAO.pendente, SITUACAO.semMotorista, SITUACAO.divergencia].map(abaDe)).toEqual(['revisar', 'revisar', 'revisar'])
    expect(abaDe(SITUACAO.aguardando)).toBe('aguardando')
    expect([SITUACAO.automatica, SITUACAO.manual].map(abaDe)).toEqual(['conciliadas', 'conciliadas'])
    expect(abaDe(SITUACAO.ignorada)).toBe('ignoradas')
    expect(abaDe(null)).toBe('revisar')
  })

  it('o mock cobre todas as situações', () => {
    expect(new Set(trans.map((x) => x.situacao))).toEqual(new Set(Object.values(SITUACAO)))
  })
})

describe('filtrar', () => {
  it('por cartão, motorista e período (limites inclusivos)', () => {
    expect(filtrar(trans, FILTROS_VAZIOS)).toHaveLength(trans.length)
    expect(filtrar(trans, { ...FILTROS_VAZIOS, cartaoId: t(1).cartaoId }).map((x) => x.id)).toEqual([t(1), t(5), t(7)].map((x) => x.id))
    expect(filtrar(trans, { ...FILTROS_VAZIOS, motoristaId: 'm3' }).map((x) => x.id)).toEqual([t(2).id, t(9).id])
    expect(filtrar(trans, { ...FILTROS_VAZIOS, de: '2026-10-28', ate: '2026-10-30' }).map((x) => x.id)).toEqual([t(3).id, t(4).id])
  })
})

describe('filtros novos da fila', () => {
  const ids = (l: Transacao[]) => l.map((x) => x.id)
  it('busca sem acento e por várias palavras (estabelecimento, motorista, placa)', () => {
    expect(ids(filtrar(trans, { ...FILTROS_VAZIOS, busca: 'posto shell' }))).toEqual([t(1).id, t(11).id])
    expect(ids(filtrar(trans, { ...FILTROS_VAZIOS, busca: 'ELAINE' }))).toEqual([])
    expect(ids(filtrar(trans, { ...FILTROS_VAZIOS, busca: 'fjk2b19' }))).toEqual([t(11).id])
    expect(ids(filtrar(trans, { ...FILTROS_VAZIOS, busca: 'diego restaurante' }))).toEqual([t(2).id])
  })
  it('canal vazio no registro conta como Itaú; situação exata', () => {
    expect(ids(filtrar(trans, { ...FILTROS_VAZIOS, canal: CANAL.ctf }))).toEqual([t(10).id, t(11).id])
    expect(filtrar(trans, { ...FILTROS_VAZIOS, canal: CANAL.pluggy })).toHaveLength(9)
    expect(ids(filtrar(trans, { ...FILTROS_VAZIOS, situacao: SITUACAO.semMotorista }))).toEqual([t(3).id, t(4).id, t(10).id])
  })
  it('resumo por situação soma quantidade e valor', () => {
    const r = resumoRevisar(trans)
    expect(r.get(SITUACAO.semMotorista)).toEqual({ qtd: 3, total: 120 + 64.5 + 412.37 })
    expect(r.get(SITUACAO.divergencia)).toEqual({ qtd: 1, total: 89.9 })
    expect(r.has(SITUACAO.ignorada)).toBe(false)
  })
  it('idade, ordem e diferença das candidatas', () => {
    expect(diasDesde('2026-11-03', '2026-11-12')).toBe(9)
    expect(diasDesde('2026-11-13', '2026-11-12')).toBe(0)
    expect([0, 1, 5].map(idadeTexto)).toEqual(['hoje', 'há 1 dia', 'há 5 dias'])
    expect(ordenar(trans, 'antigas')[0].id).toBe(t(6).id)
    expect(ordenar(trans, 'valor')[0].id).toBe(t(10).id)
    expect(ordenar(trans, 'recentes')).toBe(trans)
    expect(diferencaCandidata({ valor: 250.03, data: new Date('2026-11-04T15:00:00Z') }, t(1))).toEqual({ valor: 0.03, dias: 1 })
    // 01:00Z ainda é o dia anterior em São Paulo.
    expect(diferencaCandidata({ valor: 250, data: new Date('2026-11-03T01:00:00Z') }, t(1))).toEqual({ valor: 0, dias: -1 })
  })
  it('CSV leva data em dd/mm/aaaa, canal e situação por extenso', () => {
    const [linha] = csvLinhas([t(10)])
    expect(linha.slice(0, 4)).toEqual(['04/11/2026', 'POSTO GRAAL TAUBATE', 'POSTO GRAAL TAUBATE', 'CTF'])
    expect(linha).toContain('Sem motorista')
    expect(linha).toContain(412.37)
  })
  it('filtros vão e voltam da URL', () => {
    const f = { busca: 'shell', cartaoId: 'c1', motoristaId: 'm1', canal: CANAL.ctf, situacao: SITUACAO.pendente, de: '2026-10-01', ate: '2026-10-31' }
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(filtrosCodec.gravar(f))) if (typeof v === 'string') q.set(k, v)
    expect(filtrosCodec.ler(q)).toEqual(f)
    expect(filtrosCodec.ler(new URLSearchParams('cc-canal=x&cc-de=ontem'))).toEqual(FILTROS_VAZIOS)
  })
})

describe('ações', () => {
  it('reprocessar só sem motorista; casar só com motorista e sem despesa; reabrir só ignorada', () => {
    expect(acoes(t(3))).toEqual({ reprocessar: true, casar: false, ignorar: true, reabrir: false })
    expect(acoes(t(1))).toEqual({ reprocessar: false, casar: true, ignorar: true, reabrir: false })
    expect(acoes(t(7))).toEqual({ reprocessar: false, casar: false, ignorar: false, reabrir: false })
    expect(acoes(t(5)).casar).toBe(false)
    expect(acoes(t(8)).reabrir).toBe(true)
    expect(acoes({ ...t(3), tipo: TIPO.estorno }).reprocessar).toBe(false)
    expect(acoes(t(10)).reprocessar).toBe(false) // CTF: o flow do Itaú não trata
  })
})

describe('cartaoVigente', () => {
  const cartoes = createMockCartoes()
  it('acha o cartão da conta inteira para transação com final sem cartão próprio', () => {
    expect(cartaoVigente(cartoes, t(4))).toMatchObject({ cartao: { motoristaId: 'm4', conta: CONTA_NUBANK } })
  })
  it('sem cartão do final nem da conta inteira: nenhum', () => {
    expect(cartaoVigente(cartoes, t(3))).toEqual({ erro: 'nenhum' })
  })
  it('prefere o cartão do final ao da conta inteira', () => {
    const lista = [cartao({ id: 'geral', final: '' }), cartao({ id: 'esp', final: '9012', motoristaId: 'm2' })]
    expect(cartaoVigente(lista, t(3))).toMatchObject({ cartao: { id: 'esp' } })
  })
  it('transação sem final só aceita o cartão da conta inteira', () => {
    const lista = [cartao({ id: 'esp', final: '9012' })]
    expect(cartaoVigente(lista, { ...t(3), final: '' })).toEqual({ erro: 'nenhum' })
    expect(cartaoVigente([...lista, cartao({ id: 'geral' })], { ...t(3), final: '' })).toMatchObject({ cartao: { id: 'geral' } })
  })
  it('respeita a vigência: troca de motorista no meio do ano e cartão encerrado ou futuro', () => {
    expect(cartaoVigente(cartoes, { conta: CONTA_ITAU, final: '5678', dataCompra: '2026-09-30' })).toMatchObject({ cartao: { motoristaId: 'm2' } })
    expect(cartaoVigente(cartoes, { conta: CONTA_ITAU, final: '5678', dataCompra: '2026-10-01' })).toMatchObject({ cartao: { motoristaId: 'm3' } })
    expect(cartaoVigente([cartao({ final: '9012', fim: '2026-10-27' })], t(3))).toEqual({ erro: 'nenhum' })
    expect(cartaoVigente([cartao({ final: '9012', inicio: '2026-10-29' })], t(3))).toEqual({ erro: 'nenhum' })
    expect(cartaoVigente([cartao({ final: '9012', inicio: null })], t(3))).toEqual({ erro: 'nenhum' })
  })
  it('ignora cartão sem motorista e de outra conta; dois do mesmo nível = varios', () => {
    expect(cartaoVigente([cartao({ final: '9012', motoristaId: '' }), cartao({ final: '9012', conta: 'outra' })], t(3))).toEqual({ erro: 'nenhum' })
    expect(cartaoVigente([cartao({ id: 'a', final: '9012' }), cartao({ id: 'b', final: '9012' })], t(3))).toEqual({ erro: 'varios' })
    expect(cartaoVigente([cartao({ id: 'a' }), cartao({ id: 'b' })], t(3))).toEqual({ erro: 'varios' })
  })
})

describe('candidatas', () => {
  const despesas = createMockDespesas()
  const ids = (x: Transacao) => despesas.filter((d) => ehCandidata(d, x)).map((d) => d.nome)
  it('mesmo motorista, cartão, valor ±0,05 e data de -1 a +2 dias, não conciliada', () => {
    expect(ids(t(1))).toEqual(['Combustível Shell'])
    expect(ids(t(2))).toEqual(['Almoço com passageiro', 'Jantar viagem'])
    expect(ids(t(7))).toEqual([])
  })
  it('depois de reprocessar, a do motorista do cartão aparece', () => {
    expect(ids(t(4))).toEqual([])
    expect(ids({ ...t(4), motoristaId: 'm4' })).toEqual(['Lavagem do carro'])
  })
  it('compra parcelada usa o valor da compra inteira', () => {
    expect(janelaCandidatas({ valor: 100, totalParcelas: 3, dataCompra: '2026-10-31' })).toEqual({ alvo: 300, valorMin: 299.95, valorMax: 300.05, diaDe: '2026-10-30', diaAte: '2026-11-02', de: '2026-10-30T03:00:00Z', ate: '2026-11-03T03:00:00Z' })
  })
  it('recusada ou cancelada não casa', () => {
    const d = { ...despesas[0], statusOperacional: 100000004 }
    expect(ehCandidata(d, t(1))).toBe(false)
  })
  it('o $filter do Dataverse repete o critério do flow', () => {
    const f = decodeURIComponent(candidatasPath('desp', { ...t(1), motoristaId: 'M1' }, '{F1}'))
    expect(f).toContain('_cr40f_motorista_value eq m1 and _cr40f_formapagamento_value eq f1')
    expect(f).toContain('cr40f_valor ge 249.95 and cr40f_valor le 250.05 and cr40f_datagasto ge 2026-11-02T03:00:00Z and cr40f_datagasto lt 2026-11-06T03:00:00Z')
    expect(f).toContain('cr40f_statusoperacional ne 100000003 and cr40f_statusoperacional ne 100000004 and (cr40f_conciliadacartao eq false or cr40f_conciliadacartao eq null)')
  })
})

describe('mapas do Dataverse', () => {
  it('lê DateOnly e lookups', () => {
    const c = mapCartao({ cr40f_cartaocorporativoid: 'C1', cr40f_name: 'Itaú', cr40f_idconta: 'acc', cr40f_iniciovigencia: '2026-01-01', _cr40f_motorista_value: 'M1', '_cr40f_motorista_value@OData.Community.Display.V1.FormattedValue': 'Carlos' })
    expect(c).toMatchObject({ id: 'c1', final: '', inicio: '2026-01-01', fim: null, motoristaId: 'm1', motoristaNome: 'Carlos' })
    const tr = mapTransacao({ cr40f_transacaocartaoid: 'T1', cr40f_datacompra: '2026-10-28', cr40f_valor: 12.5, cr40f_situacao: SITUACAO.semMotorista })
    expect(tr).toMatchObject({ id: 't1', dataCompra: '2026-10-28', valor: 12.5, motoristaId: '', cartaoId: '' })
  })
})

describe('validarCartao', () => {
  const cartoes = createMockCartoes()
  const ok = { ...cartaoParaForm(null), nome: 'Novo', conta: CONTA_ITAU, final: '9012', motoristaId: 'm5', inicio: '2026-10-01' }
  it('aceita cartão novo sem sobreposição', () => { expect(validarCartao(ok, cartoes, null)).toEqual({}) })
  it('exige campos e final de 4 dígitos', () => {
    const e = validarCartao({ ...cartaoParaForm(null), final: '12' }, cartoes, null)
    expect(Object.keys(e).sort()).toEqual(['conta', 'final', 'inicio', 'motoristaId', 'nome'])
  })
  it('fim antes do início', () => { expect(validarCartao({ ...ok, fim: '2026-09-01' }, cartoes, null).fim).toBeTruthy() })
  it('sobreposição com outro cartão da mesma conta e final', () => {
    expect(validarCartao({ ...ok, final: '5678', inicio: '2026-11-01' }, cartoes, null).inicio).toMatch(/Diego/)
    // Editar o próprio cartão não conta como sobreposição.
    expect(validarCartao(cartaoParaForm(cartoes[2]), cartoes, cartoes[2].id)).toEqual({})
    // Início antes do Diego ainda bate com a vigência da Bruna.
    expect(validarCartao({ ...ok, final: '5678', inicio: '2026-09-01', fim: '2026-09-30' }, cartoes, null).inicio).toMatch(/Bruna/)
  })
})
