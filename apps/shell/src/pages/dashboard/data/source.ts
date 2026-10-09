import type { DataverseClient, Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { aplicarCsv2026 } from '../domain/base'
import { entre } from '../domain/periodo'
import type { Conjunto, Dados } from '../domain/types'
import { reservasCsv2026 } from './csv2026'
import { criarDadosMock } from './mock'
import {
  ENTITIES, anexosDespesaPath, apelidosFuncionarios, categoriasDespesaPath, composicoesPath, contarAnexos, despesasPath, eventosPath, formasPagamentoPath,
  funcionariosPath, manutencoesPath, mapCategoriaDespesa, mapCps, mapDespesa, mapEvento, mapFormaPagamento, mapFuncionario, mapManutencao, mapMulta,
  mapOcorrencia, mapPagante, mapReserva, mapTelemetria, mapVeiculo, mapViagem, multasPath, ocorrenciasPath, pagantesPath, reservasPath, telemetriaPath,
  veiculosPath, viagensPath, type EntitySets,
} from './queries'

/** Conjuntos do estágio 2 (sob demanda): só as abas Financeiro e Despesas os usam. */
export type ConjuntoExtra = NonNullable<Dados['pendentes']>[number]
/** Resposta de um conjunto do estágio 2: os campos dele em `Dados`; `indisponivel` quando a consulta falhou (s/dado nos cards). */
export type ParteExtra = { campos: Partial<Pick<Dados, 'pagantes' | 'despesas' | 'categoriasDespesa' | 'formasPagamento'>>; indisponivel: boolean }

/**
 * Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev.
 * `carregar` é o estágio 1 (pagantes e despesas vazios e `pendentes`); `carregarExtra` traz um conjunto do estágio 2.
 */
export type Source = {
  mock: boolean
  carregar: (desde: string, ate: string) => Promise<Dados>
  carregarExtra: (conjunto: ConjuntoExtra, desde: string, ate: string) => Promise<ParteExtra>
}
/** Estágio 2 ainda não carregado: os campos vazios que o estágio 1 devolve. */
const EXTRAS_VAZIOS = { pagantes: [], despesas: [], categoriasDespesa: [], formasPagamento: [], pendentes: ['pagantes', 'despesas'] } satisfies Partial<Dados>

/** Consultas simultâneas: o navegador abre até 6 conexões por host. */
const PARALELO = 6
/** Cadastros (sem janela de datas) mudam pouco: a recarga de 60 s reaproveita a última resposta por até 5 min. */
export const CADASTRO_TTL_MS = 5 * 60_000

/**
 * Cliente que guarda as respostas das consultas de cadastro (`paths`) por `ttl`; as demais vão sempre ao servidor.
 * Consulta em voo é compartilhada (estágios 1 e 2 pedem funcionários ao mesmo tempo); falha não fica guardada.
 */
export function comCacheCadastros(client: DataverseClient, paths: (path: string) => boolean, ttl = CADASTRO_TTL_MS): DataverseClient {
  const cache = new Map<string, { em: number; rows: Promise<Row[]> }>()
  const getAll = (path: string) => {
    if (!paths(path)) return client.getAll(path)
    const hit = cache.get(path)
    if (hit && Date.now() - hit.em < ttl) return hit.rows
    const rows = client.getAll(path)
    cache.set(path, { em: Date.now(), rows })
    rows.catch(() => { if (cache.get(path)?.rows === rows) cache.delete(path) })
    return rows
  }
  return { ...client, getAll }
}

/** Roda as tarefas com no máximo `limite` em paralelo e devolve o resultado de cada uma. */
async function comLimite<T>(tarefas: (() => Promise<T>)[], limite: number) {
  const resultados: PromiseSettledResult<T>[] = new Array(tarefas.length)
  let proxima = 0
  const worker = async () => {
    while (proxima < tarefas.length) {
      const i = proxima++
      try { resultados[i] = { status: 'fulfilled', value: await tarefas[i]() } } catch (reason) { resultados[i] = { status: 'rejected', reason } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, worker))
  return resultados
}

/**
 * Tenta a consulta completa; se ela falhar (coluna ou navegação ausente no ambiente), registra o erro e usa a reduzida,
 * como o `loadPagantes` do legado.
 */
async function comAlternativa(principal: () => Promise<Row[]>, reduzida: () => Promise<Row[]>) {
  try {
    return await principal()
  } catch (error) {
    console.warn('Dashboard: consulta completa falhou; usando a reduzida.', String(error))
    return reduzida()
  }
}

/** Tabela secundária sem entity set (ausente na metadata do ambiente): a consulta falha e o conjunto vira `indisponiveis`. */
const ausente = (set: string) => Promise.reject(new Error(`Tabela ausente na metadata (${set || 'sem entity set'}).`))

/** Consulta de um conjunto secundário: sem entity set, falha sem ir ao servidor. */
const leitor = (client: DataverseClient) => (set: string, path: (set: string) => string) => (set ? client.getAll(path(set)) : ausente(set))
const linhas = (r: PromiseSettledResult<Row[]>) => (r.status === 'fulfilled' ? r.value : [])

/**
 * Estágio 1. Reservas e CPs são obrigatórias; um conjunto secundário (inclusive as 3 tabelas do Infleet do Score motoristas) que falha vira `indisponiveis`.
 * Entity set vazio (`''`) é tabela secundária que não existe na metadata do ambiente: conta como falha só daquele conjunto.
 * Manutenções, multas e ocorrências vêm pela mesma janela das reservas (colunas DateTime). Multas usam os funcionários (apelido).
 * Pagantes e despesas ficam vazios e `pendentes`: são o estágio 2 (`carregarExtraDataverse`).
 */
export async function carregarDataverse(client: DataverseClient, sets: EntitySets, desde: string, ate: string): Promise<Dados> {
  const ler = leitor(client)
  const [res, cps, man, mul, oco, fun, vei, via, eve, tel] = await comLimite<Row[]>([
    () => client.getAll(reservasPath(sets.reserva, desde, ate)),
    () => client.getAll(composicoesPath(sets.composicao)),
    () => ler(sets.manutencao, (s) => manutencoesPath(s, desde, ate)),
    () => (sets.multa ? comAlternativa(() => client.getAll(multasPath(sets.multa, desde, ate)), () => client.getAll(multasPath(sets.multa, desde, ate, false))) : ausente(sets.multa)),
    () => ler(sets.ocorrencia, (s) => ocorrenciasPath(s, desde, ate)),
    () => ler(sets.funcionario, funcionariosPath),
    () => ler(sets.veiculo, veiculosPath),
    () => ler(sets.viagem, (s) => viagensPath(s, desde, ate)),
    () => ler(sets.evento, (s) => eventosPath(s, desde, ate)),
    () => ler(sets.telemetria, (s) => telemetriaPath(s, desde, ate)),
  ], PARALELO)
  if (res.status === 'rejected') throw res.reason
  if (cps.status === 'rejected') throw cps.reason
  const secundarios: [Conjunto, PromiseSettledResult<Row[]>][] = [
    ['manutencoes', man], ['multas', mul], ['ocorrencias', oco], ['funcionarios', fun], ['veiculos', vei], ['viagens', via], ['eventos', eve], ['telemetria', tel],
  ]
  const indisponiveis = secundarios.filter(([, r]) => r.status === 'rejected').map(([conjunto]) => conjunto)

  const cpMap = mapCps(cps.value)
  const funcionarios = linhas(fun).map((row) => mapFuncionario(row))
  const apelidos = apelidosFuncionarios(funcionarios)
  return {
    reservas: aplicarCsv2026(res.value.map((row) => mapReserva(row, cpMap)), reservasCsv2026()),
    manutencoes: linhas(man).map((row) => mapManutencao(row)),
    multas: linhas(mul).map((row) => mapMulta(row, apelidos)),
    ocorrencias: linhas(oco).map((row) => mapOcorrencia(row)),
    funcionarios,
    veiculos: linhas(vei).map((row) => mapVeiculo(row)),
    viagens: linhas(via).map((row) => mapViagem(row)),
    eventos: linhas(eve).map((row) => mapEvento(row)),
    telemetria: linhas(tel).map((row) => mapTelemetria(row)),
    ...EXTRAS_VAZIOS,
    indisponiveis,
  }
}

/**
 * Estágio 2, um conjunto por vez. Pagantes: todos, sem `$filter` (como o legado), com a consulta reduzida se faltar a data do primeiro pagamento.
 * Despesas dependem de 4 tabelas (despesas, categorias, formas e anexos): se qualquer uma falhar, o conjunto inteiro fica indisponível.
 * Despesas usam os funcionários (nome e empresa), consultados de novo aqui para o estágio 2 não esperar o 1; sem eles caem no rótulo do lookup e "Sem empresa".
 */
export async function carregarExtraDataverse(client: DataverseClient, sets: EntitySets, conjunto: ConjuntoExtra, desde: string, ate: string): Promise<ParteExtra> {
  const ler = leitor(client)
  if (conjunto === 'pagantes') {
    try {
      const rows = await (sets.pagante ? comAlternativa(() => client.getAll(pagantesPath(sets.pagante)), () => client.getAll(pagantesPath(sets.pagante, false))) : ausente(sets.pagante))
      return { campos: { pagantes: rows.map((row) => mapPagante(row)) }, indisponivel: false }
    } catch (error) {
      console.warn('Dashboard: pagantes não carregaram; os cards deles ficam s/dado.', String(error))
      return { campos: {}, indisponivel: true }
    }
  }
  const [des, cat, frm, anx, fun] = await comLimite<Row[]>([
    () => ler(sets.despesa, (s) => despesasPath(s, desde, ate)),
    () => ler(sets.categoriaDespesa, categoriasDespesaPath),
    () => ler(sets.formaPagamentoDespesa, formasPagamentoPath),
    () => ler(sets.anexoDespesa, anexosDespesaPath),
    () => ler(sets.funcionario, funcionariosPath),
  ], PARALELO)
  if (![des, cat, frm, anx].every((r) => r.status === 'fulfilled')) return { campos: {}, indisponivel: true }
  const categoriasDespesa = linhas(cat).map((row) => mapCategoriaDespesa(row))
  const formasPagamento = linhas(frm).map((row) => mapFormaPagamento(row))
  const funcionarios = linhas(fun).map((row) => mapFuncionario(row))
  const ctxDespesa = {
    categorias: new Map(categoriasDespesa.map((c) => [c.id, c])), formas: new Map(formasPagamento.map((f) => [f.id, f])),
    funcionarios: new Map(funcionarios.filter((f) => f.id).map((f) => [f.id, f])), anexos: contarAnexos(linhas(anx)),
  }
  return { campos: { despesas: linhas(des).map((row) => mapDespesa(row, ctxDespesa)), categoriasDespesa, formasPagamento }, indisponivel: false }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  const base = criarDadosMock(new Date())
  return {
    mock: true,
    async carregar(desde, ate) {
      await wait(300)
      return {
        ...base,
        reservas: aplicarCsv2026(base.reservas.filter((r) => entre(r.dia, desde, ate)), reservasCsv2026()),
        manutencoes: base.manutencoes.filter((x) => entre(x.dia, desde, ate)),
        multas: base.multas.filter((x) => entre(x.dia, desde, ate)),
        ocorrencias: base.ocorrencias.filter((x) => entre(x.dia, desde, ate)),
        viagens: base.viagens.filter((x) => entre(x.dia, desde, ate)),
        eventos: base.eventos.filter((x) => entre(x.dia, desde, ate)),
        telemetria: base.telemetria.filter((x) => entre(x.dia, desde, ate)),
        ...EXTRAS_VAZIOS,
      }
    },
    async carregarExtra(conjunto, desde, ate) {
      await wait(300)
      if (conjunto === 'pagantes') return { campos: { pagantes: base.pagantes }, indisponivel: false }
      return {
        campos: { despesas: base.despesas.filter((x) => entre(x.dia, desde, ate)), categoriasDespesa: base.categoriasDespesa, formasPagamento: base.formasPagamento },
        indisponivel: false,
      }
    },
  }
}

/**
 * Entity sets pela metadata: reservas e composições são obrigatórias (sem elas, erro da tela); cada tabela secundária ausente vira `''`
 * (aviso no console) e a carga marca só o conjunto dela como indisponível, em vez de derrubar a tela.
 */
export function resolverEntitySets(info: ReadonlyMap<string, { entitySetName: string }>): EntitySets {
  const obrigatoria = (name: string) => {
    const value = info.get(name)?.entitySetName
    if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
    return value
  }
  const opcional = (name: string) => {
    try {
      return obrigatoria(name)
    } catch (error) {
      console.warn('Dashboard: tabela secundária ausente; os cards dela ficam s/dado.', String(error))
      return ''
    }
  }
  return {
    reserva: obrigatoria(ENTITIES.reserva), composicao: obrigatoria(ENTITIES.composicao), manutencao: opcional(ENTITIES.manutencao), multa: opcional(ENTITIES.multa),
    ocorrencia: opcional(ENTITIES.ocorrencia), funcionario: opcional(ENTITIES.funcionario), veiculo: opcional(ENTITIES.veiculo),
    telemetria: opcional(ENTITIES.telemetria), evento: opcional(ENTITIES.evento), viagem: opcional(ENTITIES.viagem),
    pagante: opcional(ENTITIES.pagante), despesa: opcional(ENTITIES.despesa), categoriaDespesa: opcional(ENTITIES.categoriaDespesa),
    formaPagamentoDespesa: opcional(ENTITIES.formaPagamentoDespesa), anexoDespesa: opcional(ENTITIES.anexoDespesa),
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => resolverEntitySets(info)).catch((error) => { sets = null; throw error }))
  let cliente: DataverseClient | null = null
  const clienteCacheado = (s: EntitySets) => (cliente ??= comCacheCadastros(host.client, (path) => [
    s.composicao && composicoesPath(s.composicao), s.funcionario && funcionariosPath(s.funcionario), s.veiculo && veiculosPath(s.veiculo),
    s.categoriaDespesa && categoriasDespesaPath(s.categoriaDespesa), s.formaPagamentoDespesa && formasPagamentoPath(s.formaPagamentoDespesa),
  ].includes(path)))
  return {
    mock: false,
    carregar: async (desde, ate) => { const s = await entitySets(); return carregarDataverse(clienteCacheado(s), s, desde, ate) },
    carregarExtra: async (conjunto, desde, ate) => { const s = await entitySets(); return carregarExtraDataverse(clienteCacheado(s), s, conjunto, desde, ate) },
  }
}
