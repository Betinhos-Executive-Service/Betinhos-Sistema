import { chunk, cleanId, formatted, getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { browserKV } from '../../pagantes/data/source'
import type { KV } from '../domain/columns'
import { COPY_SELECT } from '../domain/copy'
import { buildFetch, quickFindAttributes } from '../domain/fetch'
import { formatDateTime, formatMoney } from '../domain/format'
import { ENTITY, ID_ATTRIBUTE, PAGE_SIZE, type AttributeInfo, type AttributeMap, type LookupBind, type LookupOption, type Page, type Sort, type View } from '../domain/types'
import { MOCK_ATTRIBUTES, MOCK_BINDS, MOCK_LOOKUPS, applyMockFetch, createMockRows, createMockViews } from './mock'
import { copyPath, fetchPath, mapViews, parsePage, quickFindPath, relationshipPath, reloadPath, searchPath, viewsPaths, type FetchResponse } from './queries'

export const FORM_WEBRESOURCE = 'new_formulario_geral.html'
export const VOUCHER_WEBRESOURCE = 'cr40f_VoucherConfirmacao.html'
export const ESCALA_FDS_WEBRESOURCE = 'cr40f_EscalaFDS.html'

export type PageRequest = { fetchxml: string; page: number; cookie: string | null; sort: Sort; query: string; quickFind: string[] }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  views(): Promise<View[]>
  quickFind(): Promise<string[]>
  attributes(entity: string): Promise<AttributeMap>
  page(req: PageRequest): Promise<Page>
  update(id: string, patch: Row): Promise<void>
  clearLookup(id: string, attribute: string): Promise<void>
  lookupBind(attribute: string): Promise<LookupBind>
  setState(ids: string[], active: boolean): Promise<{ ok: string[]; failed: { id: string; message: string }[] }>
  search(attribute: string, text: string): Promise<LookupOption[]>
  reload(id: string, keys: string[]): Promise<Row>
  copyRows(ids: string[]): Promise<Row[]>
  openForm(mode: 'create' | 'edit', id?: string): Promise<'closed' | 'external' | 'mock'>
  /** URL do iframe do voucher; `null` em mock. */
  openVoucher(ids: string[]): string | null
  escalaFdsUrl(): string | null
  kv: KV
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const same = (a: string, b: string) => cleanId(a) === cleanId(b)

const BLOCKED_ID = 'OS-1013'
const BIND_SUFFIX = '@odata.bind'

/** Opções do mock. `latency` multiplica as esperas simuladas (1 = as de `pnpm dev`; 0 = resposta imediata, para testes). */
export type SourceOptions = { latency?: number }

function createMockSource({ latency = 1 }: SourceOptions = {}): Source {
  const wait = (ms: number) => (latency === 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms * latency)))
  const now = new Date()
  const rows = createMockRows(now)
  const find = (id: string) => rows.find((r) => same(String(r.cr40f_reservadeveculosid), id))
  const binds = Object.entries(MOCK_BINDS)

  /** Grava o valor e a anotação formatada, como a Web API devolveria na releitura. */
  function apply(row: Row, key: string, value: unknown) {
    const attribute = MOCK_ATTRIBUTES.get(key)
    row[key] = value
    const label = (() => {
      if (value == null) return null
      if (attribute?.type === 'Picklist' || attribute?.type === 'Boolean') return attribute.options.find((o) => o.value === (value === true ? 1 : value === false ? 0 : value))?.label ?? null
      if (attribute?.type === 'Money') return formatMoney(Number(value))
      if (attribute?.type === 'DateTime') return formatDateTime(String(value))
      return null
    })()
    if (label == null) delete row[`${key}@OData.Community.Display.V1.FormattedValue`]
    else row[`${key}@OData.Community.Display.V1.FormattedValue`] = label
  }

  return {
    mock: true,
    views: async () => createMockViews(),
    quickFind: async () => ['cr40f_id', 'cr40f_trajeto', 'cr40f_cliente'],
    attributes: async (entity) => (entity === ENTITY ? new Map(MOCK_ATTRIBUTES) : new Map<string, AttributeInfo>()),
    async page(req) {
      await wait(300)
      const page = applyMockFetch(rows, req.fetchxml, { ...req, pageSize: PAGE_SIZE, now: new Date() })
      return { ...page, rows: page.rows.map((r) => ({ ...r })) }
    },
    async update(id, patch) {
      await wait(350)
      const row = find(id)
      if (!row) throw new Error('Serviço não encontrado.')
      if (row.cr40f_id === BLOCKED_ID) throw new Error('Sem permissão para alterar este serviço.')
      for (const [key, value] of Object.entries(patch)) {
        if (key.endsWith(BIND_SUFFIX)) {
          const found = binds.find(([, bind]) => bind.nav === key.slice(0, -BIND_SUFFIX.length))
          const target = /\(([^)]+)\)\s*$/.exec(String(value))?.[1]
          const option = found && target ? MOCK_LOOKUPS[found[0]].find((o) => same(o.id, target)) : undefined
          if (!found || !option) throw new Error('Registro relacionado não encontrado.')
          row[`_${found[0]}_value`] = option.id
          row[`_${found[0]}_value@OData.Community.Display.V1.FormattedValue`] = option.nome
        } else apply(row, key, value)
      }
    },
    async clearLookup(id, attribute) {
      await wait(350)
      const row = find(id)
      if (!row) throw new Error('Serviço não encontrado.')
      if (row.cr40f_id === BLOCKED_ID) throw new Error('Sem permissão para alterar este serviço.')
      row[`_${attribute}_value`] = null
      delete row[`_${attribute}_value@OData.Community.Display.V1.FormattedValue`]
    },
    async lookupBind(attribute) {
      const bind = MOCK_BINDS[attribute]
      if (!bind) throw new Error(`Relação de ${attribute} não encontrada na metadata.`)
      return bind
    },
    async setState(ids, active) {
      await wait(350)
      const ok: string[] = []
      const failed: { id: string; message: string }[] = []
      for (const id of ids) {
        const row = find(id)
        if (!row) { failed.push({ id, message: 'Serviço não encontrado.' }); continue }
        Object.assign(row, active ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 })
        ok.push(id)
      }
      return { ok, failed }
    },
    async search(attribute, text) {
      await wait(150)
      const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      const q = fold(text.trim())
      return (MOCK_LOOKUPS[attribute] ?? []).filter((o) => fold(o.nome).includes(q))
    },
    async reload(id, _keys) {
      await wait(100)
      const row = find(id)
      if (!row) throw new Error('Serviço não encontrado.')
      return { ...row }
    },
    async copyRows(ids) {
      await wait(150)
      return ids.flatMap((id) => { const row = find(id); return row ? [{ ...row }] : [] })
    },
    openForm: async () => 'mock',
    openVoucher: () => null,
    escalaFdsUrl: () => null,
    kv: browserKV(),
  }
}

