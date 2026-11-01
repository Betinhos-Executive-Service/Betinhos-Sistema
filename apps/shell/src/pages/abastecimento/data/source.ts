import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { browserKV } from '../../pagantes/data/source'
import type { KV } from '../../pagantes/domain/filters'
import type { Novo } from '../domain/importacao'
import type { Abastecimento, Motorista, Veiculo } from '../domain/types'
import { createMockAbastecimentos, createMockMotoristas, createMockVeiculos } from './mock'
import { ENTITIES, abastecimentosPath, categoriasCombustivel, chavesPath, categoriasPath, despesasPath, mapAbastecimento, mapDespesa, mapMotorista, mapVeiculo, motoristasPath, toPayload, veiculosPath, vinculoPayload, type EntitySets } from './queries'

/** Importação interrompida no meio: `criados` são os que já estão gravados (a tela os soma à lista e à deduplicação). */
export class ImportacaoParcial extends Error {
  constructor(message: string, readonly criados: Abastecimento[]) { super(message) }
}

export type Carga = { abastecimentos: Abastecimento[]; veiculos: Veiculo[]; motoristas: Motorista[]; /** Texto quando as despesas do App não carregaram: os totais valem só para os extratos. */ aviso: string | null }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  /** Abastecimentos importados e despesas de combustível do App desde `since` (null = tudo), mais cadastros. */
  load: (since: Date | null) => Promise<Carga>
  /** Chaves de deduplicação já gravadas entre duas datas (inclusive). */
  chaves: (de: Date, ate: Date) => Promise<string[]>
  /** Grava os novos em sequência; `onProgress` recebe quantos já entraram. Falha no meio: os gravados ficam e o erro sobe como `ImportacaoParcial` com eles. */
  importar: (novos: Novo[], onProgress: (feitos: number) => void) => Promise<Abastecimento[]>
  /** Resolve uma pendência: liga o abastecimento ao veículo. */
  vincularVeiculo: (id: string, veiculoId: string) => Promise<void>
  /** Ficha do registro no model-driven; null fora do Dataverse. */
  recordUrl: (entity: string, id: string) => string | null
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  let lista = createMockAbastecimentos(new Date())
  let seq = 0
  return {
    mock: true,
    async load(since) { await wait(300); return { abastecimentos: lista.filter((a) => !since || a.data >= since).map((a) => ({ ...a })), veiculos: createMockVeiculos(), motoristas: createMockMotoristas(), aviso: null } },
    async chaves(de, ate) { await wait(100); return lista.filter((a) => a.chave && a.data >= de && a.data <= ate).map((a) => a.chave) },
    async importar(novos, onProgress) {
      const criados: Abastecimento[] = []
      for (const n of novos) {
        await wait(40)
        const a = { ...n, id: `novo-${++seq}` }
        criados.push(a)
        onProgress(criados.length)
      }
      lista = [...lista, ...criados]
      return criados
    },
    async vincularVeiculo(id, veiculoId) {
      await wait(250)
      const v = createMockVeiculos().find((x) => x.id === veiculoId)
      if (!v) throw new Error('Veículo não encontrado.')
      lista = lista.map((a) => (a.id === id ? { ...a, veiculoId: v.id, placa: v.placa } : a))
    },
    recordUrl: () => null,
    kv: browserKV(),
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
    return { abastecimento: get(ENTITIES.abastecimento), veiculo: get(ENTITIES.veiculo), funcionario: get(ENTITIES.funcionario), despesa: get(ENTITIES.despesa), categoria: get(ENTITIES.categoria) }
  }).catch((error) => { sets = null; throw error }))
  // Antes do provision o veículo não tem cr40f_capacidadetanque: a consulta com a coluna falha e a lista vem sem ela (regra do tanque desligada).
  const veiculos = (set: string) => host.client.getAll(veiculosPath(set, true)).catch(() => host.client.getAll(veiculosPath(set, false)))
  // Despesas do App são complemento: se falharem, a tela segue só com os extratos e avisa (`Carga.aviso`).
  const despesas = async (s: EntitySets, since: Date | null) => {
    const cats = categoriasCombustivel(await host.client.getAll(categoriasPath(s.categoria)))
    return cats.length ? host.client.getAll(despesasPath(s.despesa, since, cats)) : []
  }

  return {
    mock: false,
    async load(since) {
      const s = await entitySets()
      const [rows, veiculosRows, motoristasRows, app] = await Promise.all([
        host.client.getAll(abastecimentosPath(s.abastecimento, since)), veiculos(s.veiculo), host.client.getAll(motoristasPath(s.funcionario)), despesas(s, since).then((r) => ({ r, aviso: null as string | null }), (e: unknown) => ({ r: [], aviso: `Despesas do App não carregaram (${e instanceof Error ? e.message : String(e)}).` })),
      ])
      const lista = veiculosRows.map(mapVeiculo)
      const placa = new Map(lista.map((v) => [v.id, v.placa]))
      return { abastecimentos: [...rows.map(mapAbastecimento), ...app.r.map((r) => mapDespesa(r, (id) => placa.get(id) ?? ''))], veiculos: lista, motoristas: motoristasRows.map(mapMotorista), aviso: app.aviso }
    },
    async chaves(de, ate) { const s = await entitySets(); return (await host.client.getAll(chavesPath(s.abastecimento, de, ate))).map((r) => String(r.cr40f_chave ?? '')).filter(Boolean) },
    async importar(novos, onProgress) {
      const s = await entitySets()
      const criados: Abastecimento[] = []
      try {
        for (const n of novos) {
          const id = cleanId(await host.client.create(s.abastecimento, toPayload(n, s)))
          criados.push({ ...n, id })
          onProgress(criados.length)
        }
      } catch (reason) {
        throw new ImportacaoParcial(reason instanceof Error ? reason.message : String(reason), criados)
      }
      return criados
    },
    async vincularVeiculo(id, veiculoId) { const s = await entitySets(); await host.client.update(s.abastecimento, id, vinculoPayload(veiculoId, s)) },
    recordUrl: (entity, id) => `${host.clientUrl}/main.aspx?pagetype=entityrecord&etn=${entity}&id=${id}`,
    kv: browserKV(),
  }
}
