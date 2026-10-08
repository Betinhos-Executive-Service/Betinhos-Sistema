import type { DataverseClient, Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { aplicarCsv2026 } from '../domain/base'
import { entre } from '../domain/periodo'
import type { Conjunto, Dados } from '../domain/types'
import { reservasCsv2026 } from './csv2026'
import { criarDadosMock } from './mock'
import {
  ENTITIES, composicoesPath, funcionariosPath, manutencoesPath, mapCps, mapFuncionario, mapManutencao, mapMulta, mapOcorrencia,
  mapReserva, mapVeiculo, multasPath, ocorrenciasPath, reservasPath, veiculosPath, type EntitySets,
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

/** Reservas e CPs são obrigatórias; um conjunto secundário que falha vira `indisponiveis`. */
export async function carregarDataverse(client: DataverseClient, sets: EntitySets, desde: string, ate: string): Promise<Dados> {
  const [res, cps, man, mul, oco, fun, vei] = await comLimite<Row[]>([
    () => client.getAll(reservasPath(sets.reserva, desde, ate)),
    () => client.getAll(composicoesPath(sets.composicao)),
    () => client.getAll(manutencoesPath(sets.manutencao)),
    () => client.getAll(multasPath(sets.multa)),
    () => client.getAll(ocorrenciasPath(sets.ocorrencia)),
    () => client.getAll(funcionariosPath(sets.funcionario)),
    () => client.getAll(veiculosPath(sets.veiculo)),
  ], 4)
  if (res.status === 'rejected') throw res.reason
  if (cps.status === 'rejected') throw cps.reason
  const indisponiveis: Conjunto[] = []
  const ler = <T,>(r: PromiseSettledResult<Row[]>, conjunto: Conjunto, map: (row: Row) => T): T[] => {
    if (r.status === 'fulfilled') return r.value.map(map)
    indisponiveis.push(conjunto)
    return []
  }
  const cpMap = mapCps(cps.value)
  return {
    reservas: aplicarCsv2026(res.value.map((row) => mapReserva(row, cpMap)), reservasCsv2026()),
    manutencoes: ler(man, 'manutencoes', mapManutencao),
    multas: ler(mul, 'multas', mapMulta),
    ocorrencias: ler(oco, 'ocorrencias', mapOcorrencia),
    funcionarios: ler(fun, 'funcionarios', mapFuncionario),
    veiculos: ler(vei, 'veiculos', mapVeiculo),
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
      return { ...base, reservas: aplicarCsv2026(base.reservas.filter((r) => entre(r.dia, desde, ate)), reservasCsv2026()) }
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
    }
  }).catch((error) => { sets = null; throw error }))
  return { mock: false, carregar: async (desde, ate) => carregarDataverse(host.client, await entitySets(), desde, ate) }
}
