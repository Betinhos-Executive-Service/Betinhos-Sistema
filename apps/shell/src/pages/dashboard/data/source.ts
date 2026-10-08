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

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = { mock: boolean; carregar: (desde: string, ate: string) => Promise<Dados> }

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

/** Tenta a consulta completa; se ela falhar (coluna ou navegação ausente no ambiente), usa a reduzida, como o `loadPagantes` do legado. */
async function comAlternativa(principal: () => Promise<Row[]>, reduzida: () => Promise<Row[]>) {
  try { return await principal() } catch { return reduzida() }
}

/**
 * Reservas e CPs são obrigatórias; um conjunto secundário (inclusive as 3 tabelas do Infleet do Score motoristas) que falha vira `indisponiveis`.
 * Despesas dependem de 4 tabelas (despesas, categorias, formas e anexos): se qualquer uma falhar, o conjunto `despesas` inteiro fica indisponível.
 * Multas e despesas usam os funcionários (apelido, nome e empresa); sem eles caem no rótulo do lookup e "Sem empresa".
 */
export async function carregarDataverse(client: DataverseClient, sets: EntitySets, desde: string, ate: string): Promise<Dados> {
  const [res, cps, man, mul, oco, fun, vei, via, eve, tel, pag, des, cat, frm, anx] = await comLimite<Row[]>([
    () => client.getAll(reservasPath(sets.reserva, desde, ate)),
    () => client.getAll(composicoesPath(sets.composicao)),
    () => client.getAll(manutencoesPath(sets.manutencao)),
    () => comAlternativa(() => client.getAll(multasPath(sets.multa)), () => client.getAll(multasPath(sets.multa, false))),
    () => client.getAll(ocorrenciasPath(sets.ocorrencia)),
    () => client.getAll(funcionariosPath(sets.funcionario)),
    () => client.getAll(veiculosPath(sets.veiculo)),
    () => client.getAll(viagensPath(sets.viagem, desde, ate)),
    () => client.getAll(eventosPath(sets.evento, desde, ate)),
    () => client.getAll(telemetriaPath(sets.telemetria, desde, ate)),
    () => comAlternativa(() => client.getAll(pagantesPath(sets.pagante)), () => client.getAll(pagantesPath(sets.pagante, false))),
    () => client.getAll(despesasPath(sets.despesa, desde, ate)),
    () => client.getAll(categoriasDespesaPath(sets.categoriaDespesa)),
    () => client.getAll(formasPagamentoPath(sets.formaPagamentoDespesa)),
    () => client.getAll(anexosDespesaPath(sets.anexoDespesa)),
  ], 4)
  if (res.status === 'rejected') throw res.reason
  if (cps.status === 'rejected') throw cps.reason
  const linhas = (r: PromiseSettledResult<Row[]>) => (r.status === 'fulfilled' ? r.value : [])
  const secundarios: [Conjunto, PromiseSettledResult<Row[]>][] = [
    ['manutencoes', man], ['multas', mul], ['ocorrencias', oco], ['funcionarios', fun], ['veiculos', vei], ['viagens', via], ['eventos', eve], ['telemetria', tel], ['pagantes', pag],
  ]
  const indisponiveis = secundarios.filter(([, r]) => r.status === 'rejected').map(([conjunto]) => conjunto)
  const despesasOk = [des, cat, frm, anx].every((r) => r.status === 'fulfilled')
  if (!despesasOk) indisponiveis.push('despesas')

  const cpMap = mapCps(cps.value)
  const funcionarios = linhas(fun).map((row) => mapFuncionario(row))
  const apelidos = apelidosFuncionarios(funcionarios)
  const categoriasDespesa = despesasOk ? linhas(cat).map((row) => mapCategoriaDespesa(row)) : []
  const formasPagamento = despesasOk ? linhas(frm).map((row) => mapFormaPagamento(row)) : []
  const ctxDespesa = {
    categorias: new Map(categoriasDespesa.map((c) => [c.id, c])), formas: new Map(formasPagamento.map((f) => [f.id, f])),
    funcionarios: new Map(funcionarios.filter((f) => f.id).map((f) => [f.id, f])), anexos: contarAnexos(linhas(anx)),
  }
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
    pagantes: linhas(pag).map((row) => mapPagante(row)),
    despesas: despesasOk ? linhas(des).map((row) => mapDespesa(row, ctxDespesa)) : [],
    categoriasDespesa,
    formasPagamento,
    indisponiveis,
  }
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
        viagens: base.viagens.filter((x) => entre(x.dia, desde, ate)),
        eventos: base.eventos.filter((x) => entre(x.dia, desde, ate)),
        telemetria: base.telemetria.filter((x) => entre(x.dia, desde, ate)),
        despesas: base.despesas.filter((x) => entre(x.dia, desde, ate)),
      }
    },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
      return value
    }
    return {
      reserva: get(ENTITIES.reserva), composicao: get(ENTITIES.composicao), manutencao: get(ENTITIES.manutencao), multa: get(ENTITIES.multa),
      ocorrencia: get(ENTITIES.ocorrencia), funcionario: get(ENTITIES.funcionario), veiculo: get(ENTITIES.veiculo),
      telemetria: get(ENTITIES.telemetria), evento: get(ENTITIES.evento), viagem: get(ENTITIES.viagem),
      pagante: get(ENTITIES.pagante), despesa: get(ENTITIES.despesa), categoriaDespesa: get(ENTITIES.categoriaDespesa),
      formaPagamentoDespesa: get(ENTITIES.formaPagamentoDespesa), anexoDespesa: get(ENTITIES.anexoDespesa),
    }
  }).catch((error) => { sets = null; throw error }))
  return { mock: false, carregar: async (desde, ate) => carregarDataverse(host.client, await entitySets(), desde, ate) }
}
