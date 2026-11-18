import { describe, expect, it } from 'vitest'
import { ampliadoDoId, idDetalheMotorista } from './detalhes'
import { comparativoDe, listaGeral, top5, topsClientesMotoristas } from './indicadores'
import { extrasDaAba, listaCnh } from './extrasAba'
import type { Contexto } from './kpis'
import { dadosVazios, reserva } from './test-utils'
import type { Chip, Filtros } from './types'

const f: Filtros = { atalho: 'esteAno', inicio: '2026-01-01', fim: '2026-12-31', status: [], clientes: [], motoristas: [], tipos: [] }
const rv = [
  reserva({ saidaRaw: '2026-03-01T10:00:00Z', motoristaId: 'm1', motoristaKey: 'm1', motorista: 'Ana', cliente: 'Tenaris', valor: 300 }),
  reserva({ saidaRaw: '2026-03-02T10:00:00Z', motoristaId: 'm1', motoristaKey: 'm1', motorista: 'Ana', cliente: 'Latasa', valor: 100 }),
  reserva({ saidaRaw: '2026-04-02T10:00:00Z', motoristaId: 'm2', motoristaKey: 'm2', motorista: 'Beto', cliente: 'Tenaris', valor: 50 }),
]
const ctx: Contexto = { todas: rv, rv, f, now: new Date('2026-10-09T12:00:00Z') }

describe('top 5', () => {
  it('ordena do maior para o menor, limita a 5 e deixa de fora o grupo sem nome', () => {
    const linhas = ['a', 'b', 'c', 'd', 'e', 'f', ''].map((nome, i) => ({ nome, v: i + 1 }))
    const r = top5(linhas, (l) => l.nome, (g) => g[0].v, String)
    expect(r.map((i) => i.rotulo)).toEqual(['f', 'e', 'd', 'c', 'b'])
  })

  it('dinheiro: dois tops lado a lado (clientes e motoristas) em R$', () => {
    const [clientes, motoristas] = topsClientesMotoristas(rv, 'dinheiro', 'em R$')
    expect(clientes.titulo).toBe('Top 5 clientes em R$')
    expect(clientes.itens.map((i) => i.rotulo)).toEqual(['Tenaris', 'Latasa'])
    expect(clientes.itens[0].valor).toMatch(/350/)
    expect(motoristas.itens.map((i) => i.rotulo)).toEqual(['Ana', 'Beto'])
  })

  it('sem dados: tops vazios ("Nada no período" na tela)', () => {
    expect(topsClientesMotoristas([], 'dinheiro').every((t) => t.itens.length === 0)).toBe(true)
  })
})

describe('comparativo', () => {
  it('só entra o chip com valor; sem dado, a seção some', () => {
    const chips: Chip[] = [
      { tipo: 'valor', rotulo: 'LY', anterior: 'R$ 100', variacao: 10 } as Chip,
      { tipo: 'sem-dado', rotulo: 'LM' } as Chip,
    ]
    expect(comparativoDe(chips)).toEqual([{ codigo: 'LY', rotulo: 'Ano anterior', anterior: 'R$ 100', variacao: 10 }])
    expect(comparativoDe([])).toEqual([])
  })
})

describe('listaGeral (Ver na lista)', () => {
  it('período na Geral e o motorista quando o card é dele', () => {
    const l = listaGeral(f, rv, { key: 'm1', nome: 'Ana' })
    expect(l?.rota).toBe('geral')
    expect(l?.filtros.quick.cr40f_dataehorriodesada).toMatchObject({ op: 'between', value: '2026-01-01', to: '2026-12-31' })
    expect(l?.filtros.quick.cr40f_motorista).toMatchObject({ op: 'in', values: [{ value: 'm1', label: 'Ana' }] })
  })

  it('some quando a Geral não expressa o recorte (status, cliente, tipo ou motorista sem id)', () => {
    expect(listaGeral({ ...f, status: ['x'] }, rv)).toBeNull()
    expect(listaGeral({ ...f, clientes: ['Tenaris'] }, rv)).toBeNull()
    expect(listaGeral(f, rv, { key: 'nome:sem motorista', nome: 'Sem motorista' })).toBeNull()
  })
})

