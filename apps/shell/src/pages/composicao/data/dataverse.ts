import { analyzeFormula, decimal, decimalString, evaluateFormulaSet, FORMULA_ENGINE_VERSION, FormulaError } from '../formula'
import type { ViewQuery } from './views'
import { buildCountQuery, fetchPageSize, hasBaseAttributes, nextFetchXmlPage, withBaseAttributes, withFetchPageSize } from './composition-query'
import { isWritableMoneyField, moneyFields, type ApplyCellInputResult, type CellFormula, type CellInput, type Composition, type DecimalString, type MoneyField } from './compositions'
import { getMockRows, saveMockCell } from './mock-store'
import { getXrmHost, type XrmWebApi } from './xrm'
import { logDataverseFailure } from '@betinhos/ui/error-logger'

type DataverseEntity = Record<string, unknown>
type DataversePage = { entities: DataverseEntity[]; nextLink?: string }

const compositionTable = 'cr40f_composicaodeprecos'
const reservationTable = 'cr40f_reservadeveculos'
const clientTable = 'cr40f_clientes1'
const formulaTable = 'new_formuladecelulacomposicao'
const applyCellInputAction = 'new_AplicarEntradaCelulaComposicao'
const formatted = '@OData.Community.Display.V1.FormattedValue'
const PAGE_SIZE = 100

function toQueryOptions(nextLink: string) {
  if (nextLink.startsWith('?')) return nextLink
  const queryStart = nextLink.indexOf('?')
  if (queryStart >= 0) return nextLink.slice(queryStart)
  throw new Error('O Dataverse retornou um link de continuação inválido.')
}

function getWebApiOrNull() {
  return getXrmHost()?.WebApi ?? null
}

function getWebApi() {
  const api = getWebApiOrNull()
  if (!api) throw new Error('Abra esta tela pelo Dataverse. A API Xrm.WebApi não está disponível.')
  return api
}

export function getDataverseUrl() {
  const utility = getXrmHost()?.Utility
  if (!utility) throw new Error('O contexto do Dataverse não está disponível.')
  return utility.getGlobalContext().getClientUrl().replace(/\/+$/, '')
}

export function getDataverseEnvironmentLabel() {
  const hostname = new URL(getDataverseUrl()).hostname.toLocaleLowerCase('en-US')
  if (['org23b93544.crm2.dynamics.com', 'cpq--samcrmlivesg624.crm2.dynamics.com'].includes(hostname)) return 'DEV'
  if (['orgf261ae8e.crm2.dynamics.com', 'cpq--samcrmlivesg628.crm2.dynamics.com'].includes(hostname)) return 'PROD'
  if (/(^|[-.])dev([-.]|$)|-dev\./.test(hostname)) return 'DEV'
  if (/(^|[-.])prod([-.]|$)|-prod\./.test(hostname)) return 'PROD'
  return 'Dataverse'
}

export async function inspectCompositionsForOp(ids: string[]) {
  const api = getWebApi()
  const services = new Set<string>()
  const withoutService: string[] = []
  const readErrors: string[] = []
  await Promise.all(ids.map(async (id) => {
    try {
      const row = await api.retrieveRecord(compositionTable, id, '?$select=_cr40f_servicorelacionadogeral_value,cr40f_id')
      const serviceId = row._cr40f_servicorelacionadogeral_value
      if (typeof serviceId === 'string' && serviceId) services.add(serviceId.replace(/[{}]/g, '').toLowerCase())
      else withoutService.push(String(row.cr40f_id ?? id))
    } catch { readErrors.push(id) }
  }))
  const eligible: string[] = []
  const existing: string[] = []
  await Promise.all([...services].map(async (id) => {
    try {
      const row = await api.retrieveRecord(reservationTable, id, '?$select=_cr40f_financeiro_value,cr40f_id')
      if (row._cr40f_financeiro_value) existing.push(String(row.cr40f_id ?? id))
      else eligible.push(id)
    } catch { readErrors.push(id) }
  }))
  return { eligible, existing, withoutService, readErrors }
}

