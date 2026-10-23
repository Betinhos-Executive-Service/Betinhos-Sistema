import { chunk, cleanId, formatted, getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { browserKV } from '../../pagantes/data/source'
import type { KV } from '../domain/columns'
import { auditoriaData, dayWindow, programarPatch, type Motorista } from '../domain/commands'
import { COPY_SELECT } from '../domain/copy'
import { buildCountFetch, buildFetch, quickFindAttributes } from '../domain/fetch'
import { buildSearch, searchKind, type SearchCondition, type SearchField } from '../domain/search'
import { parseLinkJson, type LinkResult } from '../domain/link'
import { parseLinkCadastroJson, type LinkCadastroResult } from '../domain/linkCadastro'
import { formatDateTime, formatMoney } from '../domain/format'
import { ENTITY, ID_ATTRIBUTE, PAGE_SIZE, type AttributeInfo, type AttributeMap, type LookupBind, type LookupOption, type Page, type Sort, type View } from '../domain/types'
import { MOCK_ATTRIBUTES, MOCK_BINDS, MOCK_LOOKUPS, applyMockFetch, createMockRows, createMockViews } from './mock'
import { contagemPath, copyPath, envVarDefaultPath, envVarPath, motoristasPath, fetchPath, lookupIdsPath, mapViews, parseCount, parsePage, quickFindPath, relationshipPath, reloadPath, searchPath, viewsPaths, type FetchResponse } from './queries'

export const FORM_WEBRESOURCE = 'new_formulario_geral.html'
export const VOUCHER_WEBRESOURCE = 'cr40f_VoucherConfirmacao.html'
export const ESCALA_FDS_WEBRESOURCE = 'cr40f_EscalaFDS.html'
export const AUDITORIA_WEBRESOURCE = 'new_betinhos_AuditoriaViewer'
export const ERRO_OPERACIONAL_WEBRESOURCE = 'new_gestao_erros_operacionais.html'
export const FUNCIONARIOS_ENTITY = 'cr40f_funcionarios'

/** `signal` cancela a requisição quando a tela troca de contexto (visão, busca, ordem): libera a conexão para a consulta nova. */
export type PageRequest = { fetchxml: string; page: number; cookie: string | null; sort: Sort; query: string; quickFind: string[]; signal?: AbortSignal }
export type CountRequest = { fetchxml: string; query: string; quickFind: string[]; signal?: AbortSignal }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  views(): Promise<View[]>
  /** Código do tipo da tabela (`object` do layoutxml), lido da metadata. */
  objectTypeCode(): Promise<number>
  /** Visão pessoal nova (`userqueries`); devolve a visão já no formato da lista. */
  createView(input: { name: string; fetchxml: string; layoutxml: string }): Promise<View>
  updateView(id: string, input: { fetchxml: string; layoutxml: string }): Promise<void>
  renameView(id: string, name: string): Promise<void>
  deleteView(id: string): Promise<void>
  quickFind(): Promise<string[]>
  attributes(entity: string): Promise<AttributeMap>
  /** Uma página; `total` só vem quando sai de graça (mock e Dataverse não contam junto com a página). */
  page(req: PageRequest): Promise<Page>
  /** Total de linhas da visão (com a busca), numa consulta agregada à parte; `null` quando a contagem falha ou é cancelada. */
  count(req: CountRequest): Promise<number | null>
  update(id: string, patch: Row): Promise<void>
  clearLookup(id: string, attribute: string): Promise<void>
  lookupBind(attribute: string): Promise<LookupBind>
  setState(ids: string[], active: boolean): Promise<{ ok: string[]; failed: { id: string; message: string }[] }>
  search(attribute: string, text: string): Promise<LookupOption[]>
  reload(id: string, keys: string[]): Promise<Row>
  copyRows(ids: string[]): Promise<Row[]>
  /** Dentro do model-driven navega para o formulário e devolve `closed` ao voltar; fora, devolve `external` e a página o abre em `formUrl` (iframe no shell). */
  openForm(mode: 'create' | 'edit', id?: string): Promise<'closed' | 'external' | 'mock'>
  /** URL do Formulário Geral para o iframe do shell (`host=shell` faz o formulário avisar ao fechar); `null` em mock. */
  formUrl(mode: 'create' | 'edit', id?: string): string | null
  /** URL do iframe do voucher; `null` em mock. */
  openVoucher(ids: string[]): string | null
  /** Gera o link de acompanhamento (Custom API `new_GerarLinkAcompanhamento`). */
  gerarLink(reservaId: string): Promise<LinkResult>
  /** Gera o link de cadastro de passageiros (Custom API `new_GerarLinkCadastro`). */
  gerarLinkCadastro(reservaId: string, passageiroId?: string): Promise<LinkCadastroResult>
  escalaFdsUrl(): string | null
  /** URL do fluxo (variável de ambiente: valor atual, depois padrão); `null` quando não configurada. */
  flowUrl(schema: string): Promise<string | null>
  /** POST JSON no fluxo (outro host: `fetch` direto, sem o cliente Dataverse). */
  triggerFlow(url: string, body: unknown): Promise<{ status: number }>
  /** Marca como Programado; falhas por serviço, sem abortar os demais. */
  programar(ids: string[]): Promise<{ ok: string[]; failed: { id: string; message: string }[] }>
  openAuditoria(ids: string[]): Promise<'closed' | 'external' | 'mock'>
  /** URL do visualizador de auditoria para o fallback fora do model-driven; `null` em mock. */
  auditoriaUrl(ids: string[]): string | null
  openErroOperacional(id: string): Promise<'closed' | 'external' | 'mock'>
  /** Reservas com motorista no dia (yyyy-mm-dd, São Paulo) e a lista de motoristas ativos. */
  contagem(day: string): Promise<{ reservas: Row[]; motoristas: Motorista[] }>
  kv: KV
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const same = (a: string, b: string) => cleanId(a) === cleanId(b)

function settle(ids: string[], results: PromiseSettledResult<unknown>[]) {
  const ok: string[] = []
  const failed: { id: string; message: string }[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') ok.push(ids[index])
    else failed.push({ id: ids[index], message: message(result.reason) })
  })
  return { ok, failed }
}