describe('ampliadoDoId', () => {
  const dados = dadosVazios()
  it('indicadores têm tabela, gráfico e tops; listas continuam como antes', () => {
    const fat = ampliadoDoId('faturamento', ctx, dados)
    expect(fat).toMatchObject({ tipo: 'indicador', titulo: 'Faturamento' })
    expect(fat && 'tops' in fat ? fat.tops?.length : 0).toBe(2)
    expect(fat && 'lista' in fat ? fat.lista?.rota : '').toBe('geral')
    expect(ampliadoDoId('total-produzido', ctx, dados)).toMatchObject({ tipo: 'indicador' })
    expect(ampliadoDoId('meta-realizado', ctx, dados)).toMatchObject({ tipo: 'indicador' })
    expect(ampliadoDoId('cnh', ctx, dados)).toMatchObject({ tipo: 'cnh' })
    expect(ampliadoDoId(idDetalheMotorista('m1'), ctx, dados)).toMatchObject({ tipo: 'servicos', titulo: 'Serviços de Ana' })
  })

  it('id desconhecido não abre nada', () => {
    expect(ampliadoDoId('nada', ctx, dados)).toBeNull()
  })
})

describe('cards das abas (extrasDaAba) e listas de destino', () => {
  const dados = dadosVazios()
  const sem = { categorias: [], formas: [], empresas: [] }
  const extras = (aba: string, titulo: string, c: Contexto = ctx) => extrasDaAba(aba, titulo, c, dados, sem)
  it('serviços: top 5 pela mesma regra do número (subconjunto só com os serviços dele) e Geral só no período com a nota', () => {
    const cancel = [...rv, reserva({ saidaRaw: '2026-05-02T10:00:00Z', cliente: 'Kenvue', statusLabel: 'Cancelado' })]
    const c: Contexto = { ...ctx, rv: cancel }
    expect(extras('servicos', 'Total de serviços', c).tops?.[0].itens.map((i) => i.rotulo)).toContain('Kenvue')
    expect(extras('servicos', 'Cancelados', c).tops?.[0]).toMatchObject({ titulo: 'Top 5 clientes (serviços)', itens: [{ rotulo: 'Kenvue', valor: '1' }] })
    expect(extras('servicos', 'Total de serviços').lista).toMatchObject({ rota: 'geral', nota: 'Período aplicado; demais filtros não' })
  })
  it('maior serviço mostra os 5 maiores (código, cliente, valor); média, percentual, tempo e Total recebido ficam sem top 5', () => {
    const maiores = extras('financeiro', 'Maior serviço').tops?.[0]
    expect(maiores?.itens.map((i) => i.apoio)).toEqual(['Tenaris', 'Latasa', 'Tenaris'])
    expect(extras('financeiro', 'Clientes ativos').tops).toHaveLength(1)
    for (const t of ['Total recebido', 'Cartão', 'Tempo médio de pagamento']) expect(extras('financeiro', t).tops).toBeUndefined()
    expect(extras('despesas', 'Ticket médio').tops).toBeUndefined()
    expect(extras('multas', 'Pendentes').tops).toBeUndefined()
    expect(extras('motoristas', 'Motoristas ativos').tops).toBeUndefined()
  })
  it('multas e manutenções levam o período à lista da Frota; frota não tem lista', () => {
    expect(extras('multas', 'Multas').lista).toMatchObject({ rota: 'frota-multas', filtros: { quick: { data: { op: 'between', value: '2026-01-01', to: '2026-12-31' } } } })
    expect(extras('manutencoes', 'Custo total').lista?.rota).toBe('frota-manutencoes')
    expect(extras('frota', 'Total de veículos').lista).toBeNull()
    expect(extras('despesas', 'Despesa realizada').lista?.rota).toBe('despesas')
  })
  it('CNH abre os funcionários pela validade; CP pendente e a receber seguem na Geral só no período, mesmo com filtro de segmento', () => {
    expect(listaCnh(ctx.now)).toMatchObject({ rota: 'funcionarios', filtros: { quick: { cnh: { op: 'between', value: '1900-01-01' } } } })
    const seg: Contexto = { ...ctx, f: { ...f, clientes: ['Tenaris'] } }
    const cp = ampliadoDoId('cp-pendente', seg, dados)
    expect(cp && 'lista' in cp ? cp.lista : null).toMatchObject({ rota: 'geral', nota: 'Período aplicado; demais filtros não' })
    const ar = ampliadoDoId('a-receber', ctx, dados)
    expect(ar && 'lista' in ar ? ar.lista?.rota : '').toBe('geral')
  })
})