export async function getOpFlowUrl() {
  const api = getWebApi()
  const name = 'new_FlowUrlCriarOP'
  const values = await api.retrieveMultipleRecords('environmentvariablevalue', `?$select=value&$expand=EnvironmentVariableDefinitionId($select=schemaname)&$filter=EnvironmentVariableDefinitionId/schemaname eq '${name}'`)
  const value = values.entities.find((row) => typeof row.value === 'string' && row.value)
  if (value) return String(value.value)
  const definitions = await api.retrieveMultipleRecords('environmentvariabledefinition', `?$select=defaultvalue&$filter=schemaname eq '${name}'`)
  const fallback = definitions.entities[0]?.defaultvalue
  if (typeof fallback !== 'string' || !fallback) throw new Error(`Variável de ambiente ${name} não configurada.`)
  return fallback
}

export async function triggerOpFlow(url: string, ids: string[]) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guids: ids.join(',') }) })
  if (response.status !== 200 && response.status !== 202) throw new Error(`Flow retornou HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
}

export async function deleteCompositions(ids: string[], onProgress?: (completed: number, total: number) => void) {
  const api = getWebApi()
  const succeeded: string[] = []
  const failed: { id: string; message: string }[] = []
  for (const [index, id] of ids.entries()) {
    try { await api.deleteRecord(compositionTable, id); succeeded.push(id) }
    catch (error) {
      failed.push({ id, message: error instanceof Error ? error.message : String(error) })
      void logDataverseFailure({ method: 'DELETE', path: `${compositionTable}(${id})`, error, component: 'ExcluirComposicoes', detailId: id, detailType: compositionTable })
    }
    onProgress?.(index + 1, ids.length)
  }
  return { succeeded, failed }
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.length ? value : fallback
}

function batches<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

function decimalValue(value: unknown): DecimalString {
  if (typeof value !== 'number' && typeof value !== 'string') return '0.00'
  try { return decimalString(decimal(String(value))) } catch { return '0.00' }
}

async function loadFormulaMaps(compositionIds: string[]) {
  const api = getWebApi()
  const maps = new Map<string, Partial<Record<MoneyField, CellFormula>>>()
  const pages = await Promise.all(batches(compositionIds, 40).map((ids) => {
    const filter = ids.map((id) => `_new_composicao_value eq ${id}`).join(' or ')
    return api.retrieveMultipleRecords(formulaTable, `?$select=_new_composicao_value,new_campodestino,new_expressao,new_versaomotor,versionnumber&$filter=statecode eq 0 and (${filter})`)
  }))
  pages.forEach(({ entities }) => entities.forEach((row) => {
    const compositionId = typeof row._new_composicao_value === 'string' ? row._new_composicao_value : null
    const field = typeof row.new_campodestino === 'string' && moneyFields.some(({ key }) => key === row.new_campodestino) ? row.new_campodestino as MoneyField : null
    if (!compositionId || !field || typeof row.new_expressao !== 'string') return
    const current = maps.get(compositionId) ?? {}
    current[field] = {
      expression: row.new_expressao,
      engineVersion: FORMULA_ENGINE_VERSION,
      rowVersion: typeof row.versionnumber === 'string' ? row.versionnumber : undefined,
    }
    maps.set(compositionId, current)
  }))
  return maps
}

/** FetchXML não traz nextLink no Xrm.WebApi; a próxima página vem do paging cookie. */
function nextFetchXmlLink(query: string, result: { entities: unknown[]; fetchXmlPagingCookie?: string }) {
  if (!query.startsWith('?fetchXml=')) return null
  const fetchXml = decodeURIComponent(query.slice('?fetchXml='.length))
  // O tamanho da página é o count do próprio FetchXML (views nativas costumam trazer 25/50); comparar com PAGE_SIZE encerrava a paginação cedo.
  if (result.entities.length < fetchPageSize(fetchXml, PAGE_SIZE)) return null
  const next = nextFetchXmlPage(fetchXml, result.fetchXmlPagingCookie)
  return next ? `?fetchXml=${encodeURIComponent(next)}` : null
}

export type CompositionPage = {
  records: Composition[]
  source: 'dataverse' | 'mock'
  nextLink: string | null
}

export type CompositionTotalRow = Pick<Composition, 'id' | 'client' | 'route' | 'departureAt' | 'values'>

export async function loadStatusColors(): Promise<Record<string, string>> {
  if (!getWebApiOrNull()) return {}
  const url = `${getDataverseUrl()}/api/data/v9.2/EntityDefinitions(LogicalName='${compositionTable}')/Attributes(LogicalName='new_status')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet`
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!response.ok) return {}
  const metadata = await response.json() as { OptionSet?: { Options?: { Value?: number; Color?: string }[] } }
  return Object.fromEntries((metadata.OptionSet?.Options ?? []).filter((option) => option.Value !== undefined && /^#[0-9a-f]{6}$/i.test(option.Color ?? '')).map((option) => [String(option.Value), option.Color!]))
}

export async function enrichCompositionClients(records: Composition[]) {
  const api = getWebApiOrNull()
  if (!api) return records
  const clientIds = [...new Set(records.map((record) => record.clientId).filter((id): id is string => typeof id === 'string'))]
  const clients = new Map<string, DataverseEntity>()
  const clientPages = await Promise.all(batches(clientIds, 50).map((ids) => {
    const filter = ids.map((id) => `cr40f_clientes1id eq ${id}`).join(' or ')
    return api.retrieveMultipleRecords(clientTable, `?$select=cr40f_clientes1id,cr40f_nomedocliente,cr40f_registro,cr40f_endereco&$filter=${encodeURIComponent(`(${filter})`)}`)
  }))
  clientPages.forEach((related) => {
    related.entities.forEach((row) => {
      if (typeof row.cr40f_clientes1id === 'string') clients.set(row.cr40f_clientes1id, row)
    })
  })
  return records.map((record) => {
    const client = record.clientId ? clients.get(record.clientId) : undefined
    if (!client) return record
    return {
      ...record,
      client: stringValue(client.cr40f_nomedocliente, record.client),
      clientRegistration: stringValue(client.cr40f_registro, ''),
      clientAddress: stringValue(client.cr40f_endereco, ''),
    }
  })
}

export async function loadCompositions(nextLink?: string, view?: ViewQuery): Promise<CompositionPage> {
  const api = getWebApiOrNull()
  if (!api) return { records: getMockRows(), source: 'mock', nextLink: null }
  const selectedMoney = moneyFields.map(({ key }) => key)
  const baseAttributes = ['cr40f_composicaodeprecosid', 'cr40f_servicorelacionadogeral', 'new_status', 'new_dataehorariodesaidacalculado', 'versionnumber', ...selectedMoney]
  const viewFetchXml = view ? 'fetchXml' in view ? view.fetchXml : view.sourceFetchXml : undefined
  // A consulta da view já pede os atributos base da linha; assim a releitura por lote (uma ida a mais ao servidor por página) só é necessária para views sem FetchXML.
  const gridFetchXml = viewFetchXml ? withBaseAttributes(viewFetchXml, baseAttributes) ?? viewFetchXml : undefined
  const query = nextLink ? toQueryOptions(nextLink) : gridFetchXml ? `?fetchXml=${encodeURIComponent(withFetchPageSize(gridFetchXml, PAGE_SIZE))}` : view && !('fetchXml' in view) ? `?${view.kind === 'personal' ? 'userQuery' : 'savedQuery'}=${view.id}` : `?$select=cr40f_composicaodeprecosid,_cr40f_servicorelacionadogeral_value,new_status,new_dataehorariodesaidacalculado,${selectedMoney.join(',')}&$filter=statecode eq 0&$orderby=modifiedon desc`
  // Em FetchXML o tamanho vem do count; maxPageSize faz o Dataverse ignorar page/paging-cookie e repetir a página 1.
  const result = await api.retrieveMultipleRecords(compositionTable, query, query.startsWith('?fetchXml=') ? undefined : PAGE_SIZE)
  const viewRows = result.entities
  const detailsIncluded = !view || (query.startsWith('?fetchXml=') && hasBaseAttributes(decodeURIComponent(query.slice('?fetchXml='.length)), baseAttributes))
  const compositionRows = !detailsIncluded ? (await Promise.all(batches(viewRows.map((row) => String(row.cr40f_composicaodeprecosid)), 40).map(async (ids) => {
    if (!ids.length) return []
    const filter = ids.map((id) => `cr40f_composicaodeprecosid eq ${id}`).join(' or ')
    const details = await api.retrieveMultipleRecords(compositionTable, `?$select=cr40f_composicaodeprecosid,_cr40f_servicorelacionadogeral_value,new_status,new_dataehorariodesaidacalculado,${selectedMoney.join(',')}&$filter=${encodeURIComponent(`(${filter})`)}`)
    return details.entities
  }))).flat() : viewRows
  const detailById = new Map(compositionRows.map((row) => [String(row.cr40f_composicaodeprecosid), row]))
  const orderedRows = view ? viewRows.map((row) => detailById.get(String(row.cr40f_composicaodeprecosid))).filter((row): row is DataverseEntity => Boolean(row)) : compositionRows
  const reservationIds = [...new Set(compositionRows
    .map((row) => row._cr40f_servicorelacionadogeral_value)
    .filter((id): id is string => typeof id === 'string'))]
  const reservations = new Map<string, DataverseEntity>()

  const formulaMapsPromise = loadFormulaMaps(orderedRows.map((row) => String(row.cr40f_composicaodeprecosid)))
  const reservationPagesPromise = Promise.all(batches(reservationIds, 50).map((ids) => {
    const filter = ids.map((id) => `cr40f_reservadeveculosid eq ${id}`).join(' or ')
    return api.retrieveMultipleRecords(
      reservationTable,
      `?$select=cr40f_reservadeveculosid,cr40f_trajeto,cr40f_dataehorriodesada,_cr40f_cliente_value,cr40f_status,cr40f_tipodoservico,cr40f_tipodeveiculo,_cr40f_passageiro1_value,_cr40f_passageiro2_value,_cr40f_passageiro3_value,_cr40f_passageiro4_value&$filter=${encodeURIComponent(`(${filter})`)}`,
    )
  }))
  const [formulaMaps, reservationPages] = await Promise.all([formulaMapsPromise, reservationPagesPromise])
  reservationPages.forEach((related) => {
    related.entities.forEach((row) => {
      if (typeof row.cr40f_reservadeveculosid === 'string') reservations.set(row.cr40f_reservadeveculosid, row)
    })
  })

  const viewById = new Map(viewRows.map((row) => [String(row.cr40f_composicaodeprecosid), row]))
  const records = orderedRows.map((row) => {
    const reservation = reservations.get(String(row._cr40f_servicorelacionadogeral_value ?? ''))
    const clientId = typeof reservation?._cr40f_cliente_value === 'string' ? reservation._cr40f_cliente_value : null
    const id = String(row.cr40f_composicaodeprecosid)
    const values = Object.fromEntries(selectedMoney.map((key) => [key, decimalValue(row[key])]) as [MoneyField, DecimalString][]) as Record<MoneyField, DecimalString>
    const statusLabel = row[`new_status${formatted}`]
    const date = row.new_dataehorariodesaidacalculado ?? reservation?.cr40f_dataehorriodesada
    const clientLabel = reservation?.[`_cr40f_cliente_value${formatted}`]
    return {
      id,
      viewFields: viewById.get(id),
      clientId,
      serviceId: typeof row._cr40f_servicorelacionadogeral_value === 'string' ? row._cr40f_servicorelacionadogeral_value : null,
      client: stringValue(clientLabel, 'Cliente sem nome'),
      clientRegistration: '',
      clientAddress: '',
      route: stringValue(reservation?.cr40f_trajeto, 'Trajeto não informado'),
      departureAt: typeof date === 'string' ? date : '',
      status: typeof statusLabel === 'string' && statusLabel.toLocaleLowerCase('pt-BR').startsWith('conclu') ? 'Concluído' as const : 'Pendente' as const,
      serviceStatus: stringValue(reservation?.[`cr40f_status${formatted}`], ''),
      serviceType: stringValue(reservation?.[`cr40f_tipodoservico${formatted}`], ''),
      vehicleType: stringValue(reservation?.[`cr40f_tipodeveiculo${formatted}`], ''),
      passengers: [1, 2, 3, 4].map((index) => reservation?.[`_cr40f_passageiro${index}_value${formatted}`]).filter((name): name is string => typeof name === 'string' && name.length > 0),
      values,
      formulas: formulaMaps.get(id) ?? {},
      rowVersion: typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : String(row.versionnumber ?? ''),
    }
  })
  return { records, source: 'dataverse', nextLink: result.nextLink ?? nextFetchXmlLink(query, result) }
}

/** Total de composições da consulta atual; null quando a view não permite agregação ou o limite é excedido. */
export async function countCompositions(view?: ViewQuery): Promise<number | null> {
  const api = getWebApiOrNull()
  if (!api) return null
  const source = !view
    ? `<fetch><entity name="${compositionTable}"><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>`
    : 'fetchXml' in view ? view.fetchXml : view.sourceFetchXml
  const fetchXml = source ? buildCountQuery(source) : null
  if (!fetchXml) return null
  try {
    const result = await api.retrieveMultipleRecords(compositionTable, `?fetchXml=${encodeURIComponent(fetchXml)}`)
    const total = Number(result.entities[0]?.total)
    return Number.isFinite(total) ? total : null
  } catch {
    return null
  }
}

export async function loadCompositionById(id: string): Promise<Composition | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('ID da composição inválido.')
  const fetchXml = `<fetch top="1"><entity name="${compositionTable}"><all-attributes/><filter><condition attribute="cr40f_composicaodeprecosid" operator="eq" value="${id}"/></filter></entity></fetch>`
  const page = await loadCompositions(undefined, { fetchXml })
  return page.records[0]
}

export async function applyCompositionCellInput(
  row: Composition,
  field: MoneyField,
  input: CellInput,
  source: 'dataverse' | 'mock',
): Promise<ApplyCellInputResult> {
  if (!isWritableMoneyField(field)) throw new FormulaError('FIELD_NOT_WRITABLE', `${moneyFields.find(({ key }) => key === field)?.label ?? field} é calculado pelo Dataverse e não pode ser editado.`)

  if (source === 'mock') {
    const formulas = Object.fromEntries(Object.entries(row.formulas).map(([key, formula]) => [key, formula?.expression])) as Partial<Record<MoneyField, string>>
    const formulaChanges: ApplyCellInputResult['formulas'] = {}
    const nextValues = { ...row.values }
    if (input.kind === 'formula') {
      const expression = analyzeFormula(input.expression).expression
      formulas[field] = expression
      formulaChanges[field] = { expression, engineVersion: FORMULA_ENGINE_VERSION }
    } else {
      delete formulas[field]
      nextValues[field] = input.value
      formulaChanges[field] = null
    }
    const evaluated = evaluateFormulaSet(formulas, nextValues)
    const result: ApplyCellInputResult = {
      rowId: row.id,
      rowVersion: `${row.rowVersion || row.id}:next`,
      updatedValues: evaluated.values,
      formulas: formulaChanges,
    }
    saveMockCell(row, field, result)
    return result
  }

  const online = getWebApi().online
  if (!online?.execute) throw new Error('Xrm.WebApi.online.execute não está disponível.')
  const canonical = input.kind === 'formula' ? analyzeFormula(input.expression).expression : null
  const request = {
    entity: { entityType: compositionTable, id: row.id },
    TargetField: field,
    InputKind: input.kind === 'formula' ? 1 : 0,
    LiteralValue: input.kind === 'literal' ? input.value : null,
    CanonicalExpression: canonical,
    ExpectedRowVersion: row.rowVersion,
    ClientEngineVersion: FORMULA_ENGINE_VERSION,
    getMetadata: () => ({
      boundParameter: 'entity',
      operationName: applyCellInputAction,
      operationType: 0,
      parameterTypes: {
        entity: { typeName: 'mscrm.cr40f_composicaodeprecos', structuralProperty: 5 },
        TargetField: { typeName: 'Edm.String', structuralProperty: 1 },
        InputKind: { typeName: 'Edm.Int32', structuralProperty: 1 },
        LiteralValue: { typeName: 'Edm.String', structuralProperty: 1 },
        CanonicalExpression: { typeName: 'Edm.String', structuralProperty: 1 },
        ExpectedRowVersion: { typeName: 'Edm.String', structuralProperty: 1 },
        ClientEngineVersion: { typeName: 'Edm.Int32', structuralProperty: 1 },
      },
    }),
  }
  const response = await online.execute(request)
  const body = await response.json()
  if (!response.ok) throw new Error(typeof body.error === 'object' && body.error && 'message' in body.error ? String(body.error.message) : 'Falha ao aplicar valor no Dataverse.')
  return {
    rowId: row.id,
    rowVersion: String(body.NewRowVersion ?? ''),
    updatedValues: JSON.parse(String(body.UpdatedCellsJson ?? '{}')),
    formulas: JSON.parse(String(body.FormulaStateJson ?? '{}')),
  }
}