export function createSource(host: Host, options: SourceOptions = {}): Source {
  if (host.mode === 'mock') return createMockSource(options)

  let setPromise: Promise<string> | null = null
  const entitySet = () => (setPromise ??= host.metadata.entities([ENTITY]).then((info) => {
    const value = info.get(ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY} não encontrada na metadata.`)
    return value
  }).catch((error) => { setPromise = null; throw error }))

  const attributes = async (entity: string): Promise<AttributeMap> => {
    const list = await host.metadata.attributes(entity)
    const infos = await Promise.all(list.map(async (attribute): Promise<AttributeInfo> => {
      if (attribute.type === 'Boolean') return { ...attribute, options: [{ value: 1, label: 'Sim' }, { value: 0, label: 'Não' }] }
      if (attribute.type === 'Picklist') return { ...attribute, options: await host.metadata.choices(entity, attribute.logicalName).catch(() => []) }
      return { ...attribute, options: [] }
    }))
    return new Map(infos.map((info) => [info.logicalName, info]))
  }

  const binds = new Map<string, Promise<LookupBind>>()
  const lookupBind = (attribute: string) => {
    let bind = binds.get(attribute)
    if (!bind) {
      bind = (async () => {
        const rel = await host.client.request<{ value: { ReferencingEntityNavigationPropertyName: string; ReferencedEntity: string }[] }>(relationshipPath(attribute))
        const relation = rel.value[0]
        if (!relation?.ReferencingEntityNavigationPropertyName || !relation.ReferencedEntity) throw new Error(`Relação de ${attribute} não encontrada na metadata.`)
        return { nav: relation.ReferencingEntityNavigationPropertyName, set: (await host.metadata.entity(relation.ReferencedEntity)).entitySetName }
      })()
      bind.catch(() => binds.delete(attribute))
      binds.set(attribute, bind)
    }
    return bind
  }

  const formUrl = (json: string) => `${host.clientUrl}/WebResources/${FORM_WEBRESOURCE}?data=${encodeURIComponent(json)}`

  return {
    mock: false,
    async views() {
      const [system, mine] = await Promise.all(viewsPaths().map((path, index) =>
        host.client.getAll(path).catch((error) => {
          // Visões pessoais podem estar fora do alcance (403): segue só com as do sistema.
          if (index === 1) return [] as Row[]
          throw error
        })))
      return mapViews(system, mine)
    },
    async quickFind() {
      try {
        const [first] = await host.client.getAll(quickFindPath())
        return typeof first?.fetchxml === 'string' ? quickFindAttributes(first.fetchxml) : []
      } catch { return [] }
    },
    attributes,
    async page(req) {
      const fetchxml = buildFetch(req.fetchxml, { page: req.page, pageSize: PAGE_SIZE, cookie: req.cookie, sort: req.sort, query: req.query, quickFind: req.quickFind })
      return parsePage(await host.client.request<FetchResponse>(fetchPath(await entitySet(), fetchxml)))
    },
    update: async (id, patch) => host.client.update(await entitySet(), id, patch),
    async clearLookup(id, attribute) {
      const { nav } = await lookupBind(attribute)
      await host.client.request(`${await entitySet()}(${cleanId(id)})/${nav}/$ref`, { method: 'DELETE' })
    },
    lookupBind,
    async setState(ids, active) {
      const set = await entitySet()
      const patch = active ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 }
      const results = await Promise.allSettled(ids.map((id) => host.client.update(set, id, patch)))
      const ok: string[] = []
      const failed: { id: string; message: string }[] = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') ok.push(ids[index])
        else failed.push({ id: ids[index], message: message(result.reason) })
      })
      return { ok, failed }
    },
    async search(attribute, text) {
      const target = (await attributes(ENTITY)).get(attribute)?.targets[0]
      if (!target) throw new Error(`Coluna ${attribute} não é um lookup.`)
      const info = await host.metadata.entity(target)
      if (!info.primaryName) throw new Error(`Tabela ${target} sem nome primário na metadata.`)
      const idAttribute = `${target}id`
      const body = await host.client.request<{ value: Row[] }>(searchPath(info.entitySetName, idAttribute, info.primaryName, text))
      return body.value.map((r) => ({ id: cleanId(String(r[idAttribute] ?? '')), nome: formatted(r, info.primaryName) }))
    },
    async reload(id, keys) {
      return host.client.request<Row>(reloadPath(await entitySet(), id, keys))
    },
    async copyRows(ids) {
      const set = await entitySet()
      const blocks = await Promise.all(chunk(ids, 20).map((block) => host.client.getAll(copyPath(set, block, COPY_SELECT))))
      // A consulta em blocos não garante ordem: devolve na ordem dos ids pedidos, como o mock.
      const byId = new Map(blocks.flat().map((row) => [cleanId(String(row[ID_ATTRIBUTE])), row]))
      return ids.flatMap((id) => { const row = byId.get(cleanId(id)); return row ? [row] : [] })
    },
    async openForm(mode, id) {
      const data = { mode, entityName: ENTITY, ...(id ? { id, recordId: id, entityId: id } : {}) }
      // XrmHost.Navigation é Record<string, unknown>: o cast para navigateTo continua necessário.
      const navigation = getHostXrm()?.Navigation as { navigateTo?: (page: object, options: object) => Promise<unknown> } | undefined
      if (host.insideModelDriven && navigation?.navigateTo) {
        await navigation.navigateTo({ pageType: 'webresource', webresourceName: FORM_WEBRESOURCE, data: JSON.stringify(data) }, { target: 1 })
        return 'closed'
      }
      window.open?.(formUrl(JSON.stringify(data)), '_blank', 'noopener')
      return 'external'
    },
    openVoucher: (ids) => `${host.clientUrl}/WebResources/${VOUCHER_WEBRESOURCE}?ids=${encodeURIComponent(JSON.stringify(ids))}&cacheBust=${Date.now()}`,
    escalaFdsUrl: () => `${host.clientUrl}/WebResources/${ESCALA_FDS_WEBRESOURCE}`,
    kv: browserKV(),
  }
}
