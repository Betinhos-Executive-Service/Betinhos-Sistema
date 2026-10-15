import { expect, it } from 'vitest'
import type { QueryCodec } from '../nav/queryState'
import { atalho } from './dashboard/domain/periodo'
import { dashboardQuery, despesasQuery } from './dashboard/domain/query'
import { EMPTY_FILTERS as CURRICULOS_VAZIO } from './curriculos/domain/funnel'
import { curriculosQuery } from './curriculos/domain/query'
import { DEFAULT_FILTERS } from './funcionarios/data/filters'
import { funcionariosQuery } from './funcionarios/data/query'
import { EMPTY_FILTERS as DESPESAS_VAZIO } from './despesas/domain/filters'
import { despesasQuery as despesasOperacionaisQuery } from './despesas/domain/query'
import { EMPTY_FILTERS as INFRACOES_VAZIO } from './infracoes/domain/filters'
import { infracoesQuery } from './infracoes/domain/query'
import { EMPTY_FILTERS as OPS_VAZIO } from './ops/domain/filters'
import { opsQuery } from './ops/domain/query'
import { pendenciasQuery } from './pendencias/domain/query'
import { EMPTY_FILTERS as PENDENCIAS_VAZIO } from './pendencias/domain/filters'
import { EMPTY_FILTERS as PAGANTES_VAZIO } from './pagantes/domain/filters'
import { pagantesQuery } from './pagantes/domain/query'
import { EMPTY_FILTERS as PESSOAS_VAZIO } from './pessoas/domain/filters'
import { pessoasQuery } from './pessoas/domain/query'

/** Vai e volta pela URL: o que a tela grava tem que ser o que ela lê. */
function ida<F>(codec: QueryCodec<F>, filtros: F) {
  const q = new URLSearchParams()
  for (const [chave, valor] of Object.entries(codec.gravar(filtros))) {
    if (valor == null) continue
    for (const item of typeof valor === 'string' ? [valor] : valor) q.append(chave, item)
  }
  return { q, filtros: codec.ler(q) }
}

it('filtros padrão não vão para a URL (link curto)', () => {
  const casos: [QueryCodec<never>, unknown][] = [
    [pagantesQuery as QueryCodec<never>, PAGANTES_VAZIO], [pessoasQuery as QueryCodec<never>, PESSOAS_VAZIO], [infracoesQuery as QueryCodec<never>, INFRACOES_VAZIO],
    [curriculosQuery as QueryCodec<never>, CURRICULOS_VAZIO], [funcionariosQuery as QueryCodec<never>, DEFAULT_FILTERS], [opsQuery as QueryCodec<never>, OPS_VAZIO], [pendenciasQuery as QueryCodec<never>, PENDENCIAS_VAZIO], [despesasOperacionaisQuery as QueryCodec<never>, DESPESAS_VAZIO],
  ]
  for (const [codec, vazio] of casos) {
    const { q, filtros } = ida(codec, vazio as never)
    expect(q.toString()).toBe('')
    expect(filtros).toEqual(vazio)
  }
})

it('Pagantes, Pessoas, Infrações, Currículos e Funcionários: ida e volta com todos os filtros', () => {
  const pagantes = { query: 'ana lima', periodo: 'all' as const, status: [1, 3], forma: 2, recibo: 'nao-enviado' as const, falhas: true }
  expect(ida(pagantesQuery, pagantes).filtros).toEqual(pagantes)
  const pessoas = { query: 'x', clienteId: 'c-1', classificacao: [1, 2], idioma: 3, status: 1, duplicados: true }
  expect(ida(pessoasQuery, pessoas).filtros).toEqual(pessoas)
  const infracoes = { query: '574-6', gravidade: [2], competencia: 1, responsabilidade: 2, situacao: 'todas' as const, comMultas: true }
  expect(ida(infracoesQuery, infracoes).filtros).toEqual(infracoes)
  const curriculos = { query: 'João', cargo: 'Motorista', cnh: 1, origem: 2, notaMin: 4 }
  expect(ida(curriculosQuery, curriculos).filtros).toEqual(curriculos)
  const func = { search: 'ze', status: [0], funcao: 1, empresa: 202410000, vinculo: 2, alerta: 'aso' as const, sort: 'cnh' as const, desc: true }
  expect(ida(funcionariosQuery, func).filtros).toEqual(func)
})

it('Despesas operacionais: ida e volta com ids em lista e alertas', () => {
  const despesas = { query: 'posto', periodo: '30' as const, operacional: [1], financeiro: [2, 3], categoria: ['c-1', 'c-2'], motorista: ['m-1'], alertas: ['sem-comprovante' as const, 'duplicidade' as const] }
  expect(ida(despesasOperacionaisQuery, despesas).filtros).toEqual(despesas)
})

it('Funcionários: "nenhum status" fica explícito e é diferente do padrão', () => {
  const { q, filtros } = ida(funcionariosQuery, { ...DEFAULT_FILTERS, status: [] })
  expect(q.toString()).toBe('status=')
  expect(filtros.status).toEqual([])
})

it('valores inválidos na URL caem no padrão em vez de quebrar a tela', () => {
  const q = new URLSearchParams('periodo=7&recibo=x&forma=abc&alerta=zzz&situacao=nada')
  expect(pagantesQuery.ler(q)).toMatchObject({ periodo: '90', recibo: null, forma: null })
  expect(funcionariosQuery.ler(q).alerta).toBeNull()
  expect(infracoesQuery.ler(q).situacao).toBe('ativas')
})

it('Dashboard: atalho relativo é recalculado com o relógio; personalizado guarda as datas; clientes com vírgula sobrevivem', () => {
  const now = new Date('2026-10-09T15:00:00Z')
  const codec = dashboardQuery(now)
  expect(codec.ler(new URLSearchParams(''))).toMatchObject({ atalho: 'esteAno', ...atalho('esteAno', now), status: [], clientes: [] })
  expect(codec.ler(new URLSearchParams('periodo=ult30'))).toMatchObject({ atalho: 'ult30', ...atalho('ult30', now) })
  const personalizado = { atalho: 'personalizado' as const, inicio: '2026-03-01', fim: '2026-03-31', status: ['Concluído'], clientes: ['Silva, Souza & Cia', 'B'], motoristas: ['m1'], tipos: ['Sedan'] }
  expect(ida(codec, personalizado).filtros).toEqual(personalizado)
  // Personalizado sem datas válidas volta ao padrão.
  expect(codec.ler(new URLSearchParams('periodo=personalizado&de=2026-05-01&ate=2026-04-01')).atalho).toBe('esteAno')
})

it('Dashboard: filtros próprios da aba Despesas', () => {
  const despesas = { categorias: ['Combustível', 'Pedágio, taxas'], formas: ['Pix'], empresas: [] }
  expect(ida(despesasQuery, despesas).filtros).toEqual(despesas)
})
