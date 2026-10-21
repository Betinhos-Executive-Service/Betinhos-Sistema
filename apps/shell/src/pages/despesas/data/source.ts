import { normalizeSearch } from '@betinhos/ui'
import type { Host } from '../../../host'
import { getAllWithFirstPage, searchRows } from '../../../app/pagedLoad'
import { mockProgressive, mockSearch } from '../../../app/mockVolume'
import { browserKV } from '../../pagantes/data/source'
import type { KV } from '../../pagantes/domain/filters'
import { withFallback } from '../domain/status'
import type { Anexo, Arquivo, Despesa, DespesaChoices } from '../domain/types'
import { createArquivos } from './arquivo'
import { createMockAnexos, createMockArquivo, createMockDespesas } from './mock'
import { ENTITY_ANEXO, ENTITY_DESPESA, anexosPath, despesasPath, despesasSearchFilter, mapAnexo, mapDespesa } from './queries'

/** Tudo que a tela precisa do mundo externo. Só leitura: a tela não grava nada. */
export type Source = {
  mock: boolean
  /** Despesas do período; `onFirstPage` recebe a primeira página antes (lista grande). */
  load: (since: Date | null, onFirstPage?: (list: Despesa[]) => void) => Promise<Despesa[]>
  /** Até 50 despesas do período que batem com a busca (usada enquanto a lista não carregou inteira). */
  search: (since: Date | null, query: string) => Promise<Despesa[]>
  anexos: (despesaId: string) => Promise<Anexo[]>
  /** Conteúdo do comprovante para a prévia (imagem ou PDF). */
  arquivo: (anexo: Anexo) => Promise<Arquivo>
  choices: () => Promise<DespesaChoices>
  /** Ficha do registro no model-driven; null fora do Dataverse. */
  recordUrl: (entity: string, id: string) => string | null
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  const rows = createMockDespesas(new Date())
  return {
    mock: true,
    load: (since, onFirstPage) => mockProgressive(rows.filter((d) => !since || (d.data && d.data >= since)).map((d) => ({ ...d })), onFirstPage, 300),
    search: (since, q) => {
      const t = normalizeSearch(q)
      return mockSearch(rows, (d) => (!since || (d.data != null && d.data >= since)) && normalizeSearch(`${d.protocolo} ${d.nome} ${d.estabelecimento}`).includes(t))
    },
    async anexos(id) { await wait(250); const d = rows.find((x) => x.id === id); return d ? createMockAnexos(d) : [] },
    async arquivo(anexo) { await wait(300); return createMockArquivo(anexo) },
    choices: async () => withFallback({}),
    recordUrl: () => null,
    kv: browserKV(),
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let sets: Promise<Map<string, string>> | null = null
  const entitySet = async (entity: string) => {
    const map = await (sets ??= host.metadata.entities([ENTITY_DESPESA, ENTITY_ANEXO]).then((info) => {
      const out = new Map<string, string>()
      for (const name of [ENTITY_DESPESA, ENTITY_ANEXO]) { const set = info.get(name)?.entitySetName; if (set) out.set(name, set) }
      return out
    }).catch((error) => { sets = null; throw error }))
    const set = map.get(entity)
    if (!set) throw new Error(`Tabela ${entity} não encontrada na metadata.`)
    return set
  }
  const choice = (entity: string, attribute: string) => host.metadata.choices(entity, attribute).catch(() => [])

  return {
    mock: false,
    load: async (since, onFirstPage) => (await getAllWithFirstPage(host.client, despesasPath(await entitySet(ENTITY_DESPESA), since), onFirstPage && ((rows) => onFirstPage(rows.map(mapDespesa))))).map(mapDespesa),
    async search(since, q) {
      const filter = despesasSearchFilter(q)
      return filter ? (await searchRows(host.client, despesasPath(await entitySet(ENTITY_DESPESA), since, filter))).map(mapDespesa) : []
    },
    anexos: async (id) => (await host.client.getAll(anexosPath(await entitySet(ENTITY_ANEXO), id))).map(mapAnexo),
    arquivo: createArquivos(host.client),
    // Rótulo é acessório: metadata fora do ar cai nos rótulos conhecidos.
    async choices() {
      const [operacional, financeiro, anexo, origem, anexoTipo, anexoStatus] = await Promise.all([
        choice(ENTITY_DESPESA, 'cr40f_statusoperacional'), choice(ENTITY_DESPESA, 'cr40f_statusfinanceiro'),
        choice(ENTITY_DESPESA, 'cr40f_statusanexo'), choice(ENTITY_DESPESA, 'cr40f_origem'),
        choice(ENTITY_ANEXO, 'cr40f_tipo'), choice(ENTITY_ANEXO, 'cr40f_status'),
      ])
      return withFallback({ operacional, financeiro, anexo, origem, anexoTipo, anexoStatus })
    },
    recordUrl: (entity, id) => `${host.clientUrl}/main.aspx?pagetype=entityrecord&etn=${entity}&id=${id}`,
    kv: browserKV(),
  }
}