export const VIEW_DESCRIPTION = 'Criada no Sistema Betinhos'
export const MOCK_OBJECT_TYPE_CODE = 10580

const BLOCKED_ID = 'OS-1013'
const BIND_SUFFIX = '@odata.bind'
const LOOKUP_IDS = 10

/** Opções do mock. `latency` multiplica as esperas simuladas (1 = as de `pnpm dev`; 0 = resposta imediata, para testes). */
export type SourceOptions = { latency?: number }

function createMockSource({ latency = 1 }: SourceOptions = {}): Source {
  const wait = (ms: number) => (latency === 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms * latency)))
  const now = new Date()
  const rows = createMockRows(now)
  const find = (id: string) => rows.find((r) => same(String(r.cr40f_reservadeveculosid), id))
  const binds = Object.entries(MOCK_BINDS)
  // Visões pessoais vivem em memória enquanto a tela estiver aberta.
  const mine: View[] = []
  let viewSeq = 0
  const findMine = (id: string) => {
    const view = mine.find((v) => v.id === id)
    if (!view) throw new Error('Visão não encontrada ou sem permissão para alterar.')
    return view
  }

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

  const update = async (id: string, patch: Row) => {
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
  }

  return {
    mock: true,
    views: async () => [...createMockViews(), ...mine.map((v) => ({ ...v }))],
    objectTypeCode: async () => MOCK_OBJECT_TYPE_CODE,
    async createView({ name, fetchxml, layoutxml }) {
      await wait(150)
      viewSeq += 1
      const view: View = { id: `mock-minha-${viewSeq}`, nome: name, grupo: 'minhas', fetchxml, layoutxml, padrao: false }
      mine.push(view)
      return { ...view }
    },
    async updateView(id, input) {
      await wait(150)
      Object.assign(findMine(id), input)
    },
    async renameView(id, name) {
      await wait(150)
      findMine(id).nome = name
    },
    async deleteView(id) {
      await wait(150)
      findMine(id)
      mine.splice(mine.findIndex((v) => v.id === id), 1)
    },
    quickFind: async () => ['cr40f_id', 'cr40f_trajeto', 'cr40f_cliente'],
    attributes: async (entity) => (entity === ENTITY ? new Map(MOCK_ATTRIBUTES) : new Map<string, AttributeInfo>()),
    async page(req) {
      await wait(300)
      const page = applyMockFetch(rows, req.fetchxml, { ...req, pageSize: PAGE_SIZE, now: new Date() })
      // Como no Dataverse (sem `returntotalrecordcount`), o total não vem com a página: a tela pede a contagem à parte.
      return { ...page, rows: page.rows.map((r) => ({ ...r })), total: null }
    },
    async count(req) {
      await wait(150)
      return applyMockFetch(rows, req.fetchxml, { ...req, page: 1, pageSize: Number.MAX_SAFE_INTEGER, sort: null, now: new Date() }).total
    },
    update,
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
    formUrl: () => null,
    openVoucher: () => null,
    async gerarLink() {
      await wait(300)
      return { ok: true, link: 'https://acompanhe.mock/abc123', expiraEm: new Date(Date.now() + 86_400_000).toISOString() }
    },
    async gerarLinkCadastro() {
      await wait(300)
      return {
        ok: true, link: 'https://cadastro.mock/c/abc123', expiraEm: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        passageiros: [
          { id: 'p1', nome: 'Ana Souza', foto: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#D9DEE7"/><text x="20" y="25" font-size="14" text-anchor="middle" fill="#3A4150">AS</text></svg>'), telefone: '(11) 98888-7777', email: 'ana@exemplo.com' },
          { id: 'p2', nome: 'Bruno Lima', foto: null, telefone: null, email: null },
        ],
      }
    },
    escalaFdsUrl: () => null,
    flowUrl: async () => 'https://flow.mock/op',
    async triggerFlow() {
      await wait(300)
      return { status: 202 }
    },
    async programar(ids) {
      return settle(ids, await Promise.allSettled(ids.map((id) => update(id, programarPatch()))))
    },
    openAuditoria: async () => 'mock',
    auditoriaUrl: () => null,
    openErroOperacional: async () => 'mock',
    async contagem(day) {
      await wait(200)
      const { start, end } = dayWindow(day)
      const found = rows.filter((r) => r._cr40f_motorista_value && String(r.cr40f_dataehorriodesada) >= start && String(r.cr40f_dataehorriodesada) < end).map((r) => ({ ...r }))
      return { reservas: found, motoristas: MOCK_LOOKUPS.cr40f_motorista.map((o) => ({ id: o.id, nome: o.nome })) }
    },
    kv: browserKV(),
  }
}

export function createSource(host: Host, options: SourceOptions = {}): Source {
  if (host.mode === 'mock') return createMockSource(options)

  let setPromise: Promise<string> | null = null
  let knownSet: string | null = null
  const entitySet = () => (setPromise ??= host.metadata.entities([ENTITY]).then((info) => {
    const value = info.get(ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY} não encontrada na metadata.`)
    knownSet = value
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

  /** IDs por tabela alvo; 10 por tabela mantém a URL do FetchXML abaixo do limite mesmo com termo curto. */
  const lookupIds = async (target: string, term: string) => {
    const info = await host.metadata.entity(target)
    if (!info.primaryName) return []
    const idAttribute = `${target}id`
    const body = await host.client.request<{ value: Row[] }>(lookupIdsPath(info.entitySetName, idAttribute, info.primaryName, term, LOOKUP_IDS))
    return body.value.map((r) => cleanId(String(r[idAttribute] ?? ''))).filter(Boolean)
  }

  /**
   * Condições da busca por tipo de coluna (ver `domain/search.ts`). Só o último termo fica guardado: a página, a contagem e
   * as próximas páginas reaproveitam; termo novo (ou o mesmo depois de outro) resolve os lookups de novo.
   */
  let lastSearch: { key: string; found: Promise<SearchCondition[]> } | null = null

  /** Campos da localização rápida com o tipo de busca; choices de estado e status vêm da metadata do próprio tipo (com cache). */
  const searchFields = async (meta: AttributeMap, quickFind: string[]) =>
    (await Promise.all(quickFind.map(async (attribute): Promise<SearchField | null> => {
      const info = meta.get(attribute)
      const kind = searchKind(info?.type)
      if (!info || !kind) return null
      if (kind === 'text') return { attribute, kind }
      if (kind === 'lookup') return { attribute, kind, targets: info.targets }
      const options = info.type === 'State' || info.type === 'Status'
        ? await host.metadata.choices(ENTITY, attribute, info.type).catch(() => [])
        : info.options
      return { attribute, kind, options }
    }))).filter((field) => field !== null)

  const searchTargets = (meta: AttributeMap, quickFind: string[]) =>
    [...new Set(quickFind.flatMap((attribute) => {
      const info = meta.get(attribute)
      return info && searchKind(info.type) === 'lookup' ? info.targets : []
    }))]

  const resolveSearch = (query: string, quickFind: string[]) => {
    const term = query.trim()
    if (!term || !quickFind.length) return Promise.resolve([])
    const key = [term, ...quickFind].join('\n')
    if (lastSearch?.key === key) return lastSearch.found
    const found = (async () => {
      const meta = await attributes(ENTITY)
      // Choices e IDs dos lookups em paralelo; alvo que falhar (sem permissão, por exemplo) só deixa de buscar por aquele lookup.
      const [fields, ids] = await Promise.all([
        searchFields(meta, quickFind),
        Promise.all(searchTargets(meta, quickFind).map(async (target) => [target, await lookupIds(target, term).catch(() => [] as string[])] as const)),
      ])
      const byTarget = new Map(ids)
      return buildSearch(term, fields, (target) => byTarget.get(target) ?? [])
    })()
    lastSearch = { key, found }
    found.catch(() => { if (lastSearch?.found === found) lastSearch = null })
    return found
  }

  /** Aquece a metadata da busca (choices de estado/status e tabelas dos lookups) para a 1ª busca não esperar por ela (DEV: ~7 s a frio). */
  const warmSearch = (quickFind: string[]) => {
    if (!quickFind.length) return
    void attributes(ENTITY)
      .then((meta) => Promise.all([searchFields(meta, quickFind), ...searchTargets(meta, quickFind).map((target) => host.metadata.entity(target))]))
      .catch(() => {})
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

  const formData = (mode: 'create' | 'edit', id?: string) => ({ mode, entityName: ENTITY, ...(id ? { id, recordId: id, entityId: id } : {}) })

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
    async objectTypeCode() {
      const code = (await host.metadata.entity(ENTITY)).objectTypeCode
      if (code == null) throw new Error(`Código do tipo de ${ENTITY} não encontrado na metadata.`)
      return code
    },
    async createView({ name, fetchxml, layoutxml }) {
      const id = await host.client.create('userqueries', { name, returnedtypecode: ENTITY, querytype: 0, fetchxml, layoutxml, description: VIEW_DESCRIPTION })
      return { id: cleanId(id), nome: name, grupo: 'minhas', fetchxml, layoutxml, padrao: false }
    },
    updateView: (id, input) => host.client.update('userqueries', id, input),
    renameView: (id, name) => host.client.update('userqueries', id, { name }),
    deleteView: (id) => host.client.remove('userqueries', id),
    async quickFind() {
      try {
        const [first] = await host.client.getAll(quickFindPath())
        const fields = typeof first?.fetchxml === 'string' ? quickFindAttributes(first.fetchxml) : []
        warmSearch(fields)
        return fields
      } catch { return [] }
    },
    attributes,
    async page(req) {
      const search = await resolveSearch(req.query, req.quickFind)
      const fetchxml = buildFetch(req.fetchxml, { page: req.page, pageSize: PAGE_SIZE, cookie: req.cookie, sort: req.sort, search })
      return parsePage(await host.client.request<FetchResponse>(fetchPath(await entitySet(), fetchxml), { signal: req.signal }))
    },
    async count(req) {
      try {
        const fetchxml = buildCountFetch(req.fetchxml, { search: await resolveSearch(req.query, req.quickFind) })
        return parseCount(await host.client.request<{ value: Row[] }>(fetchPath(await entitySet(), fetchxml), { signal: req.signal }))
      } catch { return null }
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
      return settle(ids, await Promise.allSettled(ids.map((id) => host.client.update(set, id, patch))))
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
      const data = formData(mode, id)
      // XrmHost.Navigation é Record<string, unknown>: o cast para navigateTo continua necessário.
      const navigation = getHostXrm()?.Navigation as { navigateTo?: (page: object, options: object) => Promise<unknown> } | undefined
      if (host.insideModelDriven && navigation?.navigateTo) {
        await navigation.navigateTo({ pageType: 'webresource', webresourceName: FORM_WEBRESOURCE, data: JSON.stringify(data) }, { target: 1 })
        return 'closed'
      }
      return 'external'
    },
    formUrl: (mode, id) => `${host.clientUrl}/WebResources/${FORM_WEBRESOURCE}?data=${encodeURIComponent(JSON.stringify(formData(mode, id)))}&host=shell`,
    openVoucher: (ids) => `${host.clientUrl}/WebResources/${VOUCHER_WEBRESOURCE}?ids=${encodeURIComponent(JSON.stringify(ids))}&cacheBust=${Date.now()}`,
    async gerarLink(reservaId) {
      const r = await host.client.request<{ new_LinkJson?: string }>('new_GerarLinkAcompanhamento', { method: 'POST', body: JSON.stringify({ new_ReservaId: cleanId(reservaId) }) })
      return parseLinkJson(r?.new_LinkJson)
    },
    async gerarLinkCadastro(reservaId, passageiroId) {
      const body: Record<string, string> = { new_ReservaId: cleanId(reservaId) }
      if (passageiroId) body.new_PassageiroId = cleanId(passageiroId)
      const r = await host.client.request<{ new_LinkJson?: string }>('new_GerarLinkCadastro', { method: 'POST', body: JSON.stringify(body) })
      return parseLinkCadastroJson(r?.new_LinkJson)
    },
    escalaFdsUrl: () => `${host.clientUrl}/WebResources/${ESCALA_FDS_WEBRESOURCE}`,
    async flowUrl(schema) {
      const current = await host.client.request<{ value: Row[] }>(envVarPath(schema))
      const value = current.value[0]?.value
      if (typeof value === 'string' && value.trim()) return value.trim()
      const def = await host.client.request<{ value: Row[] }>(envVarDefaultPath(schema))
      const fallback = def.value[0]?.defaultvalue
      return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : null
    },
    async triggerFlow(url, body) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status }
    },
    async programar(ids) {
      const set = await entitySet()
      return settle(ids, await Promise.allSettled(ids.map((id) => host.client.update(set, id, programarPatch()))))
    },
    async openAuditoria(ids) {
      const data = auditoriaData(ids, await entitySet(), host.clientUrl)
      const navigation = getHostXrm()?.Navigation as { navigateTo?: (page: object, options: object) => Promise<unknown> } | undefined
      if (host.insideModelDriven && navigation?.navigateTo) {
        await navigation.navigateTo(
          { pageType: 'webresource', webresourceName: AUDITORIA_WEBRESOURCE, data: JSON.stringify(data) },
          { target: 2, width: { value: 92, unit: '%' }, height: { value: 88, unit: '%' }, position: 1 },
        )
        return 'closed'
      }
      return 'external'
    },
    auditoriaUrl: (ids) => `${host.clientUrl}/WebResources/${AUDITORIA_WEBRESOURCE}?data=${encodeURIComponent(JSON.stringify(auditoriaData(ids, knownSet ?? `${ENTITY}s`, host.clientUrl)))}`,
    async openErroOperacional(id) {
      const data = `reservaId=${encodeURIComponent(cleanId(id).toLowerCase())}`
      const navigation = getHostXrm()?.Navigation as { navigateTo?: (page: object, options: object) => Promise<unknown> } | undefined
      if (host.insideModelDriven && navigation?.navigateTo) {
        await navigation.navigateTo({ pageType: 'webresource', webresourceName: ERRO_OPERACIONAL_WEBRESOURCE, data }, { target: 1 })
        return 'closed'
      }
      window.open?.(`${host.clientUrl}/WebResources/${ERRO_OPERACIONAL_WEBRESOURCE}?data=${encodeURIComponent(data)}`, '_blank', 'noopener')
      return 'external'
    },
    async contagem(day) {
      const { start, end } = dayWindow(day)
      const [reservas, funcionarios] = await Promise.all([
        entitySet().then((set) => host.client.getAll(contagemPath(set, start, end))),
        host.metadata.entity(FUNCIONARIOS_ENTITY).then((info) => host.client.getAll(motoristasPath(info.entitySetName))),
      ])
      const motoristas = funcionarios
        .filter((row) => /motorista/i.test(formatted(row, 'cr40f_funcao')))
        .map((row): Motorista => ({ id: cleanId(String(row.cr40f_funcionariosid ?? '')), nome: String(row.cr40f_nomecompleto ?? '') }))
      return { reservas, motoristas }
    },
    kv: browserKV(),
  }
}
